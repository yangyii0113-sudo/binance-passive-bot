'use strict';

const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createDurableSourceLineageStore,EVENT_SCHEMA}=require('./durable_source_lineage_store.js');

const SCAN_CHUNK_BYTES=64*1024;
const EVENT_PREFIX=`{"schema":"${EVENT_SCHEMA}"`;

function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
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
function eventPayload(event){return {schema:event.schema,sequence:event.sequence,type:event.type,recordedAt:event.recordedAt,record:event.record};}
function nonEmpty(value){return typeof value==='string'&&value.length>0;}

function validateLegacyEvent(value){
  if(!object(value)||value.schema!==EVENT_SCHEMA||!Number.isInteger(value.sequence)||value.sequence<=0||typeof value.type!=='string'||!Number.isFinite(value.recordedAt)||value.recordedAt<0||!object(value.record)||typeof value.checksum!=='string')return null;
  if(value.checksum!==sha256(eventPayload(value)))return null;
  return value;
}

function extractObjectAt(text,start){
  if(text[start]!=='{')return null;
  let depth=0;
  let inString=false;
  let escaped=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(inString){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch==='"')inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch==='{')depth+=1;
    else if(ch==='}'){
      depth-=1;
      if(depth===0)return {jsonText:text.slice(start,i+1),end:i+1};
      if(depth<0)return null;
    }
  }
  return null;
}

function validCandidates(text,expectedSequence){
  const candidates=[];
  let cursor=0;
  while(cursor<text.length){
    const start=text.indexOf(EVENT_PREFIX,cursor);
    if(start<0)break;
    const extracted=extractObjectAt(text,start);
    cursor=start+1;
    if(!extracted)continue;
    let parsed;
    try{parsed=JSON.parse(extracted.jsonText);}catch(_error){continue;}
    const event=validateLegacyEvent(parsed);
    if(!event||event.sequence!==expectedSequence)continue;
    candidates.push({event,jsonText:JSON.stringify(event),start,end:extracted.end});
  }
  return candidates;
}

function chooseCandidate(text,expectedSequence){
  let exact=null;
  try{exact=validateLegacyEvent(JSON.parse(text));}catch(_error){}
  if(exact){
    if(exact.sequence!==expectedSequence)throw Error('LINEAGE_SALVAGE_SEQUENCE_GAP');
    return {event:exact,recovered:false};
  }

  const candidates=validCandidates(text,expectedSequence);
  if(!candidates.length)return null;
  const byChecksum=new Map();
  for(const candidate of candidates){
    const key=candidate.event.checksum;
    if(!byChecksum.has(key))byChecksum.set(key,candidate);
  }
  if(byChecksum.size>1)throw Error('LINEAGE_SALVAGE_AMBIGUOUS');
  return {event:[...byChecksum.values()][0].event,recovered:true};
}

function writeAll(fd,buffer,fsImpl){
  let written=0;
  while(written<buffer.length){
    const count=fsImpl.writeSync(fd,buffer,written,buffer.length-written,null);
    if(!Number.isInteger(count)||count<=0)throw Error('LINEAGE_SALVAGE_WRITE_FAILED');
    written+=count;
  }
}

function salvageLegacyJournal({filePath,scratchDir='/tmp',externalBackupVerified=false,now=Date.now,fsImpl=fs}={}){
  if(!externalBackupVerified)throw Error('LINEAGE_BACKUP_REQUIRED');
  if(typeof filePath!=='string'||!filePath.endsWith('.lineage.jsonl')||typeof scratchDir!=='string'||!scratchDir||typeof now!=='function'||!fsImpl||typeof fsImpl!=='object')throw Error('LINEAGE_SALVAGE_CONFIG_INVALID');
  if(!fsImpl.existsSync(filePath))throw Error('LINEAGE_SALVAGE_SOURCE_MISSING');

  const sourceStat=fsImpl.statSync(filePath);
  const suffix=`${process.pid}-${Number(now())}`;
  const scratchFilePath=path.join(path.resolve(scratchDir),`${path.basename(filePath,'.lineage.jsonl')}.salvaged-${suffix}.lineage.jsonl`);
  let sourceFd=null;
  let outFd=null;
  let expectedSequence=1;
  let eventCount=0;
  let recoveredCorruptLines=0;
  let droppedTailBytes=0;
  let success=false;

  function emit(event){
    if(event.sequence!==expectedSequence)throw Error('LINEAGE_SALVAGE_SEQUENCE_GAP');
    writeAll(outFd,Buffer.from(JSON.stringify(event)+'\n','utf8'),fsImpl);
    expectedSequence+=1;
    eventCount+=1;
  }

  function processLine(buffer,{isTail=false}={}){
    if(!buffer.length||!buffer.toString('utf8').trim())return;
    const text=buffer.toString('utf8');
    const chosen=chooseCandidate(text,expectedSequence);
    if(chosen){
      if(chosen.recovered)recoveredCorruptLines+=1;
      emit(chosen.event);
      return;
    }
    if(isTail){
      droppedTailBytes+=buffer.length;
      return;
    }
    throw Error('LINEAGE_SALVAGE_UNRECOVERABLE');
  }

  try{
    fsImpl.mkdirSync(path.dirname(scratchFilePath),{recursive:true});
    if(fsImpl.existsSync(scratchFilePath))fsImpl.unlinkSync(scratchFilePath);
    sourceFd=fsImpl.openSync(filePath,'r');
    outFd=fsImpl.openSync(scratchFilePath,'wx');
    const chunk=Buffer.allocUnsafe(SCAN_CHUNK_BYTES);
    let filePosition=0;
    let carry=[];
    let carryLength=0;
    while(true){
      const bytesRead=fsImpl.readSync(sourceFd,chunk,0,chunk.length,filePosition);
      if(!Number.isInteger(bytesRead)||bytesRead<0)throw Error('LINEAGE_SALVAGE_READ_FAILED');
      if(bytesRead===0)break;
      let segmentStart=0;
      for(let i=0;i<bytesRead;i++){
        if(chunk[i]!==0x0a)continue;
        const segment=Buffer.from(chunk.subarray(segmentStart,i));
        const length=carryLength+segment.length;
        const line=carryLength?Buffer.concat([...carry,segment],length):segment;
        processLine(line,{isTail:false});
        carry=[];
        carryLength=0;
        segmentStart=i+1;
      }
      if(segmentStart<bytesRead){
        const rest=Buffer.from(chunk.subarray(segmentStart,bytesRead));
        carry.push(rest);
        carryLength+=rest.length;
      }
      filePosition+=bytesRead;
    }
    if(carryLength){
      const tail=carry.length===1?carry[0]:Buffer.concat(carry,carryLength);
      processLine(tail,{isTail:true});
    }
    fsImpl.fsyncSync(outFd);
    fsImpl.closeSync(outFd);outFd=null;
    fsImpl.closeSync(sourceFd);sourceFd=null;

    // Replay through the canonical durable store. This validates sequence, checksums,
    // source/output lineage identities, references, observation ownership, and time order.
    createDurableSourceLineageStore({filePath:scratchFilePath,now,fsImpl,compactThresholdBytes:0});

    const after=fsImpl.statSync(filePath);
    if(after.size!==sourceStat.size||after.mtimeMs!==sourceStat.mtimeMs)throw Error('LINEAGE_SALVAGE_SOURCE_CHANGED');
    success=true;
    return Object.freeze({
      status:'SALVAGED',scratchFilePath,eventCount,recoveredCorruptLines,droppedTailBytes,
      originalBytes:sourceStat.size,salvagedBytes:fsImpl.statSync(scratchFilePath).size
    });
  }catch(error){
    if(error?.message&&/^LINEAGE_/.test(error.message))throw error;
    throw Error('LINEAGE_SALVAGE_FAILED');
  }finally{
    if(outFd!==null){try{fsImpl.closeSync(outFd);}catch(_error){}}
    if(sourceFd!==null){try{fsImpl.closeSync(sourceFd);}catch(_error){}}
    if(!success){try{if(fsImpl.existsSync(scratchFilePath))fsImpl.unlinkSync(scratchFilePath);}catch(_error){}}
  }
}

module.exports=Object.freeze({salvageLegacyJournal});
