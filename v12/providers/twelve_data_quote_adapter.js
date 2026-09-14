'use strict';

const M=require('../core/market_core.js');
const N=require('../data/normalizer.js');

const SOURCE='TWELVEDATA:QUOTE:US_DEFAULT';
const descriptor=Object.freeze({
  id:'twelve-data-us-quote',
  sourceLabel:'Twelve Data US Equities Default Feed',
  markets:['US'],
  capabilities:['QUOTE'],
  transport:'CREDENTIALED_READ_ONLY',
  executionWrite:false,
  serverOnly:true,
  marketScope:'LIMITED_US_VENUES',
  consolidated:false,
  nbbo:false
});

function object(value){return value&&typeof value==='object'&&!Array.isArray(value)}
function numeric(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const number=Number(String(value).replace(/,/g,'').trim());
  return Number.isFinite(number)?number:null;
}
function providerTime(payload){
  const raw=payload.last_quote_at??payload.timestamp;
  const seconds=numeric(raw);
  if(seconds===null||!Number.isInteger(seconds)||seconds<0)throw Error('QUOTE_TIME_INVALID');
  return seconds*1000;
}
function observation(instrument,field,value,unit,observedAt,receivedAt){
  return N.makeObservation({
    instrument,field,value,unit,
    observedAt,receivedAt,source:SOURCE,
    status:'SNAPSHOT',confidence:1
  });
}

function normalizeQuote(payload,{instrument,receivedAt}={}){
  if(!object(payload))throw Error('QUOTE_PAYLOAD_REQUIRED');
  const instrumentCheck=M.validateInstrument(instrument);
  if(!instrumentCheck.ok||instrument?.market!=='US')throw Error('QUOTE_INSTRUMENT_INVALID');
  if(!Number.isFinite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');

  const symbol=String(payload.symbol??'').trim().toUpperCase();
  if(symbol!==instrument.symbol)throw Error('QUOTE_SYMBOL_MISMATCH');
  const currency=String(payload.currency??'').trim().toUpperCase();
  if(currency!==instrument.currency)throw Error('QUOTE_CURRENCY_MISMATCH');
  const observedAt=providerTime(payload);
  if(observedAt>receivedAt)throw Error('QUOTE_TIME_INVALID');

  const close=numeric(payload.close);
  if(close===null)throw Error('QUOTE_CLOSE_REQUIRED');
  const values=Object.freeze({
    open:numeric(payload.open),high:numeric(payload.high),low:numeric(payload.low),close,
    volume:numeric(payload.volume),previousClose:numeric(payload.previous_close),
    change:numeric(payload.change),changePct:numeric(payload.percent_change),
    averageVolume:numeric(payload.average_volume)
  });
  const priceUnit=`${instrument.currency}_PER_SHARE`;
  const definitions=[
    ['price.close',values.close,priceUnit],
    ['price.open',values.open,priceUnit],
    ['price.high',values.high,priceUnit],
    ['price.low',values.low,priceUnit],
    ['volume.shares',values.volume,'SHARE'],
    ['price.previous_close',values.previousClose,priceUnit],
    ['price.change',values.change,priceUnit],
    ['price.change_pct',values.changePct,'PCT'],
    ['volume.average',values.averageVolume,'SHARE']
  ];
  const observations=definitions.filter(([,value])=>value!==null).map(([field,value,unit])=>observation(instrument,field,value,unit,observedAt,receivedAt));

  return Object.freeze({
    schemaVersion:'foxyya-us-limited-quote/1',
    instrument:Object.freeze({...instrument}),
    name:String(payload.name??'').trim()||null,
    exchange:String(payload.exchange??'').trim()||null,
    micCode:String(payload.mic_code??'').trim()||null,
    currency:instrument.currency,
    observedAt,receivedAt,
    values,
    marketScope:'LIMITED_US_VENUES',
    consolidated:false,
    nbbo:false,
    source:SOURCE,
    observations:Object.freeze(observations),
    researchOnly:true,
    executionWrite:false
  });
}

function normalize(dataset,payload,context={}){
  if(dataset==='QUOTE')return normalizeQuote(payload,context);
  throw Error('DATASET_UNSUPPORTED');
}

module.exports=Object.freeze({descriptor,SOURCE,normalizeQuote,normalize});
