'use strict';
const N=require('../data/normalizer.js');

const descriptor=Object.freeze({
  id:'jpx-jquants-v2',
  sourceLabel:'JPX J-Quants API V2',
  markets:['JP'],
  capabilities:['QUOTE'],
  transport:'AUTHENTICATED_READ_ONLY',
  executionWrite:false,
  priority:100,
  serverOnly:true,
  credentialRequired:true,
});

const SOURCE='JPX:JQUANTS_V2:EQUITIES_BARS_DAILY';

function numeric(value){
  if(value===null||value===undefined)return null;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='string')return null;
  const clean=value.trim().replace(/,/g,'').replace(/^\+/,'');
  if(!clean||['-','--','---','N/A','NA'].includes(clean.toUpperCase()))return null;
  const n=Number(clean);
  return Number.isFinite(n)?n:null;
}

function isoDate(value){
  const s=String(value??'').trim();
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)throw Error('DATE_INVALID');
  const d=new Date(`${s}T00:00:00Z`);
  if(d.getUTCFullYear()!==Number(m[1])||d.getUTCMonth()+1!==Number(m[2])||d.getUTCDate()!==Number(m[3]))throw Error('DATE_INVALID');
  return s;
}

function closeMs(iso){return Date.parse(`${iso}T15:30:00+09:00`);}

function instrument(symbol,name=''){
  const s=String(symbol??'').trim().toUpperCase();
  if(!/^[A-Z0-9._-]{1,40}$/.test(s))throw Error('SYMBOL_INVALID');
  return Object.freeze({instrumentId:`TSE:${s}`,exchange:'TSE',symbol:s,name:String(name??'').trim(),market:'JP',region:'JP',currency:'JPY',timezone:'Asia/Tokyo',assetType:'EQUITY'});
}

function observation({instrument,field,raw,unit,observedAt,receivedAt}){
  const value=numeric(raw);
  return N.makeObservation({instrument,field,value,unit,currency:'JPY',observedAt,receivedAt,source:SOURCE,status:value===null?'UNAVAILABLE':'SNAPSHOT',confidence:value===null?0:1});
}

function normalizeDailyQuote(row,{receivedAt,name=''}={}){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('ROW_REQUIRED');
  const tradeDate=isoDate(row.Date);
  const observedAt=closeMs(tradeDate);
  if(!Number.isFinite(receivedAt)||receivedAt<observedAt)throw Error('RECEIVED_AT_INVALID');
  const inst=instrument(row.Code,name);
  const defs=[
    ['price.open',row.O,'JPY_PER_SHARE'],
    ['price.high',row.H,'JPY_PER_SHARE'],
    ['price.low',row.L,'JPY_PER_SHARE'],
    ['price.close',row.C,'JPY_PER_SHARE'],
    ['volume.shares',row.Vo,'SHARE'],
    ['turnover.value',row.Va,'JPY'],
    ['adjustment.factor',row.AdjFactor,'RATIO'],
    ['price.adjusted_open',row.AdjO,'JPY_PER_SHARE'],
    ['price.adjusted_high',row.AdjH,'JPY_PER_SHARE'],
    ['price.adjusted_low',row.AdjL,'JPY_PER_SHARE'],
    ['price.adjusted_close',row.AdjC,'JPY_PER_SHARE'],
    ['volume.adjusted_shares',row.AdjVo,'SHARE'],
  ];
  return Object.freeze({
    instrument:inst,
    tradeDate,
    upperLimitFlag:String(row.UL??''),
    lowerLimitFlag:String(row.LL??''),
    knowledgeTime:'RECEIVED_AT',
    pointInTimeSafe:false,
    adjustedSeriesPointInTimeSafe:false,
    retroactiveAdjustmentRisk:true,
    observations:Object.freeze(defs.map(([field,raw,unit])=>observation({instrument:inst,field,raw,unit,observedAt,receivedAt}))),
  });
}

function normalize(dataset,payload,context={}){
  if(dataset==='QUOTE')return normalizeDailyQuote(payload,context);
  throw Error('DATASET_UNSUPPORTED');
}

module.exports=Object.freeze({descriptor,SOURCE,numeric,isoDate,normalizeDailyQuote,normalize});
