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

function createDurableSourceLineageStore({filePath,now=Date.now,fsImpl=fs}={}){
  const journalPath=validatePath(filePath);
  if(typeof now!=='function')throw Error('LINEAGE_CLOCK_REQUIRED');
  if(!fsImpl||typeof fsImpl!=='object')throw Error('LINEAGE_FS_REQUIRED');

  const sourcesByRef=new Map();
  const outputsByRef=new Map();
  const sourceIdentityRefs=new Map();
  const outputIdentityRefs=new Map();
  const observationsByRef=new Map();
  let sequence=0;

  function currentTime(){
    const value=Number(now());
    if(!finite(value)||value<0)throw Error('LINEAGE_CLOCK_INVALID');
    return value;
  }

  function assertSourceCanApply(record,{replay=false}={}){
    const identity=Lineage.sourceIdentityKey(record);
    const existingIdentityRef=sourceIdentityRefs.get(identity);
    if(existingIdentityRef&&existingIdentityRef!==record.lineageRef)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'SOURCE_LINEAGE_CONFLICT');

    const existing=sourcesByRef.get(record.lineageRef);
    if(existing&&stableStringify(existing)!==stableStringify(record))throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'SOURCE_LINEAGE_CONFLICT');

    for(let i=0;i<record.observationRefs.length;i++){
      const observationRef=record.observationRefs[i];
      const existingObservation=observationsByRef.get(observationRef);
      if(existingObservation){
        const sameSource=existingObservation.sourceLineageRef===record.lineageRef;
        const sameObservation=stableStringify(existingObservation.observation)===stableStringify(record.observations[i]);
        if(!sameSource||!sameObservation)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'SOURCE_LINEAGE_CONFLICT');
      }
    }
    return identity;
  }

  function applySource(record,{replay=false}={}){
    const identity=assertSourceCanApply(record,{replay});
    sourcesByRef.set(record.lineageRef,record);
    sourceIdentityRefs.set(identity,record.lineageRef);
    for(let i=0;i<record.observationRefs.length;i++){
      const observationRef=record.observationRefs[i];
      observationsByRef.set(observationRef,deepFreeze({
        observationRef,
        sourceLineageRef:record.lineageRef,
        observation:record.observations[i]
      }));
    }
  }

  function assertOutputReferences(record,{replay=false}={}){
    for(const sourceRef of record.sourceLineageRefs){
      const source=sourcesByRef.get(sourceRef);
      if(!source)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'SOURCE_LINEAGE_REF_UNKNOWN');
      if(source.receivedAt>record.asOf)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'LINEAGE_TIME_ORDER_INVALID');
    }
    for(const observationRef of record.observationRefs){
      const indexed=observationsByRef.get(observationRef);
      if(!indexed)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'OBSERVATION_REF_UNKNOWN');
      if(!record.sourceLineageRefs.includes(indexed.sourceLineageRef))throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'OBSERVATION_SOURCE_REF_MISMATCH');
    }
  }

  function assertOutputCanApply(record,{replay=false}={}){
    assertOutputReferences(record,{replay});
    const identity=Lineage.outputIdentityKey(record);
    const existingIdentityRef=outputIdentityRefs.get(identity);
    if(existingIdentityRef&&existingIdentityRef!==record.lineageRef)throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'RESEARCH_OUTPUT_LINEAGE_CONFLICT');

    const existing=outputsByRef.get(record.lineageRef);
    if(existing&&stableStringify(existing)!==stableStringify(record))throw Error(replay?'LINEAGE_JOURNAL_CORRUPT':'RESEARCH_OUTPUT_LINEAGE_CONFLICT');
    return identity;
  }

  function applyOutput(record,{replay=false}={}){
    const identity=assertOutputCanApply(record,{replay});
    outputsByRef.set(record.lineageRef,record);
    outputIdentityRefs.set(identity,record.lineageRef);
  }

  function appendEvent(type,record,minimumRecordedAt){
    const recordedAt=currentTime();
    if(recordedAt<minimumRecordedAt)throw Error('RECORDED_AT_INVALID');
    const event=createEvent({sequence:sequence+1,type,recordedAt,record});
    const line=JSON.stringify(event)+'\n';
    let fd=null;
    try{
      fsImpl.mkdirSync(path.dirname(journalPath),{recursive:true});
      fd=fsImpl.openSync(journalPath,'a');
      fsImpl.writeSync(fd,line,null,'utf8');
      fsImpl.fsyncSync(fd);
      fsImpl.closeSync(fd);
      fd=null;
    }catch(_error){
      if(fd!==null){
        try{fsImpl.closeSync(fd);}catch(_closeError){}
      }
      throw Error('DURABLE_WRITE_FAILED');
    }
    sequence=event.sequence;
    return event;
  }

  function replayEvent(raw,expectedSequence){
    if(!object(raw)||raw.schema!==EVENT_SCHEMA||raw.sequence!==expectedSequence||!finite(raw.recordedAt)||raw.recordedAt<0||typeof raw.type!=='string'||!object(raw.record)||typeof raw.checksum!=='string')throw Error('LINEAGE_JOURNAL_CORRUPT');
    if(raw.checksum!==sha256(eventPayload(raw)))throw Error('LINEAGE_JOURNAL_CORRUPT');

    try{
      if(raw.type===EVENT_TYPES.SOURCE){
        const record=Lineage.validateSourceObservationLineage(raw.record);
        if(raw.recordedAt<record.receivedAt)throw Error('LINEAGE_JOURNAL_CORRUPT');
        applySource(record,{replay:true});
      }else if(raw.type===EVENT_TYPES.OUTPUT){
        const record=Lineage.validateResearchOutputLineage(raw.record);
        if(raw.recordedAt<record.asOf)throw Error('LINEAGE_JOURNAL_CORRUPT');
        applyOutput(record,{replay:true});
      }else{
        throw Error('LINEAGE_JOURNAL_CORRUPT');
      }
    }catch(_error){
      throw Error('LINEAGE_JOURNAL_CORRUPT');
    }
    sequence=expectedSequence;
  }

  function replay(){
    if(!fsImpl.existsSync(journalPath))return;
    let raw;
    try{raw=fsImpl.readFileSync(journalPath,'utf8');}
    catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
    if(!raw)return;

    const hasTrailingNewline=raw.endsWith('\n');
    const chunks=raw.split('\n');
    if(hasTrailingNewline)chunks.pop();
    else{
      const tail=chunks.pop();
      if(tail&&tail.trim()){
        try{
          const parsed=JSON.parse(tail);
          replayEvent(parsed,sequence+1);
        }catch(error){
          if(error?.message!=='LINEAGE_JOURNAL_CORRUPT'){
            // An unterminated, unparsable final fragment may be a torn append.
          }else{
            throw error;
          }
        }
      }
    }

    for(const line of chunks){
      if(!line.trim())continue;
      let parsed;
      try{parsed=JSON.parse(line);}catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
      replayEvent(parsed,sequence+1);
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
    if(sourcesByRef.has(record.lineageRef))return Object.freeze({status:'IDEMPOTENT',lineageRef:record.lineageRef});
    assertSourceCanApply(record);
    appendEvent(EVENT_TYPES.SOURCE,record,record.receivedAt);
    applySource(record);
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
    if(outputsByRef.has(record.lineageRef))return Object.freeze({status:'IDEMPOTENT',lineageRef:record.lineageRef});
    assertOutputCanApply(record);
    appendEvent(EVENT_TYPES.OUTPUT,record,record.asOf);
    applyOutput(record);
    return Object.freeze({status:'RECORDED',lineageRef:record.lineageRef});
  }

  function source(lineageRef){return sourcesByRef.get(lineageRef)||null;}
  function output(lineageRef){return outputsByRef.get(lineageRef)||null;}

  function traceOutput(lineageRef){
    const record=outputsByRef.get(lineageRef);
    if(!record)return null;
    const sources=record.sourceLineageRefs.map(ref=>sourcesByRef.get(ref));
    const observations=record.observationRefs.map(ref=>observationsByRef.get(ref));
    return deepFreeze({
      output:record,
      sources:Object.freeze(sources),
      observations:Object.freeze(observations),
      researchOnly:true,
      executionWrite:false
    });
  }

  replay();

  return Object.freeze({recordSource,recordOutput,source,output,traceOutput});
}

module.exports=Object.freeze({EVENT_SCHEMA,EVENT_TYPES,createDurableSourceLineageStore});
