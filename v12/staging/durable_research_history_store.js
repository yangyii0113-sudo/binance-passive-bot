'use strict';

const fsDefault=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createResearchHistoryStore}=require('./research_history_store.js');

const EVENT_SCHEMA='foxyya-research-history-event/1';
const EVENT_TYPES=Object.freeze(['REVENUE_RECORDED','INSTITUTIONAL_SESSION_RECORDED']);

function text(value){return typeof value==='string'&&value.length>0;}
function finite(value){return typeof value==='number'&&Number.isFinite(value);}

function assertJournalPath(filePath){
  if(!text(filePath)||!filePath.toLowerCase().endsWith('.research.jsonl'))throw Error('RESEARCH_JOURNAL_PATH_INVALID');
  return filePath;
}

function optionalVersion(value,label){
  if(value===undefined||value===null)return null;
  if(!text(value))throw Error(label+'_INVALID');
  return value;
}

function maxReceived(summary){
  if(!summary||!Array.isArray(summary.observations)||!summary.observations.length)throw Error('OBSERVATIONS_REQUIRED');
  let latest=-Infinity;
  for(const row of summary.observations){
    if(!row||!finite(row.receivedAt))throw Error('RECEIVED_AT_INVALID');
    latest=Math.max(latest,row.receivedAt);
  }
  return latest;
}

function eventMeta(type,payload){
  if(type==='REVENUE_RECORDED'){
    return Object.freeze({
      instrumentId:payload?.instrument?.instrumentId,
      key:payload?.reportPeriod,
      knowledgeAt:maxReceived(payload)
    });
  }
  if(type==='INSTITUTIONAL_SESSION_RECORDED'){
    return Object.freeze({
      instrumentId:payload?.quote?.instrument?.instrumentId,
      key:payload?.quote?.tradeDate,
      knowledgeAt:Math.max(maxReceived(payload?.quote),maxReceived(payload?.flow))
    });
  }
  throw Error('RESEARCH_EVENT_TYPE_INVALID');
}

function checksumMaterial(event){
  return JSON.stringify([
    event.schema,
    event.sequence,
    event.type,
    event.instrumentId,
    event.key,
    event.knowledgeAt,
    event.recordedAt,
    event.modelVersion,
    event.policyVersion,
    event.payload
  ]);
}

function checksum(event){
  return crypto.createHash('sha256').update(checksumMaterial(event)).digest('hex');
}

function withChecksum(event){
  return Object.freeze({...event,checksum:checksum(event)});
}

function validateEvent(event,expectedSequence){
  try{
    if(!event||typeof event!=='object'||Array.isArray(event))throw Error('EVENT_INVALID');
    if(event.schema!==EVENT_SCHEMA)throw Error('SCHEMA_INVALID');
    if(event.sequence!==expectedSequence)throw Error('SEQUENCE_INVALID');
    if(!EVENT_TYPES.includes(event.type))throw Error('TYPE_INVALID');
    if(!text(event.instrumentId)||!text(event.key))throw Error('IDENTITY_INVALID');
    if(!finite(event.knowledgeAt)||!finite(event.recordedAt))throw Error('TIME_INVALID');
    optionalVersion(event.modelVersion,'MODEL_VERSION');
    optionalVersion(event.policyVersion,'POLICY_VERSION');
    if(!event.payload||typeof event.payload!=='object')throw Error('PAYLOAD_INVALID');
    if(typeof event.checksum!=='string'||!/^[a-f0-9]{64}$/.test(event.checksum))throw Error('CHECKSUM_INVALID');
    if(checksum(event)!==event.checksum)throw Error('CHECKSUM_MISMATCH');
    return event;
  }catch(error){
    const wrapped=new Error('RESEARCH_JOURNAL_CORRUPT');
    wrapped.cause=error;
    throw wrapped;
  }
}

function replayEvent(store,event){
  try{
    if(event.type==='REVENUE_RECORDED')store.recordRevenue(event.payload);
    else if(event.type==='INSTITUTIONAL_SESSION_RECORDED')store.recordInstitutionalSession(event.payload);
    else throw Error('TYPE_INVALID');
  }catch(error){
    const wrapped=new Error('RESEARCH_JOURNAL_CORRUPT');
    wrapped.cause=error;
    throw wrapped;
  }
}

function readEvents({filePath,fsImpl}){
  if(!fsImpl.existsSync(filePath))return [];
  let raw;
  try{raw=fsImpl.readFileSync(filePath,'utf8');}
  catch(error){const wrapped=new Error('RESEARCH_JOURNAL_READ_FAILED');wrapped.cause=error;throw wrapped;}
  if(!raw)return [];

  const complete=raw.endsWith('\n')?raw:raw.slice(0,Math.max(0,raw.lastIndexOf('\n')+1));
  if(!complete)return [];
  const lines=complete.split('\n').filter(Boolean);
  const events=[];
  const probe=createResearchHistoryStore();
  for(let i=0;i<lines.length;i++){
    let parsed;
    try{parsed=JSON.parse(lines[i]);}
    catch(error){const wrapped=new Error('RESEARCH_JOURNAL_CORRUPT');wrapped.cause=error;throw wrapped;}
    const event=validateEvent(parsed,i+1);
    replayEvent(probe,event);
    events.push(event);
  }
  return events;
}

function appendLine({filePath,fsImpl,event}){
  const line=JSON.stringify(event)+'\n';
  let fd=null;
  let durable=false;
  try{
    fsImpl.mkdirSync(path.dirname(filePath),{recursive:true});
    fd=fsImpl.openSync(filePath,'a',0o600);
    const bytes=Buffer.from(line,'utf8');
    let offset=0;
    while(offset<bytes.length){
      const written=fsImpl.writeSync(fd,bytes,offset,bytes.length-offset,null);
      if(!Number.isInteger(written)||written<=0)throw Error('WRITE_ZERO');
      offset+=written;
    }
    fsImpl.fsyncSync(fd);
    durable=true;
  }catch(error){
    const wrapped=new Error('DURABLE_WRITE_FAILED');
    wrapped.cause=error;
    throw wrapped;
  }finally{
    if(fd!==null){
      try{fsImpl.closeSync(fd);}catch(error){if(!durable){} }
    }
  }
}

function buildProbe(events){
  const probe=createResearchHistoryStore();
  for(const event of events)replayEvent(probe,event);
  return probe;
}

function createDurableResearchHistoryStore({filePath,now=Date.now,fsImpl=fsDefault}={}){
  assertJournalPath(filePath);
  if(typeof now!=='function')throw Error('CLOCK_INVALID');
  if(!fsImpl||typeof fsImpl!=='object')throw Error('FS_INVALID');

  const events=readEvents({filePath,fsImpl});
  const live=createResearchHistoryStore();
  for(const event of events)replayEvent(live,event);

  function createEvent(type,payload,meta={}){
    const m=eventMeta(type,payload);
    const recordedAt=Number(now());
    if(!finite(recordedAt)||recordedAt<m.knowledgeAt)throw Error('RECORDED_AT_INVALID');
    const event={
      schema:EVENT_SCHEMA,
      sequence:events.length+1,
      type,
      instrumentId:m.instrumentId,
      key:m.key,
      knowledgeAt:m.knowledgeAt,
      recordedAt,
      modelVersion:optionalVersion(meta.modelVersion,'MODEL_VERSION'),
      policyVersion:optionalVersion(meta.policyVersion,'POLICY_VERSION'),
      payload
    };
    return withChecksum(event);
  }

  function durableRecord(type,payload,meta,method){
    const probe=buildProbe(events);
    const validation=probe[method](payload);
    if(validation.status==='IDEMPOTENT')return validation;
    const event=createEvent(type,payload,meta||{});
    appendLine({filePath,fsImpl,event});
    const applied=live[method](payload);
    events.push(event);
    return applied;
  }

  function recordRevenue(summary,meta){
    return durableRecord('REVENUE_RECORDED',summary,meta,'recordRevenue');
  }

  function previousRevenue(id,currentPeriod){
    return live.previousRevenue(id,currentPeriod);
  }

  function recordInstitutionalSession(session,meta){
    return durableRecord('INSTITUTIONAL_SESSION_RECORDED',session,meta,'recordInstitutionalSession');
  }

  function institutionalSessions(id,options){
    return live.institutionalSessions(id,options);
  }

  return Object.freeze({recordRevenue,previousRevenue,recordInstitutionalSession,institutionalSessions});
}

module.exports=Object.freeze({createDurableResearchHistoryStore});
