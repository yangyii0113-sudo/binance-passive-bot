'use strict';

const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Perf=require('../results/forward_performance.js');

const EVENT_SCHEMA='foxyya-forward-research-event/1';
const EVENT_TYPES=Object.freeze({CREATE:'TRACK_CREATED',SESSION:'SESSION_RECORDED'});
const SCAN_CHUNK_BYTES=64*1024;

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function stable(value){if(Array.isArray(value))return value.map(stable);if(object(value)){const out={};for(const key of Object.keys(value).sort())out[key]=stable(value[key]);return out;}return value;}
function stringify(value){return JSON.stringify(stable(value));}
function digest(value){return crypto.createHash('sha256').update(stringify(value)).digest('hex');}
function freeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;for(const key of Object.keys(value))freeze(value[key]);return Object.freeze(value);}

function canonicalInitialTrack(value){
  if(!object(value)||value.schemaVersion!=='foxyya-forward-research-track/1'||value.validationMode!=='FORWARD_ONLY'||value.researchOnly!==true||value.executionWrite!==false)throw Error('FORWARD_TRACK_REQUIRED');
  const canonical=Perf.createForwardTrack({
    id:value.id,market:value.market,instrumentId:value.instrumentId,direction:value.direction,
    researchScore:value.researchScore===null?undefined:value.researchScore,priority:value.priority,
    createdAt:value.createdAt,baseline:value.baseline,regime:value.regime,researchOnly:true,executionWrite:false
  });
  if(Array.isArray(value.sessions)&&value.sessions.length)throw Error('INITIAL_TRACK_SESSIONS_FORBIDDEN');
  return canonical;
}

function createDurableForwardResearchStore({filePath,now=Date.now,fsImpl=fs}={}){
  if(typeof filePath!=='string'||!filePath.endsWith('.forward.jsonl'))throw Error('FORWARD_LEDGER_PATH_INVALID');
  if(typeof now!=='function'||!fsImpl||typeof fsImpl!=='object')throw Error('FORWARD_LEDGER_DEPENDENCY_INVALID');
  const tracks=new Map();
  let sequence=0;

  function currentTime(){const value=Number(now());if(!finite(value)||value<0)throw Error('FORWARD_LEDGER_CLOCK_INVALID');return value;}
  function eventBase(sequenceValue,type,recordedAt,payload){return {schema:EVENT_SCHEMA,sequence:sequenceValue,type,recordedAt,payload};}
  function makeEvent(type,payload){const recordedAt=currentTime();const base=eventBase(sequence+1,type,recordedAt,payload);return freeze({...base,checksum:digest(base)});}
  function validateEvent(raw,expected){
    if(!object(raw)||raw.schema!==EVENT_SCHEMA||raw.sequence!==expected||!Object.values(EVENT_TYPES).includes(raw.type)||!finite(raw.recordedAt)||!object(raw.payload)||typeof raw.checksum!=='string')throw Error('FORWARD_LEDGER_CORRUPT');
    if(raw.checksum!==digest(eventBase(raw.sequence,raw.type,raw.recordedAt,raw.payload)))throw Error('FORWARD_LEDGER_CORRUPT');
    return raw;
  }

  function append(event){
    let fd=null;
    try{
      fsImpl.mkdirSync(path.dirname(filePath),{recursive:true});
      fd=fsImpl.openSync(filePath,'a');
      const data=Buffer.from(JSON.stringify(event)+'\n','utf8');
      let offset=0;
      while(offset<data.length){const wrote=fsImpl.writeSync(fd,data,offset,data.length-offset,null);if(!Number.isInteger(wrote)||wrote<=0)throw Error('FORWARD_LEDGER_WRITE_FAILED');offset+=wrote;}
      fsImpl.fsyncSync(fd);fsImpl.closeSync(fd);fd=null;
    }catch(error){if(fd!==null){try{fsImpl.closeSync(fd);}catch(_){}}if(error?.message==='FORWARD_LEDGER_WRITE_FAILED')throw error;throw Error('FORWARD_LEDGER_WRITE_FAILED');}
  }

  function apply(raw,{replay=false}={}){
    try{
      if(raw.type===EVENT_TYPES.CREATE){
        const track=canonicalInitialTrack(raw.payload.track);
        const existing=tracks.get(track.id);
        if(existing&&stringify(existing)!==stringify(track))throw Error('FORWARD_TRACK_CONFLICT');
        if(!existing)tracks.set(track.id,track);
      }else if(raw.type===EVENT_TYPES.SESSION){
        const id=raw.payload.trackId,existing=tracks.get(id);
        if(!existing)throw Error('FORWARD_TRACK_NOT_FOUND');
        const next=Perf.recordClosedSession(existing,raw.payload.session);
        tracks.set(id,next);
      }else throw Error('FORWARD_LEDGER_CORRUPT');
    }catch(error){if(replay)throw Error('FORWARD_LEDGER_CORRUPT');throw error;}
  }

  function parseLine(buffer){
    if(!buffer.length||!buffer.toString('utf8').trim())return;
    let raw;try{raw=JSON.parse(buffer.toString('utf8'));}catch(_){throw Error('FORWARD_LEDGER_CORRUPT');}
    validateEvent(raw,sequence+1);apply(raw,{replay:true});sequence=raw.sequence;
  }

  function replay(){
    if(!fsImpl.existsSync(filePath))return;
    let fd=null;
    try{
      fd=fsImpl.openSync(filePath,'r');
      const chunk=Buffer.allocUnsafe(SCAN_CHUNK_BYTES);let position=0,parts=[],partsLength=0;
      while(true){
        const count=fsImpl.readSync(fd,chunk,0,chunk.length,position);if(!Number.isInteger(count)||count<0)throw Error('FORWARD_LEDGER_CORRUPT');if(count===0)break;
        let start=0;
        for(let i=0;i<count;i++)if(chunk[i]===0x0a){const segment=Buffer.from(chunk.subarray(start,i));const len=partsLength+segment.length;const line=partsLength?Buffer.concat([...parts,segment],len):segment;parseLine(line);parts=[];partsLength=0;start=i+1;}
        if(start<count){const tail=Buffer.from(chunk.subarray(start,count));parts.push(tail);partsLength+=tail.length;}
        position+=count;
      }
      if(partsLength){const tail=parts.length===1?parts[0]:Buffer.concat(parts,partsLength);parseLine(tail);}
    }catch(error){if(error?.message==='FORWARD_LEDGER_CORRUPT')throw error;throw Error('FORWARD_LEDGER_CORRUPT');}
    finally{if(fd!==null){try{fsImpl.closeSync(fd);}catch(_){}}}
  }

  function createTrack(value){
    const track=canonicalInitialTrack(value);const existing=tracks.get(track.id);
    if(existing){if(stringify(existing)===stringify(track))return freeze({status:'IDEMPOTENT',trackId:track.id});throw Error('FORWARD_TRACK_CONFLICT');}
    const event=makeEvent(EVENT_TYPES.CREATE,{track});
    if(event.recordedAt<track.createdAt)throw Error('FORWARD_LEDGER_TIME_ORDER_INVALID');
    append(event);apply(event);sequence=event.sequence;
    return freeze({status:'CREATED',trackId:track.id});
  }

  function recordSession(trackId,session){
    if(typeof trackId!=='string'||!trackId)throw Error('FORWARD_TRACK_ID_REQUIRED');
    const existing=tracks.get(trackId);if(!existing)throw Error('FORWARD_TRACK_NOT_FOUND');
    const next=Perf.recordClosedSession(existing,session);
    const event=makeEvent(EVENT_TYPES.SESSION,{trackId,session});
    if(event.recordedAt<session.asOf)throw Error('FORWARD_LEDGER_TIME_ORDER_INVALID');
    append(event);tracks.set(trackId,next);sequence=event.sequence;
    return next;
  }

  function getTrack(id){return tracks.get(id)||null;}
  function listTracks({market,status}={}){
    const rows=[...tracks.values()].filter(row=>(!market||row.market===market)&&(!status||row.status===status));
    rows.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));return freeze(rows);
  }
  function summarize(market,asOf=currentTime()){return Perf.summarizeForwardPerformance([...tracks.values()],{market,asOf});}

  replay();
  return Object.freeze({createTrack,recordSession,getTrack,listTracks,summarize});
}

module.exports=Object.freeze({EVENT_SCHEMA,EVENT_TYPES,createDurableForwardResearchStore});
