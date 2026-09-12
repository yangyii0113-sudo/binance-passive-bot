'use strict';

const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const EVENT_SCHEMA='foxyya-lineage-event/1';
const EVENT_TYPES=Object.freeze({
  SOURCE:'SOURCE_RECORDED',
  OUTPUT:'OUTPUT_RECORDED'
});
const SCAN_CHUNK_BYTES=64*1024;

function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function finite(value){return typeof value==='number'&&Number.isFinite(value);}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(object(value)){
    const out={};
    for(const key of Object.keys(value).sort())out[key]=stableValue(value[key]);
    return out;
  }
  return value;
}
function stableStringify(value){return JSON.stringify(stableValue(value));}
function sha256(value){return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');}
function eventPayload(event){
  return {schema:event.schema,sequence:event.sequence,type:event.type,recordedAt:event.recordedAt,record:event.record};
}
function validatePath(filePath){
  if(typeof filePath!=='string'||!filePath.endsWith('.lineage.jsonl'))throw Error('LINEAGE_JOURNAL_PATH_INVALID');
  return filePath;
}
function lineagePaths(filePath){
  const activePath=validatePath(filePath);
  const stem=activePath.slice(0,-'.lineage.jsonl'.length);
  return Object.freeze({
    activePath,
    checkpointPath:stem+'.lineage.checkpoint.jsonl',
    checkpointAuditPath:stem+'.lineage.checkpoints.jsonl'
  });
}
function validateEvent(raw,expectedSequence){
  if(!object(raw)||raw.schema!==EVENT_SCHEMA||raw.sequence!==expectedSequence||!finite(raw.recordedAt)||raw.recordedAt<0||!object(raw.record)||typeof raw.checksum!=='string')throw Error('LINEAGE_JOURNAL_CORRUPT');
  if(raw.type!==EVENT_TYPES.SOURCE&&raw.type!==EVENT_TYPES.OUTPUT)throw Error('LINEAGE_JOURNAL_CORRUPT');
  if(raw.checksum!==sha256(eventPayload(raw)))throw Error('LINEAGE_JOURNAL_CORRUPT');
  return raw;
}
function fileSize(fsImpl,filePath){
  if(!fsImpl.existsSync(filePath))return 0;
  const value=fsImpl.statSync(filePath).size;
  return typeof value==='bigint'?Number(value):Number(value);
}
function scanJournal(filePath,fsImpl){
  if(!fsImpl.existsSync(filePath))return Object.freeze({
    bytes:0,eventCount:0,sourceCount:0,outputCount:0,
    bytesByType:Object.freeze({[EVENT_TYPES.SOURCE]:0,[EVENT_TYPES.OUTPUT]:0}),
    largestEventBytes:0,oldestRecordedAt:null,newestRecordedAt:null
  });

  let fd=null;
  let expectedSequence=1;
  let eventCount=0;
  let sourceCount=0;
  let outputCount=0;
  let largestEventBytes=0;
  let oldestRecordedAt=null;
  let newestRecordedAt=null;
  const bytesByType={[EVENT_TYPES.SOURCE]:0,[EVENT_TYPES.OUTPUT]:0};

  function accept(buffer){
    if(!buffer.length||!buffer.toString('utf8').trim())return;
    let raw;
    try{raw=JSON.parse(buffer.toString('utf8'));}
    catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
    validateEvent(raw,expectedSequence);
    expectedSequence+=1;
    eventCount+=1;
    if(raw.type===EVENT_TYPES.SOURCE)sourceCount+=1;
    else outputCount+=1;
    bytesByType[raw.type]+=buffer.length+1;
    if(buffer.length+1>largestEventBytes)largestEventBytes=buffer.length+1;
    if(oldestRecordedAt===null||raw.recordedAt<oldestRecordedAt)oldestRecordedAt=raw.recordedAt;
    if(newestRecordedAt===null||raw.recordedAt>newestRecordedAt)newestRecordedAt=raw.recordedAt;
  }

  try{
    fd=fsImpl.openSync(filePath,'r');
    const chunk=Buffer.allocUnsafe(SCAN_CHUNK_BYTES);
    let filePosition=0;
    let carryParts=[];
    let carryLength=0;
    while(true){
      const bytesRead=fsImpl.readSync(fd,chunk,0,chunk.length,filePosition);
      if(!Number.isInteger(bytesRead)||bytesRead<0)throw Error('LINEAGE_JOURNAL_CORRUPT');
      if(bytesRead===0)break;
      let segmentStart=0;
      for(let i=0;i<bytesRead;i++){
        if(chunk[i]!==0x0a)continue;
        const segment=chunk.subarray(segmentStart,i);
        const length=carryLength+segment.length;
        const line=carryLength?Buffer.concat([...carryParts,segment],length):segment;
        if(length)accept(line);
        carryParts=[];
        carryLength=0;
        segmentStart=i+1;
      }
      if(segmentStart<bytesRead){
        const remainder=Buffer.from(chunk.subarray(segmentStart,bytesRead));
        carryParts.push(remainder);
        carryLength+=remainder.length;
      }
      filePosition+=bytesRead;
    }
    if(carryLength){
      const tail=carryParts.length===1?carryParts[0]:Buffer.concat(carryParts,carryLength);
      try{accept(tail)}catch(error){
        if(error?.message==='LINEAGE_JOURNAL_CORRUPT'){
          try{JSON.parse(tail.toString('utf8'))}catch(_parseError){return Object.freeze({
            bytes:fileSize(fsImpl,filePath),eventCount,sourceCount,outputCount,
            bytesByType:Object.freeze({...bytesByType}),largestEventBytes,oldestRecordedAt,newestRecordedAt
          });}
        }
        throw error;
      }
    }
  }catch(error){
    if(error?.message==='LINEAGE_JOURNAL_CORRUPT')throw error;
    throw Error('LINEAGE_JOURNAL_CORRUPT');
  }finally{
    if(fd!==null){try{fsImpl.closeSync(fd)}catch(_closeError){}}
  }

  return Object.freeze({
    bytes:fileSize(fsImpl,filePath),eventCount,sourceCount,outputCount,
    bytesByType:Object.freeze({...bytesByType}),largestEventBytes,oldestRecordedAt,newestRecordedAt
  });
}
function numeric(value){
  if(typeof value==='bigint')return Number(value);
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}
function filesystemAudit(directory,fsImpl){
  if(typeof fsImpl.statfsSync!=='function')return null;
  try{
    const stats=fsImpl.statfsSync(directory);
    const blocks=numeric(stats.blocks);
    const bsize=numeric(stats.bsize);
    const bavail=numeric(stats.bavail);
    if(blocks===null||bsize===null||bavail===null||blocks<0||bsize<=0||bavail<0)return null;
    const totalBytes=blocks*bsize;
    const availableBytes=bavail*bsize;
    const usedRatio=totalBytes>0?(totalBytes-availableBytes)/totalBytes:null;
    return Object.freeze({totalBytes,availableBytes,usedRatio});
  }catch(_error){return null;}
}
function auditLineageStorage({filePath,fsImpl=fs}={}){
  if(!fsImpl||typeof fsImpl!=='object')throw Error('LINEAGE_FS_REQUIRED');
  const paths=lineagePaths(filePath);
  const checkpoint=scanJournal(paths.checkpointPath,fsImpl);
  const active=scanJournal(paths.activePath,fsImpl);
  const oldestValues=[checkpoint.oldestRecordedAt,active.oldestRecordedAt].filter(finite);
  const newestValues=[checkpoint.newestRecordedAt,active.newestRecordedAt].filter(finite);
  const bytesByType=Object.freeze({
    [EVENT_TYPES.SOURCE]:checkpoint.bytesByType[EVENT_TYPES.SOURCE]+active.bytesByType[EVENT_TYPES.SOURCE],
    [EVENT_TYPES.OUTPUT]:checkpoint.bytesByType[EVENT_TYPES.OUTPUT]+active.bytesByType[EVENT_TYPES.OUTPUT]
  });
  return Object.freeze({
    activeBytes:active.bytes,
    checkpointBytes:checkpoint.bytes,
    totalBytes:active.bytes+checkpoint.bytes,
    eventCount:active.eventCount+checkpoint.eventCount,
    sourceCount:active.sourceCount+checkpoint.sourceCount,
    outputCount:active.outputCount+checkpoint.outputCount,
    bytesByType,
    largestEventBytes:Math.max(active.largestEventBytes,checkpoint.largestEventBytes),
    oldestRecordedAt:oldestValues.length?Math.min(...oldestValues):null,
    newestRecordedAt:newestValues.length?Math.max(...newestValues):null,
    filesystem:filesystemAudit(path.dirname(paths.activePath),fsImpl)
  });
}

module.exports=Object.freeze({auditLineageStorage});
