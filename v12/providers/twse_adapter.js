'use strict';
const C=require('./taiwan_common.js');
const QUOTE_SOURCE='TWSE:STOCK_DAY_ALL',FLOW_SOURCE='TWSE:T86';
const descriptor=Object.freeze({id:'twse-official',sourceLabel:'Taiwan Stock Exchange official public data',markets:['TW'],capabilities:['QUOTE','FLOW','FUNDAMENTAL'],transport:'PUBLIC_READ_ONLY',executionWrite:false,priority:10});
function normalizeDailyQuote(row,{receivedAt}){
  if(!row||typeof row!=='object')throw Error('ROW_REQUIRED');const tradeDate=C.isoFromRoc(row.Date),observedAt=C.closeMs(tradeDate),instrument=C.instrument('TWSE',row.Code,row.Name);
  const defs=[['price.open',row.OpeningPrice,'TWD_PER_SHARE'],['price.high',row.HighestPrice,'TWD_PER_SHARE'],['price.low',row.LowestPrice,'TWD_PER_SHARE'],['price.close',row.ClosingPrice,'TWD_PER_SHARE'],['price.change',row.Change,'TWD_PER_SHARE'],['volume.shares',row.TradeVolume,'SHARE'],['turnover.value',row.TradeValue,'TWD'],['transactions.count',row.Transaction,'COUNT']];
  return Object.freeze({instrument,tradeDate,name:String(row.Name??'').trim(),observations:Object.freeze(defs.map(([field,raw,unit])=>C.observation({instrument,field,raw,unit,observedAt,receivedAt,source:QUOTE_SOURCE})))});
}
function normalizeInstitutional(payload,{tradeDate,receivedAt}){
  if(!payload||!Array.isArray(payload.fields)||!Array.isArray(payload.data))throw Error('PAYLOAD_REQUIRED');const date=C.isoFromAdCompact(tradeDate),observedAt=C.closeMs(date),index=new Map(payload.fields.map((f,i)=>[f,i]));
  const required=['證券代號','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數'];for(const f of required)if(!index.has(f))throw Error('SCHEMA_MISMATCH:'+f);
  return payload.data.map(row=>{const instrument=C.instrument('TWSE',row[index.get('證券代號')],index.has('證券名稱')?row[index.get('證券名稱')]:'');const defs=[['flow.foreign_net',row[index.get('外陸資買賣超股數(不含外資自營商)')]],['flow.investment_trust_net',row[index.get('投信買賣超股數')]],['flow.dealer_net',row[index.get('自營商買賣超股數')]],['flow.total_net',index.has('三大法人買賣超股數')?row[index.get('三大法人買賣超股數')]:null]];return Object.freeze({instrument,tradeDate:date,observations:Object.freeze(defs.map(([field,raw])=>C.observation({instrument,field,raw,unit:'SHARE',observedAt,receivedAt,source:FLOW_SOURCE})))})});
}
function normalize(dataset,payload,context={}){if(dataset==='QUOTE')return normalizeDailyQuote(payload,context);if(dataset==='FLOW')return normalizeInstitutional(payload,context);throw Error('DATASET_UNSUPPORTED')}
module.exports=Object.freeze({descriptor,QUOTE_SOURCE,FLOW_SOURCE,normalizeDailyQuote,normalizeInstitutional,normalize});
