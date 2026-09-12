'use strict';

const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const EVENT_SCHEMA='foxyya-lineage-event/1';
const CHECKPOINT_SCHEMA='foxyya-lineage-checkpoint/1';
const EVENT_TYPES=Object.freeze({
  SOURCE:'SOURCE_RECORDED',
  OUTPUT:'OUTPUT_RECORDED'
});
const SCAN_CHUNK_BYTES=64*1024;
const DEFAULT_RETAINED_TARGET_BYTES=64*1024*1024;

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
function createEvent({sequence,type,recordedAt,record}){
  const base={schema:EVENT_SCHEMA,sequence,type,recordedAt,record};
  return {...base,checksum:sha256(base)};
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
  return Number(fsImpl.statSync(filePath).size);
}
function emptyScan(startSequence=1){
  return Object.freeze({
    bytes:0,eventCount:0,sourceCount:0,outputCount:0,
    bytesByType:Object.freeze({[EVENT_TYPES.SOURCE]:0,[EVENT_TYPES.OUTPUT]:0}),
    largestEventBytes:0,oldestRecordedAt:null,newestRecordedAt:null,
    startSequence,nextSequence:startSequence,events:Object.freeze([])
  });
}
function scanJournal(filePath,fsImpl,{startSequence=1,collectEvents=false,allowTornTail=true}={}){
  if(!fsImpl.existsSync(filePath))return emptyScan(startSequence);

  let fd=null;
  let expectedSequence=startSequence;
  let eventCount=0;
  let sourceCount=0;
  let outputCount=0;
  let largestEventBytes=0;
  let oldestRecordedAt=null;
  let newestRecordedAt=null;
  const bytesByType={[EVENT_TYPES.SOURCE]:0,[EVENT_TYPES.OUTPUT]:0};
  const events=[];

  function accept(buffer,offset,hasNewline){
    if(!buffer.length||!buffer.toString('utf8').trim())return;
    let raw;
    try{raw=JSON.parse(buffer.toString('utf8'));}
    catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
    validateEvent(raw,expectedSequence);
    const storageBytes=buffer.length+(hasNewline?1:0);
    if(collectEvents){
      const lineageRef=raw.record.lineageRef;
      if(typeof lineageRef!=='string'||!lineageRef)throw Error('LINEAGE_JOURNAL_CORRUPT');
      const sourceLineageRefs=raw.type===EVENT_TYPES.OUTPUT?raw.record.sourceLineageRefs:null;
      if(sourceLineageRefs!==null&&(!Array.isArray(sourceLineageRefs)||sourceLineageRefs.some(ref=>typeof ref!=='string'||!ref)))throw Error('LINEAGE_JOURNAL_CORRUPT');
      events.push(Object.freeze({
        filePath,offset,length:buffer.length,storageBytes,sequence:raw.sequence,type:raw.type,
        recordedAt:raw.recordedAt,lineageRef,sourceLineageRefs:sourceLineageRefs?Object.freeze([...sourceLineageRefs]):null
      }));
    }
    expectedSequence+=1;
    eventCount+=1;
    if(raw.type===EVENT_TYPES.SOURCE)sourceCount+=1;
    else outputCount+=1;
    bytesByType[raw.type]+=storageBytes;
    if(storageBytes>largestEventBytes)largestEventBytes=storageBytes;
    if(oldestRecordedAt===null||raw.recordedAt<oldestRecordedAt)oldestRecordedAt=raw.recordedAt;
    if(newestRecordedAt===null||raw.recordedAt>newestRecordedAt)newestRecordedAt=raw.recordedAt;
  }

  try{
    fd=fsImpl.openSync(filePath,'r');
    const chunk=Buffer.allocUnsafe(SCAN_CHUNK_BYTES);
    let filePosition=0;
    let lineStart=0;
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
        if(length)accept(line,lineStart,true);
        carryParts=[];
        carryLength=0;
        lineStart=filePosition+i+1;
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
      try{accept(tail,lineStart,false)}catch(error){
        if(error?.message==='LINEAGE_JOURNAL_CORRUPT'&&allowTornTail){
          try{JSON.parse(tail.toString('utf8'))}catch(_parseError){
            return Object.freeze({
              bytes:fileSize(fsImpl,filePath),eventCount,sourceCount,outputCount,
              bytesByType:Object.freeze({...bytesByType}),largestEventBytes,oldestRecordedAt,newestRecordedAt,
              startSequence,nextSequence:expectedSequence,events:Object.freeze(events)
            });
          }
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
    bytesByType:Object.freeze({...bytesByType}),largestEventBytes,oldestRecordedAt,newestRecordedAt,
    startSequence,nextSequence:expectedSequence,events:Object.freeze(events)
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
function firstSequence(filePath,fsImpl){
  if(!fsImpl.existsSync(filePath)||fileSize(fsImpl,filePath)===0)return null;
  let fd=null;
  try{
    fd=fsImpl.openSync(filePath,'r');
    const chunk=Buffer.allocUnsafe(SCAN_CHUNK_BYTES);
    const parts=[];
    let total=0;
    let position=0;
    while(true){
      const bytesRead=fsImpl.readSync(fd,chunk,0,chunk.length,position);
      if(!Number.isInteger(bytesRead)||bytesRead<=0)break;
      const newline=chunk.subarray(0,bytesRead).indexOf(0x0a);
      if(newline>=0){
        parts.push(Buffer.from(chunk.subarray(0,newline)));
        total+=newline;
        break;
      }
      parts.push(Buffer.from(chunk.subarray(0,bytesRead)));
      total+=bytesRead;
      position+=bytesRead;
    }
    if(!total)return null;
    const raw=JSON.parse(Buffer.concat(parts,total).toString('utf8'));
    return Number.isInteger(raw.sequence)?raw.sequence:null;
  }catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
  finally{if(fd!==null){try{fsImpl.closeSync(fd)}catch(_closeError){}}}
}
function logicalScans(paths,fsImpl,{collectEvents=false}={}){
  const checkpoint=scanJournal(paths.checkpointPath,fsImpl,{startSequence:1,collectEvents,allowTornTail:false});
  let active=emptyScan(checkpoint.nextSequence);
  let supersededActiveBytes=0;
  if(fsImpl.existsSync(paths.activePath)&&fileSize(fsImpl,paths.activePath)>0){
    const first=firstSequence(paths.activePath,fsImpl);
    if(checkpoint.eventCount>0&&first===1){
      const superseded=scanJournal(paths.activePath,fsImpl,{startSequence:1,collectEvents:false,allowTornTail:true});
      supersededActiveBytes=superseded.bytes;
    }else{
      active=scanJournal(paths.activePath,fsImpl,{startSequence:checkpoint.nextSequence,collectEvents,allowTornTail:true});
    }
  }
  return Object.freeze({checkpoint,active,supersededActiveBytes});
}
function auditLineageStorage({filePath,fsImpl=fs}={}){
  if(!fsImpl||typeof fsImpl!=='object')throw Error('LINEAGE_FS_REQUIRED');
  const paths=lineagePaths(filePath);
  const {checkpoint,active,supersededActiveBytes}=logicalScans(paths,fsImpl);
  const oldestValues=[checkpoint.oldestRecordedAt,active.oldestRecordedAt].filter(finite);
  const newestValues=[checkpoint.newestRecordedAt,active.newestRecordedAt].filter(finite);
  const bytesByType=Object.freeze({
    [EVENT_TYPES.SOURCE]:checkpoint.bytesByType[EVENT_TYPES.SOURCE]+active.bytesByType[EVENT_TYPES.SOURCE],
    [EVENT_TYPES.OUTPUT]:checkpoint.bytesByType[EVENT_TYPES.OUTPUT]+active.bytesByType[EVENT_TYPES.OUTPUT]
  });
  return Object.freeze({
    activeBytes:active.bytes,
    checkpointBytes:checkpoint.bytes,
    supersededActiveBytes,
    totalBytes:active.bytes+checkpoint.bytes,
    physicalBytes:active.bytes+checkpoint.bytes+supersededActiveBytes,
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
function readEvent(meta,fsImpl){
  let fd=null;
  try{
    fd=fsImpl.openSync(meta.filePath,'r');
    const buffer=Buffer.allocUnsafe(meta.length);
    let read=0;
    while(read<buffer.length){
      const count=fsImpl.readSync(fd,buffer,read,buffer.length-read,meta.offset+read);
      if(!Number.isInteger(count)||count<=0)throw Error('LINEAGE_JOURNAL_CORRUPT');
      read+=count;
    }
    const raw=JSON.parse(buffer.toString('utf8'));
    validateEvent(raw,meta.sequence);
    return raw;
  }catch(error){
    if(error?.message==='LINEAGE_JOURNAL_CORRUPT')throw error;
    throw Error('LINEAGE_JOURNAL_CORRUPT');
  }finally{if(fd!==null){try{fsImpl.closeSync(fd)}catch(_closeError){}}}
}
function writeAll(fsImpl,fd,buffer){
  let written=0;
  while(written<buffer.length){
    const count=fsImpl.writeSync(fd,buffer,written,buffer.length-written,null);
    if(!Number.isInteger(count)||count<=0)throw Error('LINEAGE_COMPACTION_WRITE_FAILED');
    written+=count;
  }
}
function digestFile(filePath,fsImpl){
  if(!fsImpl.existsSync(filePath))return null;
  let fd=null;
  try{
    fd=fsImpl.openSync(filePath,'r');
    const hash=crypto.createHash('sha256');
    const chunk=Buffer.allocUnsafe(SCAN_CHUNK_BYTES);
    let position=0;
    while(true){
      const bytesRead=fsImpl.readSync(fd,chunk,0,chunk.length,position);
      if(!Number.isInteger(bytesRead)||bytesRead<0)throw Error('LINEAGE_JOURNAL_CORRUPT');
      if(bytesRead===0)break;
      hash.update(chunk.subarray(0,bytesRead));
      position+=bytesRead;
    }
    return hash.digest('hex');
  }catch(error){
    if(error?.message==='LINEAGE_JOURNAL_CORRUPT')throw error;
    throw Error('LINEAGE_JOURNAL_CORRUPT');
  }finally{if(fd!==null){try{fsImpl.closeSync(fd)}catch(_closeError){}}}
}
function selectRetainedEvents(events,targetBytes){
  const sourceByRef=new Map(events.filter(event=>event.type===EVENT_TYPES.SOURCE).map(event=>[event.lineageRef,event]));
  const selected=new Map();
  let retainedBytes=0;
  const outputs=events.filter(event=>event.type===EVENT_TYPES.OUTPUT).sort((a,b)=>b.sequence-a.sequence);
  for(const output of outputs){
    const closure=[output];
    for(const ref of output.sourceLineageRefs){
      const source=sourceByRef.get(ref);
      if(!source)throw Error('LINEAGE_JOURNAL_CORRUPT');
      closure.push(source);
    }
    const missing=closure.filter(event=>!selected.has(event.sequence));
    const addedBytes=missing.reduce((sum,event)=>sum+event.storageBytes,0);
    if(selected.size===0||retainedBytes+addedBytes<=targetBytes){
      for(const event of missing){selected.set(event.sequence,event);retainedBytes+=event.storageBytes;}
    }
  }
  const sources=events.filter(event=>event.type===EVENT_TYPES.SOURCE).sort((a,b)=>b.sequence-a.sequence);
  for(const source of sources){
    if(selected.has(source.sequence))continue;
    if(selected.size===0||retainedBytes+source.storageBytes<=targetBytes){
      selected.set(source.sequence,source);
      retainedBytes+=source.storageBytes;
    }
  }
  return Object.freeze([...selected.values()].sort((a,b)=>a.sequence-b.sequence));
}
function isSpaceError(error){return error?.code==='ENOSPC'||error?.code==='EDQUOT'||error?.message==='LINEAGE_COMPACTION_SPACE_REQUIRED';}
function fsyncDirectory(directory,fsImpl){
  let fd=null;
  try{fd=fsImpl.openSync(directory,'r');fsImpl.fsyncSync(fd);}catch(_error){}
  finally{if(fd!==null){try{fsImpl.closeSync(fd)}catch(_closeError){}}}
}
function compactLineageStorage({filePath,now=Date.now,fsImpl=fs,policy={}}={}){
  if(typeof now!=='function')throw Error('LINEAGE_CLOCK_REQUIRED');
  if(!fsImpl||typeof fsImpl!=='object')throw Error('LINEAGE_FS_REQUIRED');
  const paths=lineagePaths(filePath);
  const retainedTargetBytes=Number(policy.retainedTargetBytes??DEFAULT_RETAINED_TARGET_BYTES);
  if(!Number.isSafeInteger(retainedTargetBytes)||retainedTargetBytes<=0)throw Error('LINEAGE_RETENTION_POLICY_INVALID');
  const createdAt=Number(now());
  if(!finite(createdAt)||createdAt<0)throw Error('LINEAGE_CLOCK_INVALID');

  const beforeAudit=auditLineageStorage({filePath,fsImpl});
  const scans=logicalScans(paths,fsImpl,{collectEvents:true});
  const events=[...scans.checkpoint.events,...scans.active.events];
  if(!events.length)return Object.freeze({status:'NOOP',before:beforeAudit,after:beforeAudit,checkpoint:null});
  const retained=selectRetainedEvents(events,retainedTargetBytes);
  const tempPath=paths.checkpointPath+'.tmp-'+process.pid+'-'+createdAt;
  let fd=null;
  try{
    fsImpl.mkdirSync(path.dirname(paths.activePath),{recursive:true});
    fd=fsImpl.openSync(tempPath,'wx');
    let nextSequence=1;
    for(const meta of retained){
      const raw=readEvent(meta,fsImpl);
      const event=createEvent({sequence:nextSequence++,type:raw.type,recordedAt:raw.recordedAt,record:raw.record});
      writeAll(fsImpl,fd,Buffer.from(JSON.stringify(event)+'\n','utf8'));
    }
    fsImpl.fsyncSync(fd);
    fsImpl.closeSync(fd);
    fd=null;
  }catch(error){
    if(fd!==null){try{fsImpl.closeSync(fd)}catch(_closeError){}}
    try{fsImpl.unlinkSync(tempPath)}catch(_unlinkError){}
    if(isSpaceError(error))return Object.freeze({status:'LINEAGE_COMPACTION_SPACE_REQUIRED',before:beforeAudit,after:beforeAudit,checkpoint:null});
    if(error?.code==='ENOSPC'||error?.code==='EDQUOT')return Object.freeze({status:'LINEAGE_COMPACTION_SPACE_REQUIRED',before:beforeAudit,after:beforeAudit,checkpoint:null});
    throw error;
  }

  let verified;
  try{
    verified=scanJournal(tempPath,fsImpl,{startSequence:1,collectEvents:false,allowTornTail:false});
    if(verified.eventCount!==retained.length)throw Error('LINEAGE_CHECKPOINT_VERIFY_FAILED');
  }catch(error){
    try{fsImpl.unlinkSync(tempPath)}catch(_unlinkError){}
    throw error;
  }

  const beforeDigest=sha256({
    checkpoint:digestFile(paths.checkpointPath,fsImpl),
    active:digestFile(paths.activePath,fsImpl),
    supersededActiveBytes:scans.supersededActiveBytes
  });
  const afterDigest=digestFile(tempPath,fsImpl);
  const checkpointBase={
    schema:CHECKPOINT_SCHEMA,createdAt,
    before:Object.freeze({bytes:beforeAudit.totalBytes,eventCount:beforeAudit.eventCount,digest:beforeDigest}),
    after:Object.freeze({bytes:verified.bytes,eventCount:verified.eventCount,digest:afterDigest}),
    retiredEventCount:events.length-retained.length,
    retainedOldestRecordedAt:verified.oldestRecordedAt,
    retainedNewestRecordedAt:verified.newestRecordedAt
  };
  const checkpoint=Object.freeze({...checkpointBase,checksum:sha256(checkpointBase)});
  const checkpointLine=Buffer.from(JSON.stringify(checkpoint)+'\n','utf8');
  let auditFd=null;
  try{
    auditFd=fsImpl.openSync(paths.checkpointAuditPath,'a+');
    writeAll(fsImpl,auditFd,checkpointLine);
    fsImpl.fsyncSync(auditFd);
    fsImpl.closeSync(auditFd);
    auditFd=null;
    fsImpl.renameSync(tempPath,paths.checkpointPath);
    fsyncDirectory(path.dirname(paths.checkpointPath),fsImpl);
    let activeFd=null;
    try{
      activeFd=fsImpl.openSync(paths.activePath,'w');
      fsImpl.fsyncSync(activeFd);
    }finally{if(activeFd!==null)fsImpl.closeSync(activeFd);}
    fsyncDirectory(path.dirname(paths.activePath),fsImpl);
  }catch(error){
    if(auditFd!==null){try{fsImpl.closeSync(auditFd)}catch(_closeError){}}
    try{if(fsImpl.existsSync(tempPath))fsImpl.unlinkSync(tempPath)}catch(_unlinkError){}
    if(isSpaceError(error)||error?.code==='ENOSPC'||error?.code==='EDQUOT')return Object.freeze({status:'LINEAGE_COMPACTION_SPACE_REQUIRED',before:beforeAudit,after:beforeAudit,checkpoint:null});
    throw error;
  }

  const afterAudit=auditLineageStorage({filePath,fsImpl});
  return Object.freeze({status:'COMPACTED',before:beforeAudit,after:afterAudit,checkpoint});
}

module.exports=Object.freeze({auditLineageStorage,compactLineageStorage});
