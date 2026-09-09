'use strict';
const N=require('../data/normalizer.js');

const descriptor=Object.freeze({
  id:'krx-official',
  sourceLabel:'Korea Exchange Data Marketplace OPEN API',
  markets:['KR'],
  capabilities:['QUOTE'],
  transport:'AUTHENTICATED_READ_ONLY',
  executionWrite:false,
  priority:90,
  serverOnly:true,
  credentialRequired:true,
});

const STOCK_SOURCE='KRX:OPENAPI:STOCK_DAILY';
const INDEX_SOURCE='KRX:OPENAPI:INDEX_DAILY';

function numeric(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='string')return null;
  const clean=value.trim().replace(/,/g,'').replace(/^\+/,'');
  if(!clean||['-','--','---','N/A','NA'].includes(clean.toUpperCase()))return null;
  const n=Number(clean);
  return Number.isFinite(n)?n:null;
}

function isoDate(value){
  const s=String(value??'').trim();
  const m=s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(!m)throw Error('DATE_INVALID');
  const iso=`${m[1]}-${m[2]}-${m[3]}`;
  const d=new Date(`${iso}T00:00:00Z`);
  if(d.getUTCFullYear()!==Number(m[1])||d.getUTCMonth()+1!==Number(m[2])||d.getUTCDate()!==Number(m[3]))throw Error('DATE_INVALID');
  return iso;
}

function closeMs(iso){return Date.parse(`${iso}T15:30:00+09:00`);}

function instrument(symbol,name,assetType='EQUITY'){
  const s=String(symbol??'').trim().toUpperCase();
  if(!/^[A-Z0-9._-]{1,40}$/.test(s))throw Error('SYMBOL_INVALID');
  return Object.freeze({instrumentId:`KRX:${s}`,exchange:'KRX',symbol:s,name:String(name??'').trim(),market:'KR',region:'KR',currency:'KRW',timezone:'Asia/Seoul',assetType});
}

function observation({instrument,field,raw,unit,observedAt,receivedAt,source}){
  const value=numeric(raw);
  return N.makeObservation({instrument,field,value,unit,currency:'KRW',observedAt,receivedAt,source,status:value===null?'UNAVAILABLE':'SNAPSHOT',confidence:value===null?0:1});
}

function normalizeDailyQuote(row,{receivedAt}={}){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('ROW_REQUIRED');
  const tradeDate=isoDate(row.BAS_DD);
  const observedAt=closeMs(tradeDate);
  if(!Number.isFinite(receivedAt)||receivedAt<observedAt)throw Error('RECEIVED_AT_INVALID');
  const inst=instrument(row.ISU_CD,row.ISU_NM,'EQUITY');
  const defs=[
    ['price.open',row.TDD_OPNPRC,'KRW_PER_SHARE'],
    ['price.high',row.TDD_HGPRC,'KRW_PER_SHARE'],
    ['price.low',row.TDD_LWPRC,'KRW_PER_SHARE'],
    ['price.close',row.TDD_CLSPRC,'KRW_PER_SHARE'],
    ['price.change',row.CMPPREVDD_PRC,'KRW_PER_SHARE'],
    ['price.change_pct',row.FLUC_RT,'PERCENT'],
    ['volume.shares',row.ACC_TRDVOL,'SHARE'],
    ['turnover.value',row.ACC_TRDVAL,'KRW'],
    ['market_cap',row.MKTCAP,'KRW'],
    ['shares.listed',row.LIST_SHRS,'SHARE'],
  ];
  return Object.freeze({
    instrument:inst,
    tradeDate,
    marketName:String(row.MKT_NM??''),
    securityType:String(row.SECT_TP_NM??''),
    knowledgeTime:'RECEIVED_AT',
    pointInTimeSafe:false,
    observations:Object.freeze(defs.map(([field,raw,unit])=>observation({instrument:inst,field,raw,unit,observedAt,receivedAt,source:STOCK_SOURCE}))),
  });
}

function normalizeIndexQuote(row,{receivedAt,symbol}={}){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('ROW_REQUIRED');
  const canonical=String(symbol??'').trim().toUpperCase();
  if(!canonical)throw Error('INDEX_SYMBOL_REQUIRED');
  const tradeDate=isoDate(row.BAS_DD);
  const observedAt=closeMs(tradeDate);
  if(!Number.isFinite(receivedAt)||receivedAt<observedAt)throw Error('RECEIVED_AT_INVALID');
  const inst=instrument(canonical,row.IDX_NM,'INDEX');
  const defs=[
    ['index.open',row.OPNPRC_IDX,'INDEX_POINT'],
    ['index.high',row.HGPRC_IDX,'INDEX_POINT'],
    ['index.low',row.LWPRC_IDX,'INDEX_POINT'],
    ['index.close',row.CLSPRC_IDX,'INDEX_POINT'],
    ['index.change',row.CMPPREVDD_IDX,'INDEX_POINT'],
    ['index.change_pct',row.FLUC_RT,'PERCENT'],
    ['volume.shares',row.ACC_TRDVOL,'SHARE'],
    ['turnover.value',row.ACC_TRDVAL,'KRW'],
    ['market_cap',row.MKTCAP,'KRW'],
  ];
  return Object.freeze({
    instrument:inst,
    tradeDate,
    indexClass:String(row.IDX_CLSS??''),
    officialIndexName:String(row.IDX_NM??''),
    knowledgeTime:'RECEIVED_AT',
    pointInTimeSafe:false,
    observations:Object.freeze(defs.map(([field,raw,unit])=>observation({instrument:inst,field,raw,unit,observedAt,receivedAt,source:INDEX_SOURCE}))),
  });
}

function normalize(dataset,payload,context={}){
  if(dataset==='QUOTE')return normalizeDailyQuote(payload,context);
  if(dataset==='INDEX')return normalizeIndexQuote(payload,context);
  throw Error('DATASET_UNSUPPORTED');
}

module.exports=Object.freeze({descriptor,STOCK_SOURCE,INDEX_SOURCE,numeric,isoDate,normalizeDailyQuote,normalizeIndexQuote,normalize});
