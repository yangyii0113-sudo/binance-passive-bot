'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {compactLineageStorage}=require('./lineage_storage_maintenance.js');

const DEFAULT_POLICY=Object.freeze({
  retainedTargetBytes:64*1024*1024,
  compactionTriggerBytes:128*1024*1024,
  activeRotationBytes:32*1024*1024,
  softHighWaterRatio:0.80,
  criticalHighWaterRatio:0.90,
  reserveBytes:32*1024*1024,
  checkpointAuditRecords:256
});

function safeInteger(value,min){return Number.isSafeInteger(value)&&value>=min;}
function ratio(value){return typeof value==='number'&&Number.isFinite(value)&&value>0&&value<1;}
function normalizeLineagePolicy(policy={}){
  if(!policy||typeof policy!=='object'||Array.isArray(policy))throw Error('LINEAGE_STORAGE_POLICY_INVALID');
  const merged={...DEFAULT_POLICY,...policy};
  if(!safeInteger(merged.retainedTargetBytes,1)||
     !safeInteger(merged.compactionTriggerBytes,1)||
     !safeInteger(merged.activeRotationBytes,1)||
     !safeInteger(merged.reserveBytes,0)||
     !safeInteger(merged.checkpointAuditRecords,1)||
     !ratio(merged.softHighWaterRatio)||
     !ratio(merged.criticalHighWaterRatio)||
     merged.softHighWaterRatio>=merged.criticalHighWaterRatio)throw Error('LINEAGE_STORAGE_POLICY_INVALID');
  return Object.freeze(merged);
}
function numeric(value){
  if(typeof value==='bigint')return Number(value);
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}
function filesystemState(directory,fsImpl=fs){
  if(typeof fsImpl.statfsSync!=='function')return null;
  try{
    const stats=fsImpl.statfsSync(directory);
    const blocks=numeric(stats.blocks);
    const bsize=numeric(stats.bsize);
    const bavail=numeric(stats.bavail);
    if(blocks===null||bsize===null||bavail===null||blocks<0||bsize<=0||bavail<0)return null;
    const totalBytes=blocks*bsize;
    const availableBytes=bavail*bsize;
    if(!Number.isFinite(totalBytes)||!Number.isFinite(availableBytes)||totalBytes<=0)return null;
    return Object.freeze({
      totalBytes,
      availableBytes,
      usedRatio:(totalBytes-availableBytes)/totalBytes
    });
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
  const soft=critical||projectedUsedRatio>=normalized.softHighWaterRatio||projectedAvailableBytes<normalized.reserveBytes;
  return Object.freeze({filesystem,soft,critical,projectedAvailableBytes,projectedUsedRatio,policy:normalized});
}
function assertLineageWriteCapacity(options={}){
  const assessment=capacityAssessment(options);
  if(assessment.critical)throw Error('LINEAGE_DISK_HIGH_WATER');
  return assessment;
}
function fileSize(fsImpl,filePath){
  if(!fsImpl.existsSync(filePath))return 0;
  return Number(fsImpl.statSync(filePath).size);
}
function checkpointPathFor(filePath){return filePath.slice(0,-'.lineage.jsonl'.length)+'.lineage.checkpoint.jsonl';}
function maintainLineageStorage({filePath,now=Date.now,fsImpl=fs,policy={}}={}){
  if(typeof filePath!=='string'||!filePath.endsWith('.lineage.jsonl'))throw Error('LINEAGE_JOURNAL_PATH_INVALID');
  if(typeof now!=='function')throw Error('LINEAGE_CLOCK_REQUIRED');
  if(!fsImpl||typeof fsImpl!=='object')throw Error('LINEAGE_FS_REQUIRED');
  const normalized=normalizeLineagePolicy(policy);
  const activeBytes=fileSize(fsImpl,filePath);
  const checkpointBytes=fileSize(fsImpl,checkpointPathFor(filePath));
  const filesystem=filesystemState(path.dirname(filePath),fsImpl);
  const softWater=filesystem!==null&&(
    filesystem.usedRatio>=normalized.softHighWaterRatio||filesystem.availableBytes<normalized.reserveBytes
  );
  const rotationDue=activeBytes>=normalized.activeRotationBytes;
  const compactionDue=activeBytes+checkpointBytes>=normalized.compactionTriggerBytes;
  if(!rotationDue&&!compactionDue&&!softWater){
    return Object.freeze({
      status:'NOOP',reason:'WITHIN_POLICY',
      activeBytes,checkpointBytes,filesystem,policy:normalized
    });
  }
  const result=compactLineageStorage({filePath,now,fsImpl,policy:normalized});
  return Object.freeze({...result,trigger:Object.freeze({rotationDue,compactionDue,softWater}),policy:normalized});
}

module.exports=Object.freeze({
  DEFAULT_POLICY,
  normalizeLineagePolicy,
  capacityAssessment,
  assertLineageWriteCapacity,
  maintainLineageStorage
});
