'use strict';

const TWSE=require('../providers/twse_adapter.js');
const TPEX=require('../providers/tpex_adapter.js');

const CONTEXT_SCHEMA='foxyya-context-observation/1';
const frozenMeta=({sourceId,datasetId,bindingId,adapterId})=>Object.freeze({sourceId,datasetId,bindingId,bindingVersion:`foxyya-binding/${bindingId}/1`,adapterId,adapterVersion:adapterId==='twse-official'?'foxyya-adapter/twse/1':'foxyya-adapter/tpex/1',canonicalSchemaVersion:CONTEXT_SCHEMA,researchOnly:true,executionWrite:false});
const META=Object.freeze({
  twseMarketBreadth:frozenMeta({sourceId:'twse-market',datasetId:'TWSE:MI_INDEX',bindingId:'twse-market-breadth',adapterId:'twse-official'}),
  tpexMarketHighlight:frozenMeta({sourceId:'tpex-openapi',datasetId:'TPEX:tpex_mainborad_highlight',bindingId:'tpex-market-highlight',adapterId:'tpex-official'}),
  tpexIndustryTurnover:frozenMeta({sourceId:'tpex-openapi',datasetId:'TPEX:tpex_trading_volume_ratio',bindingId:'tpex-industry-turnover',adapterId:'tpex-official'})
});

const finiteTime=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
function timing(envelope){
  const fetchStartedAt=finiteTime(envelope?.fetchStartedAt)?envelope.fetchStartedAt:null;
  const receivedAt=finiteTime(envelope?.receivedAt)?envelope.receivedAt:null;
  if(fetchStartedAt!==null&&receivedAt!==null&&fetchStartedAt>receivedAt)throw Error('SOURCE_TIME_ORDER_INVALID');
  return {fetchStartedAt,receivedAt};
}
function unavailable(sourceId,reason,envelope,lineageMeta){const times=timing(envelope);return Object.freeze({status:'UNAVAILABLE',sourceId,reason:reason||'UNAVAILABLE',fetchStartedAt:times.fetchStartedAt,receivedAt:times.receivedAt,data:null,lineageMeta,researchOnly:true,executionWrite:false});}
function available(sourceId,envelope,data,lineageMeta){const times=timing(envelope);if(times.receivedAt===null)throw Error('RECEIVED_AT_INVALID');return Object.freeze({status:'AVAILABLE',sourceId,fetchStartedAt:times.fetchStartedAt,receivedAt:times.receivedAt,data,lineageMeta,researchOnly:true,executionWrite:false});}
async function loadExpected(loader,sourceId){
  if(!loader||typeof loader.load!=='function')throw Error('LOADER_REQUIRED');
  const envelope=await loader.load();
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||envelope.sourceId!==sourceId||envelope.researchOnly!==true||envelope.executionWrite!==false)throw Error('SOURCE_RESULT_INVALID');
  if(envelope.status!=='AVAILABLE'&&envelope.status!=='UNAVAILABLE')throw Error('SOURCE_STATUS_INVALID');
  timing(envelope);
  if(envelope.status==='UNAVAILABLE')return envelope;
  if(!finiteTime(envelope.receivedAt)||envelope.data===null||envelope.data===undefined)throw Error('SOURCE_DATA_REQUIRED');
  return envelope;
}
function validateTradeDate(value){if(typeof value!=='string'||!/^\d{8}$/.test(value))throw Error('TRADE_DATE_REQUIRED');return value;}
function rocCompact(ad){const value=validateTradeDate(ad);const year=Number(value.slice(0,4))-1911;if(year<=0)throw Error('TRADE_DATE_INVALID');return String(year).padStart(3,'0')+value.slice(4);}

function twseMarketBreadth({loader,tradeDate}={}){
  const meta=META.twseMarketBreadth,date=validateTradeDate(tradeDate);
  return Object.freeze({lineageMeta:meta,async load(){const envelope=await loadExpected(loader,meta.sourceId);if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);const data=TWSE.normalizeMarketBreadth(envelope.data,{tradeDate:date,receivedAt:envelope.receivedAt});return available(meta.sourceId,envelope,data,meta);}});
}
function tpexMarketHighlight({loader,tradeDate}={}){
  const meta=META.tpexMarketHighlight,date=validateTradeDate(tradeDate),roc=rocCompact(date);
  return Object.freeze({lineageMeta:meta,async load(){const envelope=await loadExpected(loader,meta.sourceId);if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);if(!Array.isArray(envelope.data))throw Error('TPEX_HIGHLIGHT_PAYLOAD_REQUIRED');const row=envelope.data.find(item=>String(item?.Date??'').trim()===roc);if(!row)return unavailable(meta.sourceId,'TRADE_DATE_NOT_FOUND',envelope,meta);const data=TPEX.normalizeMarketHighlight(row,{receivedAt:envelope.receivedAt});return available(meta.sourceId,envelope,data,meta);}});
}
function tpexIndustryTurnover({loader,tradeDate}={}){
  const meta=META.tpexIndustryTurnover,date=validateTradeDate(tradeDate),roc=rocCompact(date);
  return Object.freeze({lineageMeta:meta,async load(){const envelope=await loadExpected(loader,meta.sourceId);if(envelope.status==='UNAVAILABLE')return unavailable(meta.sourceId,envelope.reason,envelope,meta);if(!Array.isArray(envelope.data))throw Error('TPEX_INDUSTRY_PAYLOAD_REQUIRED');const rows=envelope.data.filter(item=>String(item?.Date??'').trim()===roc);if(!rows.length)return unavailable(meta.sourceId,'TRADE_DATE_NOT_FOUND',envelope,meta);const data=TPEX.normalizeIndustryTurnover(rows,{receivedAt:envelope.receivedAt});return available(meta.sourceId,envelope,data,meta);}});
}

function createTaiwanMarketSourceBindings(){return Object.freeze({twseMarketBreadth,tpexMarketHighlight,tpexIndustryTurnover});}
module.exports=Object.freeze({createTaiwanMarketSourceBindings,rocCompact});
