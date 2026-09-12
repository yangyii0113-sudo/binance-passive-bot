'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {compactLineageStorage}=require('./lineage_storage_maintenance.js');

const DEFAULT_POLICY=Object.freeze({
  retainedTargetBytes:64*1024*1024,
  activeRotationBytes:96*1024*1024,
  compactionTriggerBytes:128*1024*1024,
  softHighWaterRatio:0.80,
  criticalHighWaterRatio:0.90,
  reserveBytes:32*1024*1024,
  checkpointAuditRecords:256
});

function safeInteger(value,min){return Number.isSafeInteger(value)&&value>=min;}
function ratio(value){return typeof value==='number'&&Number.isFinite(value)&&value>0&&value<1;}
function normalizeLineagePolicy(policy={}){
  if(!policy||typeof policy!=='object'||Array.isArray(policy))throw Error('LINEAGE_STORAGE_POLICY_INVALID');
  const value={...DEFAULT_POLICY,...policy};
  if(!safeInteger(value.retainedTargetBytes,1)||
     !safeInteger(value.activeRotationBytes,1)||
     !safeInteger(value.compactionTriggerBytes,1)||
     !safeInteger(value.reserveBytes,0)||
     !safeInteger(value.checkpointAuditRecords,1)||
     !ratio(value.softHighWaterRatio)||
     !ratio(value.criticalHighWaterRatio)||
     value.softHighWaterRatio>=value.criticalHighWaterRatio||
     value.retainedTargetBytes>=value.activeRotationBytes||
     value.activeRotationBytes>value.compactionTriggerBytes)throw Error('LINEAGE_STORAGE_POLICY_INVALID');
  return Object.freeze(value);
}
function numeric(value){
  if(typeof value==='bigint')return Number(value);
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}
function filesystemState(directory,fsImpl=fs){
  if(typeof fsImpl.statfsSync!=='function')return null;
  try{
    const stat=fsImpl.statfsSync(directory);
    const blocks=numeric(stat.blocks),bsize=numeric(stat.bsize),bavail=numeric(stat.bavail);
    if(blocks===null||bsize===null||bavail===null||blocks<=0||bsize<=0||bavail<0)return null;
    const totalBytes=blocks*bsize;
    const availableBytes=bavail*bsize;
    return Object.freeze({totalBytes,availableBytes,usedRatio:(totalBytes-availableBytes)/totalBytes});
  }catch(_error){return null;}
}
function capacityAssessment({filePath,fsImpl=fs,policy={},anticipatedBytes=0}={}){
  if(typeof filePath!=='string'||!filePath.endsWith('.lineage.jsonl'))throw Error('LINEAGE_JOURNAL_PATH_INVALID');
  if(!Number.isSafeInteger(anticipatedBytes)||anticipatedBytes<0)throw Error('LINEAGE_ANTICIPATED_BYTES_INVALID');
  const normalized=normalizeLineagePolicy(policy);
  const filesystem=filesystemState(path.dirname(filePath),fsImpl);
  if(!filesystem)return Object.freeze({filesystem:null,soft:false,critical:false,projectedAvailableBytes:null,projectedUsedRatio:null,policy:normalized});
  const projectedAvailableBytes=Math.max(0,filesystem.availableBytes-anticipatedBytes);
  const projectedUsedRatio=(filesystem.totalBytes-projectedAvailableBytes)/filesystem.totalBytes;
  const critical=projectedUsedRatio>=normalized.criticalHighWaterRatio||projectedAvailableBytes<normalized.reserveBytes;
  const soft=critical||projectedUsedRatio>=normalized.softHighWaterRatio;
  return Object.freeze({filesystem,soft,critical,projectedAvailableBytes,projectedUsedRatio,policy:normalized});
}
function assertLineageWriteCapacity(options={}){
  const assessment=capacityAssessment(options);
  if(assessment.critical)throw Error('LINEAGE_DISK_HIGH_WATER');
  return assessment;
}
function maintainLineageStorage({filePath,now=Date.now,fsImpl=fs,policy={}}={}){
  const normalized=normalizeLineagePolicy(policy);
  let bytes=0;
  try{bytes=fsImpl.existsSync(filePath)?Number(fsImpl.statSync(filePath).size):0;}
  catch(_error){throw Error('LINEAGE_STORAGE_AUDIT_FAILED');}
  const capacity=capacityAssessment({filePath,fsImpl,policy:normalized});
  const rotationDue=bytes>=normalized.activeRotationBytes;
  const compactionDue=bytes>=normalized.compactionTriggerBytes;
  const softWater=capacity.soft===true;
  if(!rotationDue&&!compactionDue&&!softWater){
    return Object.freeze({status:'NOOP',reason:'WITHIN_POLICY',bytes,capacity,policy:normalized});
  }
  const result=compactLineageStorage({filePath,now,fsImpl,policy:normalized});
  return Object.freeze({...result,trigger:Object.freeze({rotationDue,compactionDue,softWater}),policy:normalized});
}

module.exports=Object.freeze({DEFAULT_POLICY,normalizeLineagePolicy,filesystemState,capacityAssessment,assertLineageWriteCapacity,maintainLineageStorage});
