'use strict';

const Quote=require('../providers/twelve_data_quote_adapter.js');
const Volatility=require('../providers/twelve_data_volatility_adapter.js');

const META=Object.freeze({
  sourceId:'twelve-data-us-quote',
  datasetId:'TWELVEDATA:QUOTE:US_DEFAULT',
  bindingId:'twelve-data-us-quote',
  bindingVersion:'foxyya-binding/twelve-data-us-quote/1',
  adapterId:'twelve-data-us-quote',
  adapterVersion:'foxyya-adapter/twelve-data-us-quote/1',
  canonicalSchemaVersion:'foxyya-observation/1',
  researchOnly:true,
  executionWrite:false
});
const VOLATILITY_META=Object.freeze({
  sourceId:'twelve-data-us-volatility',
  datasetId:'TWELVEDATA:VOLATILITY:US',
  bindingId:'twelve-data-us-volatility',
  bindingVersion:'foxyya-binding/twelve-data-us-volatility/1',
  adapterId:'twelve-data-us-volatility',
  adapterVersion:'foxyya-adapter/twelve-data-us-volatility/1',
  canonicalSchemaVersion:'foxyya-context-observation/1',
  researchOnly:true,
  executionWrite:false
});

function finiteTime(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0;}
function timing(envelope){
  const fetchStartedAt=finiteTime(envelope?.fetchStartedAt)?envelope.fetchStartedAt:null;
  const receivedAt=finiteTime(envelope?.receivedAt)?envelope.receivedAt:null;
  if(fetchStartedAt!==null&&receivedAt!==null&&fetchStartedAt>receivedAt)throw Error('SOURCE_TIME_ORDER_INVALID');
  return {fetchStartedAt,receivedAt};
}
function unavailable(meta,reason,envelope){
  const times=timing(envelope);
  return Object.freeze({status:'UNAVAILABLE',sourceId:meta.sourceId,reason:typeof reason==='string'&&reason?reason:'UNAVAILABLE',fetchStartedAt:times.fetchStartedAt,receivedAt:times.receivedAt,data:null,lineageMeta:meta,researchOnly:true,executionWrite:false});
}
function available(meta,envelope,data){
  const times=timing(envelope);
  if(times.receivedAt===null)throw Error('RECEIVED_AT_INVALID');
  return Object.freeze({status:'AVAILABLE',sourceId:meta.sourceId,fetchStartedAt:times.fetchStartedAt,receivedAt:times.receivedAt,data,lineageMeta:meta,researchOnly:true,executionWrite:false});
}
function validateLoader(loader){if(!loader||typeof loader.load!=='function')throw Error('LOADER_REQUIRED');return loader;}
function validateEnvelope(envelope,meta){
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw Error('SOURCE_RESULT_INVALID');
  if(envelope.sourceId!==meta.sourceId)throw Error('SOURCE_ID_MISMATCH');
  if(envelope.researchOnly!==true||envelope.executionWrite!==false)throw Error('READ_ONLY_REQUIRED');
  if(envelope.status!=='AVAILABLE'&&envelope.status!=='UNAVAILABLE')throw Error('SOURCE_STATUS_INVALID');
  return envelope;
}

function twelveDataQuote({loader,instrument}={}){
  return Object.freeze({
    lineageMeta:META,
    async load(){
      const envelope=validateEnvelope(await validateLoader(loader).load(),META);
      if(envelope.status==='UNAVAILABLE')return unavailable(META,envelope.reason,envelope);
      const data=Quote.normalizeQuote(envelope.data,{instrument,receivedAt:envelope.receivedAt});
      return available(META,envelope,data);
    }
  });
}

function twelveDataVolatility({loader,expectedSymbol}={}){
  return Object.freeze({
    lineageMeta:VOLATILITY_META,
    async load(){
      const envelope=validateEnvelope(await validateLoader(loader).load(),VOLATILITY_META);
      if(envelope.status==='UNAVAILABLE')return unavailable(VOLATILITY_META,envelope.reason,envelope);
      const data=Volatility.normalizeVolatilityIndex(envelope.data,{expectedSymbol,receivedAt:envelope.receivedAt});
      return available(VOLATILITY_META,envelope,data);
    }
  });
}

function createTwelveDataSourceBindings(){return Object.freeze({twelveDataQuote,twelveDataVolatility});}

module.exports=Object.freeze({META,VOLATILITY_META,twelveDataQuote,twelveDataVolatility,createTwelveDataSourceBindings});
