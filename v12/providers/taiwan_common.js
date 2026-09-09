'use strict';
const N=require('../data/normalizer.js');
const EXCHANGE_META={TWSE:{market:'TW',region:'TW',currency:'TWD',timezone:'Asia/Taipei'},TPEX:{market:'TW',region:'TW',currency:'TWD',timezone:'Asia/Taipei'}};

function numberOrNull(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='string')return null;
  const clean=value.trim().replace(/,/g,'').replace(/^\+/,'');
  if(!clean||['--','---','N/A','NA'].includes(clean.toUpperCase()))return null;
  const n=Number(clean);return Number.isFinite(n)?n:null;
}
function isoFromRoc(value){
  const s=String(value??'').trim();const m=s.match(/^(\d{2,3})(\d{2})(\d{2})$/);if(!m)throw Error('DATE_INVALID');
  const y=Number(m[1])+1911,mo=Number(m[2]),d=Number(m[3]);
  const iso=`${String(y).padStart(4,'0')}-${m[2]}-${m[3]}`;const check=new Date(`${iso}T00:00:00Z`);
  if(check.getUTCFullYear()!==y||check.getUTCMonth()+1!==mo||check.getUTCDate()!==d)throw Error('DATE_INVALID');
  return iso;
}
function isoFromAdCompact(value){
  const s=String(value??'').trim();const m=s.match(/^(\d{4})(\d{2})(\d{2})$/);if(!m)throw Error('DATE_INVALID');
  const iso=`${m[1]}-${m[2]}-${m[3]}`;const check=new Date(`${iso}T00:00:00Z`);
  if(check.getUTCFullYear()!==Number(m[1])||check.getUTCMonth()+1!==Number(m[2])||check.getUTCDate()!==Number(m[3]))throw Error('DATE_INVALID');
  return iso;
}
function periodFromRocYm(value){
  const s=String(value??'').trim();const m=s.match(/^(\d{2,3})(\d{2})$/);if(!m)throw Error('PERIOD_INVALID');
  const year=Number(m[1])+1911,month=Number(m[2]);if(month<1||month>12)throw Error('PERIOD_INVALID');
  return `${String(year).padStart(4,'0')}-${m[2]}`;
}
function closeMs(iso){return Date.parse(`${iso}T13:30:00+08:00`)}
function instrument(exchange,symbol,name='',assetType='EQUITY'){
  const meta=EXCHANGE_META[exchange];const code=String(symbol??'').trim().toUpperCase();if(!meta||!code)throw Error('INSTRUMENT_INVALID');
  return Object.freeze({instrumentId:`${exchange}:${code}`,exchange,symbol:code,name:String(name??'').trim(),market:meta.market,region:meta.region,currency:meta.currency,timezone:meta.timezone,assetType});
}
function observation({instrument,field,raw,unit,observedAt,receivedAt,source}){
  const value=numberOrNull(raw);return N.makeObservation({instrument,field,value,unit,currency:'TWD',observedAt,receivedAt,source,status:value===null?'UNAVAILABLE':'SNAPSHOT',confidence:value===null?0:1});
}
function monthlyRevenue(exchange,source,row,{receivedAt}){
  if(!row||typeof row!=='object')throw Error('ROW_REQUIRED');
  const reportPeriod=periodFromRocYm(row['資料年月']);
  const inst=instrument(exchange,row['公司代號'],row['公司名稱']);
  const defs=[
    ['fundamental.revenue.monthly',row['營業收入-當月營收'],'TWD_THOUSAND'],
    ['fundamental.revenue.previous_month',row['營業收入-上月營收'],'TWD_THOUSAND'],
    ['fundamental.revenue.year_ago',row['營業收入-去年當月營收'],'TWD_THOUSAND'],
    ['fundamental.revenue.mom_pct',row['營業收入-上月比較增減(%)'],'PERCENT'],
    ['fundamental.revenue.yoy_pct',row['營業收入-去年同月增減(%)'],'PERCENT'],
    ['fundamental.revenue.ytd',row['累計營業收入-當月累計營收'],'TWD_THOUSAND'],
    ['fundamental.revenue.ytd_year_ago',row['累計營業收入-去年累計營收'],'TWD_THOUSAND'],
    ['fundamental.revenue.ytd_yoy_pct',row['累計營業收入-前期比較增減(%)'],'PERCENT']
  ];
  return Object.freeze({instrument:inst,reportPeriod,industry:String(row['產業別']??'').trim(),note:String(row['備註']??'').trim(),knowledgeTime:'RECEIVED_AT',observations:Object.freeze(defs.map(([field,raw,unit])=>observation({instrument:inst,field,raw,unit,observedAt:receivedAt,receivedAt,source})))});
}
module.exports=Object.freeze({numberOrNull,isoFromRoc,isoFromAdCompact,periodFromRocYm,closeMs,instrument,observation,monthlyRevenue});
