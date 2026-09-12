'use strict';

const crypto=require('node:crypto');
const zlib=require('node:zlib');

const EVENT_SCHEMA='foxyya-lineage-event/1';
const FRAME_SCHEMA='foxyya-lineage-frame/1';
const FRAME_ENCODING='deflate-raw-base64';
const EVENT_TYPES=Object.freeze({SOURCE:'SOURCE_RECORDED',OUTPUT:'OUTPUT_RECORDED'});

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
function eventPayload(event){return {schema:event.schema,sequence:event.sequence,type:event.type,recordedAt:event.recordedAt,record:event.record};}
function framePayload(frame){return {schema:frame.schema,encoding:frame.encoding,sequence:frame.sequence,payload:frame.payload};}
function createEvent({sequence,type,recordedAt,record}){
  const base={schema:EVENT_SCHEMA,sequence,type,recordedAt,record};
  return Object.freeze({...base,checksum:sha256(base)});
}
function validateEvent(raw,expectedSequence){
  if(!object(raw)||raw.schema!==EVENT_SCHEMA||raw.sequence!==expectedSequence||!finite(raw.recordedAt)||raw.recordedAt<0||!object(raw.record)||typeof raw.checksum!=='string')throw Error('LINEAGE_JOURNAL_CORRUPT');
  if(raw.type!==EVENT_TYPES.SOURCE&&raw.type!==EVENT_TYPES.OUTPUT)throw Error('LINEAGE_JOURNAL_CORRUPT');
  if(raw.checksum!==sha256(eventPayload(raw)))throw Error('LINEAGE_JOURNAL_CORRUPT');
  return raw;
}
function encodeFrame(event){
  validateEvent(event,event.sequence);
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
function decodeStoredLine(buffer,expectedSequence){
  let stored;
  try{stored=JSON.parse(buffer.toString('utf8'));}
  catch(_error){throw Error('LINEAGE_JOURNAL_CORRUPT');}
  const legacy=stored?.schema===EVENT_SCHEMA;
  const event=decodeStoredValue(stored);
  validateEvent(event,expectedSequence);
  return Object.freeze({event,legacy});
}
function encodeStoredLine(event){
  const frame=encodeFrame(event);
  return Buffer.from(JSON.stringify(frame)+'\n','utf8');
}
function storedSequence(raw){
  if(!object(raw)||!Number.isInteger(raw.sequence)||raw.sequence<=0)throw Error('LINEAGE_JOURNAL_CORRUPT');
  if(raw.schema!==EVENT_SCHEMA&&raw.schema!==FRAME_SCHEMA)throw Error('LINEAGE_JOURNAL_CORRUPT');
  return raw.sequence;
}

module.exports=Object.freeze({
  EVENT_SCHEMA,FRAME_SCHEMA,FRAME_ENCODING,EVENT_TYPES,
  object,finite,stableStringify,sha256,eventPayload,framePayload,
  createEvent,validateEvent,encodeFrame,decodeStoredValue,decodeStoredLine,encodeStoredLine,storedSequence
});
