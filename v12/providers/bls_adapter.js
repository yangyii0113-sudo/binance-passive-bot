'use strict';
const N=require('../data/context_normalizer.js');
const descriptor=Object.freeze({id:'bls-official',sourceLabel:'U.S. Bureau of Labor Statistics Public Data API',markets:['US'],capabilities:['MACRO'],transport:'PUBLIC_READ_ONLY',executionWrite:false,priority:40,serverOnly:true});
function reportPeriod(row){
  const year=String(row?.year??'');const period=String(row?.period??'');
  if(!/^\d{4}$/.test(year))throw Error('BLS_PERIOD_INVALID');
  const m=period.match(/^M(0[1-9]|1[0-2])$/);if(m)return `${year}-${m[1]}`;
  if(period==='M13')return `${year}-ANNUAL`;
  throw Error('BLS_PERIOD_INVALID');
}
function numeric(value){const n=Number(String(value??'').replace(/,/g,''));return Number.isFinite(n)?n:null;}
function normalizeSeries(payload,{definitions,receivedAt}){
  if(!payload||payload.status!=='REQUEST_SUCCEEDED')throw Error('BLS_REQUEST_FAILED:'+String(payload?.message||''));
  if(!definitions||typeof definitions!=='object'||Array.isArray(definitions))throw Error('DEFINITIONS_REQUIRED');
  const raw=Array.isArray(payload.Results?.series)?payload.Results.series:[];const byId=new Map(raw.map(x=>[x.seriesID,x]));const series=[];const excluded=[];
  for(const item of raw)if(!Object.hasOwn(definitions,item.seriesID))excluded.push(Object.freeze({seriesID:item.seriesID,reason:'SERIES_UNCONFIGURED'}));
  for(const [seriesID,def] of Object.entries(definitions)){
    const item=byId.get(seriesID);
    if(!item){series.push(Object.freeze({seriesID,status:'UNAVAILABLE',knowledgeTime:'RECEIVED_AT',pointInTimeSafe:false,observations:Object.freeze([]),rows:Object.freeze([]),source:`BLS:${seriesID}`}));continue;}
    const rows=[];const observations=[];
    for(const row of Array.isArray(item.data)?item.data:[]){
      let period;try{period=reportPeriod(row)}catch{excluded.push(Object.freeze({seriesID,year:row?.year,period:row?.period,reason:'PERIOD_UNSUPPORTED'}));continue;}
      const value=numeric(row.value);const status=value===null?'UNAVAILABLE':'SNAPSHOT';
      rows.push(Object.freeze({reportPeriod:period,year:String(row.year),period:String(row.period),periodName:String(row.periodName??''),latest:String(row.latest??''),value}));
      observations.push(N.makeContextObservation({entityId:def.entityId,scope:def.scope,field:def.field,value,unit:def.unit,observedAt:receivedAt,receivedAt,source:`BLS:${seriesID}`,status,confidence:value===null?0:1}));
    }
    const latest=rows[0]||null;
    series.push(Object.freeze({seriesID,status:observations.some(x=>x.status!=='UNAVAILABLE')?'SNAPSHOT':'UNAVAILABLE',reportPeriod:latest?.reportPeriod??null,knowledgeTime:'RECEIVED_AT',pointInTimeSafe:false,observations:Object.freeze(observations),rows:Object.freeze(rows),source:`BLS:${seriesID}`}));
  }
  return Object.freeze({source:'BLS:PublicDataAPI',receivedAt,series:Object.freeze(series),excluded:Object.freeze(excluded)});
}
function normalize(dataset,payload,context={}){if(dataset==='SERIES')return normalizeSeries(payload,context);throw Error('DATASET_UNSUPPORTED')}
module.exports=Object.freeze({descriptor,reportPeriod,normalizeSeries,normalize});
