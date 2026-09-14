'use strict';

const Quote=require('../providers/twelve_data_quote_adapter.js');

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

function finiteTime(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0;}
function timing(envelope){
  const fetchStartedAt=finiteTime(envelope?.fetchStartedAt)?envelope.fetchStartedAt:null;
  const receivedAt=finiteTime(envelope?.receivedAt)?envelope.receivedAt:null;
  if(fetchStartedAt!==null&&receivedAt!==null&&fetchStartedAt>receivedAt)throw Error('SOURCE_TIME_ORDER_INVALID');
  return {fetchStartedAt,receivedAt};
}
function unavailable(reason,envelope){
  const times=timing(envelope);
  return Object.freeze({status:'UNAVAILABLE',sourceId:META.sourceId,reason:typeof reason==='string'&&reason?reason:'UNAVAILABLE',fetchStartedAt:times.fetchStartedAt,receivedAt:times.receivedAt,data:null,lineageMeta:META,researchOnly:true,executionWrite:false});
}
function available(envelope,data){
  const times=timing(envelope);
  if(times.receivedAt===null)throw Error('RECEIVED_AT_INVALID');
  return Object.freeze({status:'AVAILABLE',sourceId:META.sourceId,fetchStartedAt:times.fetchStartedAt,receivedAt:times.receivedAt,data,lineageMeta:META,researchOnly:true,executionWrite:false});
}
function validateLoader(loader){if(!loader||typeof loader.load!=='function')throw Error('LOADER_REQUIRED');return loader;}

function twelveDataQuote({loader,instrument}={}){
  return Object.freeze({
    lineageMeta:META,
    async load(){
      const envelope=await validateLoader(loader).load();
      if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw Error('SOURCE_RESULT_INVALID');
      if(envelope.sourceId!==META.sourceId)throw Error('SOURCE_ID_MISMATCH');
      if(envelope.researchOnly!==true||envelope.executionWrite!==false)throw Error('READ_ONLY_REQUIRED');
      if(envelope.status==='UNAVAILABLE')return unavailable(envelope.reason,envelope);
      if(envelope.status!=='AVAILABLE')throw Error('SOURCE_STATUS_INVALID');
      const data=Quote.normalizeQuote(envelope.data,{instrument,receivedAt:envelope.receivedAt});
      return available(envelope,data);
    }
  });
}

function createTwelveDataSourceBindings(){return Object.freeze({twelveDataQuote});}

module.exports=Object.freeze({META,twelveDataQuote,createTwelveDataSourceBindings});
