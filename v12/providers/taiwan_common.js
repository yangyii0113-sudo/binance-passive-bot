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
function closeMs(iso){return Date.parse(`${iso}T13:30:00+08:00`)}
function instrument(exchange,symbol,name='',assetType='EQUITY'){
  const meta=EXCHANGE_META[exchange];const code=String(symbol??'').trim().toUpperCase();if(!meta||!code)throw Error('INSTRUMENT_INVALID');
  return Object.freeze({instrumentId:`${exchange}:${code}`,exchange,symbol:code,name:String(name??'').trim(),market:meta.market,region:meta.region,currency:meta.currency,timezone:meta.timezone,assetType});
}
function observation({instrument,field,raw,unit,observedAt,receivedAt,source}){
  const value=numberOrNull(raw);return N.makeObservation({instrument,field,value,unit,currency:'TWD',observedAt,receivedAt,source,status:value===null?'UNAVAILABLE':'SNAPSHOT',confidence:value===null?0:1});
}
module.exports=Object.freeze({numberOrNull,isoFromRoc,isoFromAdCompact,closeMs,instrument,observation});
