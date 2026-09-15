'use strict';

const N=require('../data/context_normalizer.js');

const SOURCE='TWELVEDATA:VOLATILITY:US';
const descriptor=Object.freeze({
  id:'twelve-data-us-volatility',
  sourceLabel:'Twelve Data Global Indices API',
  markets:['US'],
  capabilities:['VOLATILITY_INDEX'],
  transport:'CREDENTIALED_READ_ONLY',
  executionWrite:false,
  serverOnly:true,
  marketScope:'VIX_LIKE_INDEX_CONTEXT'
});

function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function numeric(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const number=Number(String(value).replace(/,/g,'').trim());
  return Number.isFinite(number)?number:null;
}
function providerTime(payload){
  const raw=payload.last_quote_at??payload.timestamp;
  const seconds=numeric(raw);
  if(seconds===null||!Number.isInteger(seconds)||seconds<0)throw Error('VOLATILITY_TIME_INVALID');
  return seconds*1000;
}
function canonicalToken(value){
  const raw=String(value??'').trim().toUpperCase();
  if(!raw)throw Error('VOLATILITY_SYMBOL_REQUIRED');
  let out='';
  for(const ch of raw){
    if(/^[A-Z0-9.-]$/.test(ch)){out+=ch;continue;}
    out+=`_x${Buffer.from(ch,'utf8').toString('hex')}_`;
  }
  return out;
}
function observation(entityId,field,value,unit,observedAt,receivedAt){
  return N.makeContextObservation({
    entityId,scope:'US',field,value,unit,
    observedAt,receivedAt,source:SOURCE,
    status:'SNAPSHOT',confidence:1
  });
}

function normalizeVolatilityIndex(payload,{expectedSymbol,receivedAt}={}){
  if(!object(payload))throw Error('VOLATILITY_PAYLOAD_REQUIRED');
  if(!Number.isFinite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');
  const expected=String(expectedSymbol??'').trim().toUpperCase();
  if(!expected)throw Error('VOLATILITY_SYMBOL_REQUIRED');
  const symbol=String(payload.symbol??'').trim().toUpperCase();
  if(symbol!==expected)throw Error('VOLATILITY_SYMBOL_MISMATCH');
  const observedAt=providerTime(payload);
  if(observedAt>receivedAt)throw Error('VOLATILITY_TIME_INVALID');
  const level=numeric(payload.close);
  if(level===null)throw Error('VOLATILITY_LEVEL_REQUIRED');
  const values=Object.freeze({
    level,
    open:numeric(payload.open),
    high:numeric(payload.high),
    low:numeric(payload.low),
    previousClose:numeric(payload.previous_close),
    change:numeric(payload.change),
    changePct:numeric(payload.percent_change)
  });
  const entityId=`INDEX:US:VOLATILITY:${canonicalToken(symbol)}`;
  const definitions=[
    ['volatility.index.level',values.level,'INDEX'],
    ['volatility.index.open',values.open,'INDEX'],
    ['volatility.index.high',values.high,'INDEX'],
    ['volatility.index.low',values.low,'INDEX'],
    ['volatility.index.previous_close',values.previousClose,'INDEX'],
    ['volatility.index.change',values.change,'INDEX'],
    ['volatility.index.change_pct',values.changePct,'PCT']
  ];
  const observations=definitions
    .filter(([,value])=>value!==null)
    .map(([field,value,unit])=>observation(entityId,field,value,unit,observedAt,receivedAt));

  return Object.freeze({
    schemaVersion:'foxyya-us-volatility-context/1',
    entityId,
    providerSymbol:symbol,
    name:String(payload.name??'').trim()||null,
    exchange:String(payload.exchange??'').trim()||null,
    observedAt,
    receivedAt,
    values,
    marketScope:'VIX_LIKE_INDEX_CONTEXT',
    source:SOURCE,
    observations:Object.freeze(observations),
    researchOnly:true,
    executionWrite:false
  });
}

function normalize(dataset,payload,context={}){
  if(dataset==='VOLATILITY_INDEX')return normalizeVolatilityIndex(payload,context);
  throw Error('DATASET_UNSUPPORTED');
}

module.exports=Object.freeze({descriptor,SOURCE,normalizeVolatilityIndex,normalize});
