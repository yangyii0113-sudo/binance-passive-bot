'use strict';

const TWSE=require('../providers/twse_adapter.js');
const SEC=require('../providers/sec_edgar_adapter.js');
const BLS=require('../providers/bls_adapter.js');
const ECB=require('../providers/ecb_adapter.js');

function unavailable(sourceId,reason){
  return Object.freeze({
    status:'UNAVAILABLE',
    sourceId,
    reason:typeof reason==='string'&&reason?reason:'UNAVAILABLE',
    receivedAt:null,
    data:null,
    researchOnly:true,
    executionWrite:false
  });
}

function available(sourceId,receivedAt,data){
  return Object.freeze({
    status:'AVAILABLE',
    sourceId,
    receivedAt,
    data,
    researchOnly:true,
    executionWrite:false
  });
}

function validateLoader(loader){
  if(!loader||typeof loader.load!=='function')throw Error('LOADER_REQUIRED');
  return loader;
}

async function loadExpected(loader,expectedSourceId){
  const envelope=await validateLoader(loader).load();
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw Error('SOURCE_RESULT_INVALID');
  if(envelope.sourceId!==expectedSourceId)throw Error('SOURCE_ID_MISMATCH');
  if(envelope.researchOnly!==true||envelope.executionWrite!==false)throw Error('READ_ONLY_REQUIRED');
  if(envelope.status!=='AVAILABLE'&&envelope.status!=='UNAVAILABLE')throw Error('SOURCE_STATUS_INVALID');

  if(envelope.status==='UNAVAILABLE')return unavailable(expectedSourceId,envelope.reason);

  if(typeof envelope.receivedAt!=='number'||!Number.isFinite(envelope.receivedAt)||envelope.receivedAt<0)throw Error('RECEIVED_AT_INVALID');
  if(envelope.data===undefined||envelope.data===null)throw Error('SOURCE_DATA_REQUIRED');
  return envelope;
}

function twseDailyQuote({loader,symbol}={}){
  if(typeof symbol!=='string'||!symbol.trim())throw Error('SYMBOL_REQUIRED');
  const requested=symbol.trim();
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,'twse-openapi');
      if(envelope.status==='UNAVAILABLE')return envelope;
      if(!Array.isArray(envelope.data))throw Error('TWSE_QUOTE_PAYLOAD_REQUIRED');
      const row=envelope.data.find(item=>String(item?.Code??'').trim()===requested);
      if(!row)return unavailable('twse-openapi','ENTITY_NOT_FOUND');
      const data=TWSE.normalizeDailyQuote(row,{receivedAt:envelope.receivedAt});
      return available('twse-openapi',envelope.receivedAt,data);
    }
  });
}

function secCompanyFact({loader,instrument,taxonomy,concept,unit}={}){
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,'sec-edgar');
      if(envelope.status==='UNAVAILABLE')return envelope;
      const data=SEC.normalizeCompanyFact(envelope.data,{instrument,taxonomy,concept,unit,receivedAt:envelope.receivedAt});
      return available('sec-edgar',envelope.receivedAt,data);
    }
  });
}

function blsSeries({loader,definitions}={}){
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,'bls-public');
      if(envelope.status==='UNAVAILABLE')return envelope;
      const data=BLS.normalizeSeries(envelope.data,{definitions,receivedAt:envelope.receivedAt});
      return available('bls-public',envelope.receivedAt,data);
    }
  });
}

function ecbSeries({loader,definition}={}){
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,'ecb-data');
      if(envelope.status==='UNAVAILABLE')return envelope;
      const data=ECB.normalizeSeries(envelope.data,{definition,receivedAt:envelope.receivedAt});
      return available('ecb-data',envelope.receivedAt,data);
    }
  });
}

function createOfficialSourceBindings(){
  return Object.freeze({twseDailyQuote,secCompanyFact,blsSeries,ecbSeries});
}

module.exports=Object.freeze({createOfficialSourceBindings});
