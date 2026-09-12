'use strict';

const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const Lineage=require('../data/source_lineage.js');

const EVENT_SCHEMA='foxyya-lineage-event/1';
const FRAME_SCHEMA='foxyya-lineage-frame/1';
const FRAME_ENCODING='deflate-raw-base64';
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

function framePayload(frame){
  return {
    schema:frame.schema,
    encoding:frame.encoding,
    sequence:frame.sequence,
    payload:frame.payload
  };
}

function encodeFrame(event){
  const payload=zlib.deflateRawSync(Buffer.from(JSON.stringify(event),'utf8'),{level:9}).toString('base64');
  const base={schema:FRAME_SCHEMA,encoding:FRAME_ENCODING,sequence:event.sequence,payload};
  return Object.freeze({...base,checksum:sha256(base)});
}

function decodeStoredValue(raw){
  if(object(raw)&&raw.schema===EVENT_SCHEMA)return raw;
  if(!object(raw)||raw.schema!==FRAME_SCHEMA||raw.encoding!==FRAME_ENCODING||!Number.isInteger(raw.sequence)||raw.sequence<=0||typeof raw.payload!=='string'||!raw.payload.length||typeof raw.checksum!=='string')throw Error('LINEAGE_JOURNAL_CORRUPT');
  if(raw.checksum!==sha256(framePayload(raw)))throw Error('LINEAGE_JOURNAL_CORRUPT');
  let inflated;
  try{inflated=zlib.inflateRawSync(Buffer.from(raw.payload,'base64'));}
  catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
  let event;
  try{event=JSON.parse(inflated.toString('utf8'));}
  catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
  if(!object(event)||event.schema!==EVENT_SCHEMA||event.sequence!==raw.sequence)throw Error('LINEAGE_JOURNAL_CORRUPT');
  return event;
}

function createDurableSourceLineageStore({
  filePath,
  now=Date.now,
  fsImpl=fs,
  compactThresholdBytes=0,
  compactScratchDir=null,
  externalBackupVerified=false
}={}){
  const journalPath=validatePath(filePath);
  if(typeof now!=='function')throw Error('LINEAGE_CLOCK_REQUIRED');
  if(!fsImpl||typeof fsImpl!=='object')throw Error('LINEAGE_FS_REQUIRED');
  if(!Number.isInteger(compactThresholdBytes)||compactThresholdBytes<0)throw Error('LINEAGE_COMPACT_THRESHOLD_INVALID');
  if(compactScratchDir!==null&&(typeof compactScratchDir!=='string'||!compactScratchDir.trim()))throw Error('LINEAGE_COMPACT_SCRATCH_INVALID');
  if(typeof externalBackupVerified!=='boolean')throw Error('LINEAGE_BACKUP_STATE_INVALID');
  const resolvedScratchDir=compactScratchDir===null?null:path.resolve(compactScratchDir.trim());
  const journalDir=path.resolve(path.dirname(journalPath));

  // Only compact references and byte offsets stay resident. Canonical payloads remain on disk
  // and are validated/read on demand. This prevents an append-only journal from consuming
  // heap proportional to its full JSON payload size at every process restart.
  const sourceIndexByRef=new Map();
  const outputIndexByRef=new Map();
  const sourceIdentityRefs=new Map();
  const outputIdentityRefs=new Map();
  const observationSourceRefs=new Map();
  let sequence=0;
  let repairTailOffset=null;
  let needsTrailingSeparator=false;
  let legacyEventCount=0;

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

  function frameLineBuffer(event){return Buffer.from(JSON.stringify(encodeFrame(event))+'\n','utf8');}

  function appendEvent(type,record,minimumRecordedAt){
    const recordedAt=currentTime();
    if(recordedAt<minimumRecordedAt)throw Error('RECORDED_AT_INVALID');
    const event=createEvent({sequence:sequence+1,type,recordedAt,record});
    const lineBuffer=frameLineBuffer(event);
    let fd=null;
    try{
      fsImpl.mkdirSync(path.dirname(journalPath),{recursive:true});
      fd=fsImpl.openSync(journalPath,'a+');
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
        index:Object.freeze({offset,length:lineBuffer.length-1,sequence:event.sequence})
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

  function parseStoredLine(buffer,index){
    if(!buffer.length||!buffer.toString('utf8').trim())return null;
    let stored;
    try{stored=JSON.parse(buffer.toString('utf8'));}
    catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
    if(stored?.schema===EVENT_SCHEMA)legacyEventCount+=1;
    const event=decodeStoredValue(stored);
    validateRawEvent(event,index.sequence);
    return event;
  }

  function parseCompleteLine(buffer,index){
    const event=parseStoredLine(buffer,index);
    if(event)replayIndexedEvent(event,index);
  }

  function replay(){
    if(!fsImpl.existsSync(journalPath))return;
    let fd=null;
    try{
      fd=fsImpl.openSync(journalPath,'r');
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
          if(length)parseCompleteLine(line,Object.freeze({offset:lineStart,length,sequence:sequence+1}));
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
          const event=parseStoredLine(tail,Object.freeze({offset:lineStart,length:carryLength,sequence:sequence+1}));
          if(event)replayIndexedEvent(event,Object.freeze({offset:lineStart,length:carryLength,sequence:sequence+1}));
          needsTrailingSeparator=true;
        }catch(error){
          if(error?.message==='LINEAGE_JOURNAL_CORRUPT'){
            let parsed=null;
            try{parsed=JSON.parse(tail.toString('utf8'));}catch(_parseError){}
            if(parsed!==null)throw error;
          }
          // Preserve historical torn-append semantics: ignore the incomplete fragment now,
          // and truncate it durably before the next successful append.
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

  function readStoredEvent(index){
    let fd=null;
    try{
      fd=fsImpl.openSync(journalPath,'r');
      const buffer=Buffer.allocUnsafe(index.length);
      let read=0;
      while(read<buffer.length){
        const count=fsImpl.readSync(fd,buffer,read,buffer.length-read,index.offset+read);
        if(!Number.isInteger(count)||count<=0)throw Error('LINEAGE_JOURNAL_CORRUPT');
        read+=count;
      }
      fsImpl.closeSync(fd);
      fd=null;
      let stored;
      try{stored=JSON.parse(buffer.toString('utf8'));}
      catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
      const event=decodeStoredValue(stored);
      validateRawEvent(event,index.sequence);
      return event;
    }catch(error){
      if(fd!==null){try{fsImpl.closeSync(fd);}catch(_closeError){}}
      if(error?.message==='LINEAGE_JOURNAL_CORRUPT')throw error;
      throw Error('LINEAGE_JOURNAL_CORRUPT');
    }
  }

  function readIndexedEvent(index,expectedType){
    const raw=readStoredEvent(index);
    if(raw.type!==expectedType)throw Error('LINEAGE_JOURNAL_CORRUPT');
    if(expectedType===EVENT_TYPES.SOURCE){
      const record=Lineage.validateSourceObservationLineage(raw.record);
      if(record.receivedAt!==index.receivedAt)throw Error('LINEAGE_JOURNAL_CORRUPT');
      return record;
    }
    const record=Lineage.validateResearchOutputLineage(raw.record);
    if(record.asOf!==index.asOf)throw Error('LINEAGE_JOURNAL_CORRUPT');
    return record;
  }

  function resetIndexes(){
    sourceIndexByRef.clear();
    outputIndexByRef.clear();
    sourceIdentityRefs.clear();
    outputIdentityRefs.clear();
    observationSourceRefs.clear();
    sequence=0;
    repairTailOffset=null;
    needsTrailingSeparator=false;
    legacyEventCount=0;
  }

  function compactLegacyJournal(){
    const indexes=[...sourceIndexByRef.values(),...outputIndexByRef.values()].sort((a,b)=>a.sequence-b.sequence);
    const scratchDir=resolvedScratchDir||journalDir;
    const usesExternalScratch=scratchDir!==journalDir;
    if(usesExternalScratch&&!externalBackupVerified)throw Error('LINEAGE_BACKUP_REQUIRED');
    const tempPath=path.join(scratchDir,`${path.basename(journalPath,'.lineage.jsonl')}.compact-${process.pid}-${Date.now()}.lineage.jsonl`);
    let fd=null;
    let replaced=false;
    try{
      fsImpl.mkdirSync(scratchDir,{recursive:true});
      if(fsImpl.existsSync(tempPath))fsImpl.unlinkSync(tempPath);
      fd=fsImpl.openSync(tempPath,'wx');
      for(const index of indexes){
        const event=readStoredEvent(index);
        writeAll(fd,frameLineBuffer(event));
      }
      fsImpl.fsyncSync(fd);
      fsImpl.closeSync(fd);
      fd=null;

      if(usesExternalScratch){
        // Full scratch replay validates sequence, checksums, lineage identities, source/output
        // references, and time ordering before the only persistent copy is replaced.
        createDurableSourceLineageStore({filePath:tempPath,now,fsImpl,compactThresholdBytes:0});
        fsImpl.copyFileSync(tempPath,journalPath);
        let targetFd=null;
        try{targetFd=fsImpl.openSync(journalPath,'r+');fsImpl.fsyncSync(targetFd);}
        finally{if(targetFd!==null)fsImpl.closeSync(targetFd);}
        replaced=true;
        try{fsImpl.unlinkSync(tempPath);}catch(_unlinkError){}
      }else{
        fsImpl.renameSync(tempPath,journalPath);
        replaced=true;
      }

      resetIndexes();
      replay();
    }catch(error){
      if(fd!==null){try{fsImpl.closeSync(fd);}catch(_closeError){}}
      if(!replaced){try{if(fsImpl.existsSync(tempPath))fsImpl.unlinkSync(tempPath);}catch(_unlinkError){}}
      if(error?.message==='LINEAGE_BACKUP_REQUIRED'||error?.message==='LINEAGE_JOURNAL_CORRUPT')throw error;
      throw Error('LINEAGE_COMPACTION_FAILED');
    }
  }

  function maybeCompactLegacyJournal(){
    if(!compactThresholdBytes||!legacyEventCount||!fsImpl.existsSync(journalPath))return;
    let size;
    try{size=fsImpl.statSync(journalPath).size;}
    catch(_error){throw Error('LINEAGE_COMPACTION_FAILED');}
    if(size>=compactThresholdBytes)compactLegacyJournal();
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

  replay();
  maybeCompactLegacyJournal();

  return Object.freeze({recordSource,recordOutput,source,output,traceOutput});
}

module.exports=Object.freeze({EVENT_SCHEMA,FRAME_SCHEMA,FRAME_ENCODING,EVENT_TYPES,createDurableSourceLineageStore});
