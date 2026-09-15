'use strict';

const N=require('../data/context_normalizer.js');

const SOURCE='TWELVEDATA:BREADTH:EU';
const MARKET_SCOPE='PAN_EUROPE_CBOE_EQUITIES';
const ENTITY_ID='MARKET:EU:BREADTH:CBOE_EUROPE';
const descriptor=Object.freeze({
  id:'twelve-data-eu-breadth',
  sourceLabel:'Twelve Data × Cboe Europe Equities',
  markets:['EU'],
  capabilities:['MARKET_BREADTH'],
  transport:'CREDENTIALED_READ_ONLY',
  executionWrite:false,
  serverOnly:true,
  marketScope:MARKET_SCOPE
});

function numeric(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const number=Number(String(value).replace(/,/g,'').trim());
  return Number.isFinite(number)?number:null;
}
function providerTime(row){
  const raw=row?.last_quote_at??row?.timestamp;
  const seconds=numeric(raw);
  if(seconds===null||!Number.isInteger(seconds)||seconds<0)throw Error('BREADTH_TIME_INVALID');
  return seconds*1000;
}
function observation(field,value,unit,observedAt,receivedAt){
  return N.makeContextObservation({
    entityId:ENTITY_ID,scope:'EU',field,value,unit,
    observedAt,receivedAt,source:SOURCE,status:'SNAPSHOT',confidence:1
  });
}

function normalizeBreadth(payload,{receivedAt,marketScope}={}){
  if(marketScope!==MARKET_SCOPE)throw Error('BREADTH_MARKET_SCOPE_INVALID');
  if(!Number.isFinite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');
  if(!Array.isArray(payload)||payload.length===0)throw Error('BREADTH_UNIVERSE_EMPTY');

  const symbols=new Set();
  const times=[];
  let advancers=0;
  let decliners=0;
  let unchanged=0;

  for(const row of payload){
    if(!row||typeof row!=='object'||Array.isArray(row))throw Error('BREADTH_ROW_INVALID');
    const symbol=String(row.symbol??'').trim().toUpperCase();
    if(!symbol)throw Error('BREADTH_SYMBOL_REQUIRED');
    if(symbols.has(symbol))throw Error('BREADTH_SYMBOL_DUPLICATE');
    symbols.add(symbol);
    const close=numeric(row.close);
    const previous=numeric(row.previous_close);
    if(close===null||previous===null)throw Error('BREADTH_PRICE_REQUIRED');
    const observedAt=providerTime(row);
    if(observedAt>receivedAt)throw Error('BREADTH_TIME_INVALID');
    times.push(observedAt);
    if(close>previous)advancers+=1;
    else if(close<previous)decliners+=1;
    else unchanged+=1;
  }

  const total=payload.length;
  const observedAt=Math.min(...times);
  const values=Object.freeze({
    total,advancers,decliners,unchanged,
    advanceRatio:advancers/total,
    declineRatio:decliners/total
  });
  const observations=Object.freeze([
    observation('breadth.issues.total',values.total,'COUNT',observedAt,receivedAt),
    observation('breadth.issues.advancing',values.advancers,'COUNT',observedAt,receivedAt),
    observation('breadth.issues.declining',values.decliners,'COUNT',observedAt,receivedAt),
    observation('breadth.issues.unchanged',values.unchanged,'COUNT',observedAt,receivedAt),
    observation('breadth.advance_ratio',values.advanceRatio,'RATIO',observedAt,receivedAt),
    observation('breadth.decline_ratio',values.declineRatio,'RATIO',observedAt,receivedAt)
  ]);

  return Object.freeze({
    schemaVersion:'foxyya-eu-market-breadth/1',
    entityId:ENTITY_ID,
    observedAt,receivedAt,values,
    marketScope:MARKET_SCOPE,
    source:SOURCE,
    observations,
    researchOnly:true,
    executionWrite:false
  });
}

function normalize(dataset,payload,context={}){
  if(dataset==='MARKET_BREADTH')return normalizeBreadth(payload,context);
  throw Error('DATASET_UNSUPPORTED');
}

module.exports=Object.freeze({descriptor,SOURCE,MARKET_SCOPE,ENTITY_ID,normalizeBreadth,normalize});
