'use strict';

const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Lineage=require('../data/source_lineage.js');

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

function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const key of Object.keys(value))deepFreeze(value[key]);
  return Object.freeze(value);
}

function validatePath(filePath){
  if(typeof filePath!=='string'||!filePath.endsWith('.lineage.jsonl'))throw Error('LINEAGE_JOURNAL_PATH_INVALID');
  return filePath;
}
function checkpointPathFor(journalPath){
  return journalPath.slice(0,-'.lineage.jsonl'.length)+'.lineage.checkpoint.jsonl';
}

function eventPayload(event){
  return {
    schema:event.schema,
    sequence:event.sequence,
    type:event.type,
    recordedAt:event.recordedAt,
    record:event.record
  };
}

function createEvent({sequence,type,recordedAt,record}){
  const base={schema:EVENT_SCHEMA,sequence,type,recordedAt,record};
  return Object.freeze({...base,checksum:sha256(base)});
}

function createDurableSourceLineageStore({filePath,now=Date.now,fsImpl=fs}={}){
  const journalPath=validatePath(filePath);
  const checkpointPath=checkpointPathFor(journalPath);
  if(typeof now!=='function')throw Error('LINEAGE_CLOCK_REQUIRED');
  if(!fsImpl||typeof fsImpl!=='object')throw Error('LINEAGE_FS_REQUIRED');

  // Only compact references and byte offsets stay resident. Canonical payloads remain on disk
  // and are validated/read on demand. This prevents lineage persistence from consuming heap
  // proportional to the full journal payload size at every process restart.
  const sourceIndexByRef=new Map();
  const outputIndexByRef=new Map();
  const sourceIdentityRefs=new Map();
  const outputIdentityRefs=new Map();
  const observationSourceRefs=new Map();
  let sequence=0;
  let repairTailOffset=null;
  let needsTrailingSeparator=false;
  let activeSuperseded=false;

  function currentTime(){
    const value=Number(now());
    if(!finite(value)||value<0)throw Error('LINEAGE_CLOCK_INVALID');
    return value;
  }

  function validateRawEvent(raw,expectedSequence){
    if(!object(raw)||raw.schema!==EVENT_SCHEMA||raw.sequence!==expectedSequence||!finite(raw.recordedAt)||raw.recordedAt<0||typeof raw.type!=='string'||!object(raw.record)||typeof raw.checksum!=='string')throw Error('LINEAGE_JOURNAL_CORRUPT');
    if(raw.checksum!==sha256(eventPayload(raw)))throw Error('LINEAGE_JOURNAL_CORRUPT');
    return raw;
  }

  function sourceMeta(lineageRef){return sourceIndexByRef.get(lineageRef)||null;}

  function assertSourceCanApply(record,{replay=false}={}){
    const identity=Lineage.sourceIdentityKey(record);
    const existingIdentityRef=sourceIdentityRefs.get(identity);
    if(existingIdentityRef&&existingIdentityRef!==record.lineageRef)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'SOURCE_LINEAGE_CONFLICT');
    for(const observationRef of record.observationRefs){
      const existingSourceRef=observationSourceRefs.get(observationRef);
      if(existingSourceRef&&existingSourceRef!==record.lineageRef)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'SOURCE_LINEAGE_CONFLICT');
    }
    return identity;
  }

  function applySourceIndex(record,index,{replay=false}={}){
    const identity=assertSourceCanApply(record,{replay});
    const existing=sourceIndexByRef.get(record.lineageRef);
    if(!existing)sourceIndexByRef.set(record.lineageRef,Object.freeze({...index,receivedAt:record.receivedAt,type:EVENT_TYPES.SOURCE}));
    sourceIdentityRefs.set(identity,record.lineageRef);
    for(const observationRef of record.observationRefs)observationSourceRefs.set(observationRef,record.lineageRef);
  }

  function assertOutputReferences(record,{replay=false}={}){
    for(const sourceRef of record.sourceLineageRefs){
      const source=sourceMeta(sourceRef);
      if(!source)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'SOURCE_LINEAGE_REF_UNKNOWN');
      if(source.receivedAt>record.asOf)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'LINEAGE_TIME_ORDER_INVALID');
    }
    for(const observationRef of record.observationRefs){
      const sourceRef=observationSourceRefs.get(observationRef);
      if(!sourceRef)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'OBSERVATION_REF_UNKNOWN');
      if(!record.sourceLineageRefs.includes(sourceRef))throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'OBSERVATION_SOURCE_REF_MISMATCH');
    }
  }

  function assertOutputCanApply(record,{replay=false}={}){
    assertOutputReferences(record,{replay});
    const identity=Lineage.outputIdentityKey(record);
    const existingIdentityRef=outputIdentityRefs.get(identity);
    if(existingIdentityRef&&existingIdentityRef!==record.lineageRef)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'RESEARCH_OUTPUT_LINEAGE_CONFLICT');
    return identity;
  }

  function applyOutputIndex(record,index,{replay=false}={}){
    const identity=assertOutputCanApply(record,{replay});
    const existing=outputIndexByRef.get(record.lineageRef);
    if(!existing)outputIndexByRef.set(record.lineageRef,Object.freeze({...index,asOf:record.asOf,type:EVENT_TYPES.OUTPUT}));
    outputIdentityRefs.set(identity,record.lineageRef);
  }

  function writeAll(fd,buffer){
    let written=0;
    while(written<buffer.length){
      const count=fsImpl.writeSync(fd,buffer,written,buffer.length-written,null);
      if(!Number.isInteger(count)||count<=0)throw Error('DURABLE_WRITE_FAILED');
      written+=count;
    }
  }

  function appendEvent(type,record,minimumRecordedAt){
    const recordedAt=currentTime();
    if(recordedAt<minimumRecordedAt)throw Error('RECORDED_AT_INVALID');
    const event=createEvent({sequence:sequence+1,type,recordedAt,record});
    const lineBuffer=Buffer.from(JSON.stringify(event)+'\n','utf8');
    let fd=null;
    try{
      fsImpl.mkdirSync(path.dirname(journalPath),{recursive:true});
      fd=fsImpl.openSync(journalPath,'a+');
      if(activeSuperseded){
        fsImpl.ftruncateSync(fd,0);
        activeSuperseded=false;
        repairTailOffset=null;
        needsTrailingSeparator=false;
      }
      if(repairTailOffset!==null){
        fsImpl.ftruncateSync(fd,repairTailOffset);
        repairTailOffset=null;
        needsTrailingSeparator=false;
      }
      let offset=fsImpl.fstatSync(fd).size;
      if(needsTrailingSeparator&&offset>0){
        writeAll(fd,Buffer.from('\n','utf8'));
        offset+=1;
        needsTrailingSeparator=false;
      }
      writeAll(fd,lineBuffer);
      fsImpl.fsyncSync(fd);
      fsImpl.closeSync(fd);
      fd=null;
      sequence=event.sequence;
      return Object.freeze({
        event,
        index:Object.freeze({filePath:journalPath,offset,length:lineBuffer.length-1,sequence:event.sequence})
      });
    }catch(error){
      if(fd!==null){try{fsImpl.closeSync(fd);}catch(_closeError){}}
      if(error?.message==='DURABLE_WRITE_FAILED')throw error;
      throw Error('DURABLE_WRITE_FAILED');
    }
  }

  function replayIndexedEvent(raw,index){
    validateRawEvent(raw,sequence+1);
    try{
      if(raw.type===EVENT_TYPES.SOURCE){
        const record=Lineage.validateSourceObservationLineage(raw.record);
        if(raw.recordedAt<record.receivedAt)throw Error('LINEAGE_JOURNAL_CORRUPT');
        applySourceIndex(record,index,{replay:true});
      }else if(raw.type===EVENT_TYPES.OUTPUT){
        const record=Lineage.validateResearchOutputLineage(raw.record);
        if(raw.recordedAt<record.asOf)throw Error('LINEAGE_JOURNAL_CORRUPT');
        applyOutputIndex(record,index,{replay:true});
      }else{
        throw Error('LINEAGE_JOURNAL_CORRUPT');
      }
    }catch(_error){
      throw Error('LINEAGE_JOURNAL_CORRUPT');
    }
    sequence=raw.sequence;
  }

  function parseCompleteLine(buffer,index){
    if(!buffer.length||!buffer.toString('utf8').trim())return;
    let parsed;
    try{parsed=JSON.parse(buffer.toString('utf8'));}
    catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
    replayIndexedEvent(parsed,index);
  }

  function firstSequence(targetPath){
    if(!fsImpl.existsSync(targetPath)||Number(fsImpl.statSync(targetPath).size)===0)return null;
    let fd=null;
    try{
      fd=fsImpl.openSync(targetPath,'r');
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

  function replayFile(targetPath,{active=false}={}){
    if(!fsImpl.existsSync(targetPath)||Number(fsImpl.statSync(targetPath).size)===0)return;
    if(active&&sequence>0){
      const first=firstSequence(targetPath);
      if(first===1){
        // A durable checkpoint may have been committed immediately before process death,
        // leaving the previous active generation physically present. The checkpoint is
        // authoritative; the old generation is only truncated before the next append.
        activeSuperseded=true;
        return;
      }
      if(first!==sequence+1)throw Error('LINEAGE_JOURNAL_CORRUPT');
    }
    let fd=null;
    try{
      fd=fsImpl.openSync(targetPath,'r');
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
          if(length)parseCompleteLine(line,Object.freeze({filePath:targetPath,offset:lineStart,length,sequence:sequence+1}));
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
        try{
          const parsed=JSON.parse(tail.toString('utf8'));
          replayIndexedEvent(parsed,Object.freeze({filePath:targetPath,offset:lineStart,length:carryLength,sequence:sequence+1}));
          if(active)needsTrailingSeparator=true;
        }catch(error){
          if(error?.message==='LINEAGE_JOURNAL_CORRUPT')throw error;
          if(!active)throw Error('LINEAGE_JOURNAL_CORRUPT');
          // Preserve historical torn-append semantics for the mutable active journal only:
          // ignore the incomplete fragment now, and truncate it durably before next append.
          repairTailOffset=lineStart;
        }
      }
    }catch(error){
      if(error?.message==='LINEAGE_JOURNAL_CORRUPT')throw error;
      throw Error('LINEAGE_JOURNAL_CORRUPT');
    }finally{
      if(fd!==null){try{fsImpl.closeSync(fd);}catch(_closeError){}}
    }
  }

  function readIndexedEvent(index,expectedType){
    let fd=null;
    try{
      fd=fsImpl.openSync(index.filePath||journalPath,'r');
      const buffer=Buffer.allocUnsafe(index.length);
      let read=0;
      while(read<buffer.length){
        const count=fsImpl.readSync(fd,buffer,read,buffer.length-read,index.offset+read);
        if(!Number.isInteger(count)||count<=0)throw Error('LINEAGE_JOURNAL_CORRUPT');
        read+=count;
      }
      fsImpl.closeSync(fd);
      fd=null;
      let raw;
      try{raw=JSON.parse(buffer.toString('utf8'));}
      catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
      validateRawEvent(raw,index.sequence);
      if(raw.type!==expectedType)throw Error('LINEAGE_JOURNAL_CORRUPT');
      if(expectedType===EVENT_TYPES.SOURCE){
        const record=Lineage.validateSourceObservationLineage(raw.record);
        if(record.receivedAt!==index.receivedAt)throw Error('LINEAGE_JOURNAL_CORRUPT');
        return record;
      }
      const record=Lineage.validateResearchOutputLineage(raw.record);
      if(record.asOf!==index.asOf)throw Error('LINEAGE_JOURNAL_CORRUPT');
      return record;
    }catch(error){
      if(fd!==null){try{fsImpl.closeSync(fd);}catch(_closeError){}}
      if(error?.message==='LINEAGE_JOURNAL_CORRUPT')throw error;
      throw Error('LINEAGE_JOURNAL_CORRUPT');
    }
  }

  function recordSource(value){
    const record=Lineage.validateSourceObservationLineage(value);
    const identity=Lineage.sourceIdentityKey(record);
    const existingIdentityRef=sourceIdentityRefs.get(identity);
    if(existingIdentityRef){
      if(existingIdentityRef===record.lineageRef)return Object.freeze({status:'IDEMPOTENT',lineageRef:record.lineageRef});
      throw Error('SOURCE_LINEAGE_CONFLICT');
    }
    if(sourceIndexByRef.has(record.lineageRef))return Object.freeze({status:'IDEMPOTENT',lineageRef:record.lineageRef});
    assertSourceCanApply(record);
    const appended=appendEvent(EVENT_TYPES.SOURCE,record,record.receivedAt);
    applySourceIndex(record,appended.index);
    return Object.freeze({status:'RECORDED',lineageRef:record.lineageRef});
  }

  function recordOutput(value){
    const record=Lineage.validateResearchOutputLineage(value);
    const identity=Lineage.outputIdentityKey(record);
    const existingIdentityRef=outputIdentityRefs.get(identity);
    if(existingIdentityRef){
      if(existingIdentityRef===record.lineageRef)return Object.freeze({status:'IDEMPOTENT',lineageRef:record.lineageRef});
      throw Error('RESEARCH_OUTPUT_LINEAGE_CONFLICT');
    }
    if(outputIndexByRef.has(record.lineageRef))return Object.freeze({status:'IDEMPOTENT',lineageRef:record.lineageRef});
    assertOutputCanApply(record);
    const appended=appendEvent(EVENT_TYPES.OUTPUT,record,record.asOf);
    applyOutputIndex(record,appended.index);
    return Object.freeze({status:'RECORDED',lineageRef:record.lineageRef});
  }

  function source(lineageRef){
    const index=sourceIndexByRef.get(lineageRef);
    return index?readIndexedEvent(index,EVENT_TYPES.SOURCE):null;
  }

  function output(lineageRef){
    const index=outputIndexByRef.get(lineageRef);
    return index?readIndexedEvent(index,EVENT_TYPES.OUTPUT):null;
  }

  function traceOutput(lineageRef){
    const record=output(lineageRef);
    if(!record)return null;
    const sources=record.sourceLineageRefs.map(ref=>{
      const value=source(ref);
      if(!value)throw Error('LINEAGE_JOURNAL_CORRUPT');
      return value;
    });
    const observationsByRef=new Map();
    for(const sourceRecord of sources){
      for(let i=0;i<sourceRecord.observationRefs.length;i++){
        observationsByRef.set(sourceRecord.observationRefs[i],deepFreeze({
          observationRef:sourceRecord.observationRefs[i],
          sourceLineageRef:sourceRecord.lineageRef,
          observation:sourceRecord.observations[i]
        }));
      }
    }
    const observations=record.observationRefs.map(ref=>{
      const value=observationsByRef.get(ref);
      if(!value)throw Error('LINEAGE_JOURNAL_CORRUPT');
      return value;
    });
    return deepFreeze({
      output:record,
      sources:Object.freeze(sources),
      observations:Object.freeze(observations),
      researchOnly:true,
      executionWrite:false
    });
  }

  replayFile(checkpointPath,{active:false});
  replayFile(journalPath,{active:true});

  return Object.freeze({recordSource,recordOutput,source,output,traceOutput});
}

module.exports=Object.freeze({EVENT_SCHEMA,EVENT_TYPES,createDurableSourceLineageStore});
