'use strict';

const TWSE=require('../providers/twse_adapter.js');
const TPEX=require('../providers/tpex_adapter.js');
const SEC=require('../providers/sec_edgar_adapter.js');
const BLS=require('../providers/bls_adapter.js');
const ECB=require('../providers/ecb_adapter.js');

const ASSET_SCHEMA='foxyya-observation/1';
const CONTEXT_SCHEMA='foxyya-context-observation/1';

function frozenLineageMeta({sourceId,datasetId,bindingId,bindingVersion,adapterId,adapterVersion,canonicalSchemaVersion}){
  return Object.freeze({
    sourceId,datasetId,bindingId,bindingVersion,adapterId,adapterVersion,canonicalSchemaVersion,
    researchOnly:true,
    executionWrite:false
  });
}

const META=Object.freeze({
  twseDailyQuote:frozenLineageMeta({sourceId:'twse-openapi',datasetId:'TWSE:STOCK_DAY_ALL',bindingId:'twse-daily-quote',bindingVersion:'foxyya-binding/twse-daily-quote/1',adapterId:'twse-official',adapterVersion:'foxyya-adapter/twse/1',canonicalSchemaVersion:ASSET_SCHEMA}),
  twseInstitutional:frozenLineageMeta({sourceId:'twse-t86',datasetId:'TWSE:T86',bindingId:'twse-institutional',bindingVersion:'foxyya-binding/twse-institutional/1',adapterId:'twse-official',adapterVersion:'foxyya-adapter/twse/1',canonicalSchemaVersion:ASSET_SCHEMA}),
  twseMonthlyRevenue:frozenLineageMeta({sourceId:'twse-openapi',datasetId:'TWSE:t187ap05_L',bindingId:'twse-monthly-revenue',bindingVersion:'foxyya-binding/twse-monthly-revenue/1',adapterId:'twse-official',adapterVersion:'foxyya-adapter/twse/1',canonicalSchemaVersion:ASSET_SCHEMA}),
  tpexDailyQuote:frozenLineageMeta({sourceId:'tpex-openapi',datasetId:'TPEX:tpex_mainboard_daily_close_quotes',bindingId:'tpex-daily-quote',bindingVersion:'foxyya-binding/tpex-daily-quote/1',adapterId:'tpex-official',adapterVersion:'foxyya-adapter/tpex/1',canonicalSchemaVersion:ASSET_SCHEMA}),
  tpexInstitutional:frozenLineageMeta({sourceId:'tpex-openapi',datasetId:'TPEX:tpex_3insti_daily_trading',bindingId:'tpex-institutional',bindingVersion:'foxyya-binding/tpex-institutional/1',adapterId:'tpex-official',adapterVersion:'foxyya-adapter/tpex/1',canonicalSchemaVersion:ASSET_SCHEMA}),
  tpexMonthlyRevenue:frozenLineageMeta({sourceId:'tpex-openapi',datasetId:'TPEX:mopsfin_t187ap05_O',bindingId:'tpex-monthly-revenue',bindingVersion:'foxyya-binding/tpex-monthly-revenue/1',adapterId:'tpex-official',adapterVersion:'foxyya-adapter/tpex/1',canonicalSchemaVersion:ASSET_SCHEMA}),
  secCompanyFact:frozenLineageMeta({sourceId:'sec-edgar',datasetId:'SEC:companyfacts',bindingId:'sec-company-fact',bindingVersion:'foxyya-binding/sec-company-fact/1',adapterId:'sec-edgar-official',adapterVersion:'foxyya-adapter/sec-edgar/1',canonicalSchemaVersion:ASSET_SCHEMA}),
  blsSeries:frozenLineageMeta({sourceId:'bls-public',datasetId:'BLS:PublicDataAPI',bindingId:'bls-series',bindingVersion:'foxyya-binding/bls-series/1',adapterId:'bls-official',adapterVersion:'foxyya-adapter/bls/1',canonicalSchemaVersion:CONTEXT_SCHEMA})
});

function ecbMeta(definition){
  const seriesKey=typeof definition?.seriesKey==='string'?definition.seriesKey.trim():'';
  if(!seriesKey)throw Error('ECB_SERIES_KEY_REQUIRED');
  return frozenLineageMeta({sourceId:'ecb-data',datasetId:'ECB:'+seriesKey,bindingId:'ecb-series',bindingVersion:'foxyya-binding/ecb-series/1',adapterId:'ecb-official',adapterVersion:'foxyya-adapter/ecb/1',canonicalSchemaVersion:CONTEXT_SCHEMA});
}

function finiteTime(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0;}

function timing(envelope){
  const fetchStartedAt=finiteTime(envelope?.fetchStartedAt)?envelope.fetchStartedAt:null;
  const receivedAt=finiteTime(envelope?.receivedAt)?envelope.receivedAt:null;
  if(fetchStartedAt!==null&&receivedAt!==null&&fetchStartedAt>receivedAt)throw Error('SOURCE_TIME_ORDER_INVALID');
  return {fetchStartedAt,receivedAt};
}

function unavailable(sourceId,reason,envelope,lineageMeta){
  const times=timing(envelope);
  return Object.freeze({
    status:'UNAVAILABLE',
    sourceId,
    reason:typeof reason==='string'&&reason?reason:'UNAVAILABLE',
    fetchStartedAt:times.fetchStartedAt,
    receivedAt:times.receivedAt,
    data:null,
    lineageMeta,
    researchOnly:true,
    executionWrite:false
  });
}

function available(sourceId,envelope,data,lineageMeta){
  const times=timing(envelope);
  if(times.receivedAt===null)throw Error('RECEIVED_AT_INVALID');
  return Object.freeze({
    status:'AVAILABLE',
    sourceId,
    fetchStartedAt:times.fetchStartedAt,
    receivedAt:times.receivedAt,
    data,
    lineageMeta,
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
  timing(envelope);

  if(envelope.status==='UNAVAILABLE'){
    if(envelope.data!==null&&envelope.data!==undefined)throw Error('UNAVAILABLE_DATA_FORBIDDEN');
    return envelope;
  }

  if(!finiteTime(envelope.receivedAt))throw Error('RECEIVED_AT_INVALID');
  if(envelope.data===undefined||envelope.data===null)throw Error('SOURCE_DATA_REQUIRED');
  return envelope;
}

function twseDailyQuote({loader,symbol}={}){
  if(typeof symbol!=='string'||!symbol.trim())throw Error('SYMBOL_REQUIRED');
  const requested=symbol.trim(),meta=META.twseDailyQuote;
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,meta.sourceId);
      if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);
      if(!Array.isArray(envelope.data))throw Error('TWSE_QUOTE_PAYLOAD_REQUIRED');
      const row=envelope.data.find(item=>String(item?.Code??'').trim()===requested);
      if(!row)return unavailable(meta.sourceId,'ENTITY_NOT_FOUND',envelope,meta);
      const data=TWSE.normalizeDailyQuote(row,{receivedAt:envelope.receivedAt});
      return available(meta.sourceId,envelope,data,meta);
    }
  });
}

function twseInstitutional({loader,symbol,tradeDate}={}){
  if(typeof symbol!=='string'||!symbol.trim())throw Error('SYMBOL_REQUIRED');
  if(typeof tradeDate!=='string'||!/^\d{8}$/.test(tradeDate))throw Error('TRADE_DATE_REQUIRED');
  const requested=symbol.trim(),meta=META.twseInstitutional;
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,meta.sourceId);
      if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);
      const payload=envelope.data;
      if(!payload||!Array.isArray(payload.fields)||!Array.isArray(payload.data))throw Error('TWSE_T86_PAYLOAD_REQUIRED');
      const codeIndex=payload.fields.indexOf('證券代號');
      if(codeIndex<0)throw Error('SCHEMA_MISMATCH:證券代號');
      const rawRow=payload.data.find(row=>Array.isArray(row)&&String(row[codeIndex]??'').trim()===requested);
      if(!rawRow)return unavailable(meta.sourceId,'ENTITY_NOT_FOUND',envelope,meta);
      const normalized=TWSE.normalizeInstitutional({fields:payload.fields,data:[rawRow]},{tradeDate,receivedAt:envelope.receivedAt});
      if(normalized.length!==1)throw Error('TWSE_T86_ENTITY_INVALID');
      return available(meta.sourceId,envelope,normalized[0],meta);
    }
  });
}

function twseMonthlyRevenue({loader,symbol}={}){
  if(typeof symbol!=='string'||!symbol.trim())throw Error('SYMBOL_REQUIRED');
  const requested=symbol.trim(),meta=META.twseMonthlyRevenue;
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,meta.sourceId);
      if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);
      if(!Array.isArray(envelope.data))throw Error('TWSE_MONTHLY_REVENUE_PAYLOAD_REQUIRED');
      const row=envelope.data.find(item=>String(item?.['公司代號']??'').trim()===requested);
      if(!row)return unavailable(meta.sourceId,'ENTITY_NOT_FOUND',envelope,meta);
      const data=TWSE.normalizeMonthlyRevenue(row,{receivedAt:envelope.receivedAt});
      return available(meta.sourceId,envelope,data,meta);
    }
  });
}

function tpexDailyQuote({loader,symbol}={}){
  if(typeof symbol!=='string'||!symbol.trim())throw Error('SYMBOL_REQUIRED');
  const requested=symbol.trim(),meta=META.tpexDailyQuote;
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,meta.sourceId);
      if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);
      if(!Array.isArray(envelope.data))throw Error('TPEX_QUOTE_PAYLOAD_REQUIRED');
      const row=envelope.data.find(item=>String(item?.SecuritiesCompanyCode??'').trim()===requested);
      if(!row)return unavailable(meta.sourceId,'ENTITY_NOT_FOUND',envelope,meta);
      const data=TPEX.normalizeDailyQuote(row,{receivedAt:envelope.receivedAt});
      return available(meta.sourceId,envelope,data,meta);
    }
  });
}

function tpexInstitutional({loader,symbol}={}){
  if(typeof symbol!=='string'||!symbol.trim())throw Error('SYMBOL_REQUIRED');
  const requested=symbol.trim(),meta=META.tpexInstitutional;
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,meta.sourceId);
      if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);
      if(!Array.isArray(envelope.data))throw Error('TPEX_FLOW_PAYLOAD_REQUIRED');
      const row=envelope.data.find(item=>String(item?.SecuritiesCompanyCode??'').trim()===requested);
      if(!row)return unavailable(meta.sourceId,'ENTITY_NOT_FOUND',envelope,meta);
      const data=TPEX.normalizeInstitutionalRow(row,{receivedAt:envelope.receivedAt});
      return available(meta.sourceId,envelope,data,meta);
    }
  });
}

function tpexMonthlyRevenue({loader,symbol}={}){
  if(typeof symbol!=='string'||!symbol.trim())throw Error('SYMBOL_REQUIRED');
  const requested=symbol.trim(),meta=META.tpexMonthlyRevenue;
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,meta.sourceId);
      if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);
      if(!Array.isArray(envelope.data))throw Error('TPEX_MONTHLY_REVENUE_PAYLOAD_REQUIRED');
      const row=envelope.data.find(item=>String(item?.['公司代號']??'').trim()===requested);
      if(!row)return unavailable(meta.sourceId,'ENTITY_NOT_FOUND',envelope,meta);
      const data=TPEX.normalizeMonthlyRevenue(row,{receivedAt:envelope.receivedAt});
      return available(meta.sourceId,envelope,data,meta);
    }
  });
}

function secCompanyFact({loader,instrument,taxonomy,concept,unit}={}){
  const meta=META.secCompanyFact;
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,meta.sourceId);
      if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);
      const data=SEC.normalizeCompanyFact(envelope.data,{instrument,taxonomy,concept,unit,receivedAt:envelope.receivedAt});
      return available(meta.sourceId,envelope,data,meta);
    }
  });
}

function blsSeries({loader,definitions}={}){
  const meta=META.blsSeries;
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,meta.sourceId);
      if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);
      const data=BLS.normalizeSeries(envelope.data,{definitions,receivedAt:envelope.receivedAt});
      return available(meta.sourceId,envelope,data,meta);
    }
  });
}

function ecbSeries({loader,definition}={}){
  const meta=ecbMeta(definition);
  return Object.freeze({
    async load(){
      const envelope=await loadExpected(loader,meta.sourceId);
      if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);
      const data=ECB.normalizeSeries(envelope.data,{definition,receivedAt:envelope.receivedAt});
      return available(meta.sourceId,envelope,data,meta);
    }
  });
}

function createOfficialSourceBindings(){
  return Object.freeze({
    twseDailyQuote,
    twseInstitutional,
    twseMonthlyRevenue,
    tpexDailyQuote,
    tpexInstitutional,
    tpexMonthlyRevenue,
    secCompanyFact,
    blsSeries,
    ecbSeries
  });
}

module.exports=Object.freeze({createOfficialSourceBindings});
