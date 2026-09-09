'use strict';
const N=require('../data/context_normalizer.js');

const descriptor=Object.freeze({
  id:'ecb-official',
  sourceLabel:'European Central Bank Data Portal API',
  markets:['EU','GLOBAL'],
  capabilities:['MACRO'],
  transport:'PUBLIC_READ_ONLY',
  executionWrite:false,
  priority:80,
  serverOnly:true,
});

function numeric(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='string')return null;
  const clean=value.trim().replace(/,/g,'');
  if(!clean||['NA','N/A','--','---'].includes(clean.toUpperCase()))return null;
  const n=Number(clean);
  return Number.isFinite(n)?n:null;
}

function validateDefinition(definition){
  if(!definition||typeof definition!=='object'||Array.isArray(definition))throw Error('DEFINITION_REQUIRED');
  for(const key of ['seriesKey','entityId','scope','field','unit']){
    if(typeof definition[key]!=='string'||!definition[key])throw Error('DEFINITION_INVALID:'+key);
  }
  return definition;
}

function sdmxCode(dimension,index,label){
  if(!Number.isInteger(index)||index<0)throw Error(label+'_INDEX_INVALID');
  const value=dimension?.values?.[index];
  if(!value||typeof value.id!=='string'||!value.id)throw Error(label+'_INDEX_INVALID');
  return value.id;
}

function rowsFromSdmx(payload,definition){
  const seriesDimensions=payload?.structure?.dimensions?.series;
  const observationDimensions=payload?.structure?.dimensions?.observation;
  const datasets=payload?.dataSets;
  if(!Array.isArray(seriesDimensions)||!seriesDimensions.length||!Array.isArray(observationDimensions)||!Array.isArray(datasets))throw Error('ECB_SDMX_STRUCTURE_INVALID');
  const timePosition=observationDimensions.findIndex(item=>item?.id==='TIME_PERIOD');
  if(timePosition<0)throw Error('ECB_SDMX_TIME_PERIOD_REQUIRED');

  const requested=definition.seriesKey.split('.');
  const expected=requested.length===seriesDimensions.length+1?requested.slice(1):requested;
  if(expected.length!==seriesDimensions.length)throw Error('ECB_SERIES_IDENTITY_MISMATCH');

  const allSeries=[];
  for(const dataset of datasets){
    if(!dataset||typeof dataset!=='object'||Array.isArray(dataset)||!dataset.series||typeof dataset.series!=='object'||Array.isArray(dataset.series))continue;
    for(const [key,series] of Object.entries(dataset.series)){
      const indices=key.split(':').map(Number);
      if(indices.length!==seriesDimensions.length)throw Error('ECB_SDMX_SERIES_KEY_INVALID');
      const identity=indices.map((index,i)=>sdmxCode(seriesDimensions[i],index,'ECB_SDMX_SERIES'));
      allSeries.push({identity,series});
    }
  }
  if(!allSeries.length)return [];
  const matches=allSeries.filter(item=>item.identity.every((code,i)=>code===expected[i]));
  if(matches.length!==1)throw Error('ECB_SERIES_IDENTITY_MISMATCH');

  const statusAttribute=(payload?.structure?.attributes?.observation||[]).findIndex(item=>item?.id==='OBS_STATUS');
  const statusDefinition=statusAttribute>=0?payload.structure.attributes.observation[statusAttribute]:null;
  const rawObservations=matches[0].series?.observations;
  if(!rawObservations||typeof rawObservations!=='object'||Array.isArray(rawObservations))return [];
  const decoded=[];
  for(const [key,raw] of Object.entries(rawObservations)){
    if(!Array.isArray(raw))throw Error('ECB_SDMX_OBSERVATION_INVALID');
    const indices=key.split(':').map(Number);
    if(indices.length!==observationDimensions.length)throw Error('ECB_SDMX_OBSERVATION_KEY_INVALID');
    const referencePeriod=sdmxCode(observationDimensions[timePosition],indices[timePosition],'ECB_SDMX_TIME_PERIOD');
    const statusIndex=statusAttribute>=0?raw[statusAttribute+1]:null;
    const observationStatus=statusIndex===null||statusIndex===undefined?'':sdmxCode(statusDefinition,statusIndex,'ECB_SDMX_OBS_STATUS');
    decoded.push({timeIndex:indices[timePosition],row:{TIME_PERIOD:referencePeriod,OBS_VALUE:raw[0],OBS_STATUS:observationStatus}});
  }
  decoded.sort((a,b)=>a.timeIndex-b.timeIndex);
  return decoded.map(item=>item.row);
}

function rowsFrom(payload,definition){
  if(Array.isArray(payload))return payload;
  if(payload&&Array.isArray(payload.data))return payload.data;
  if(payload&&Array.isArray(payload.dataSets)&&payload.structure)return rowsFromSdmx(payload,definition);
  throw Error('ECB_PAYLOAD_REQUIRED');
}

function normalizeSeries(payload,{definition,receivedAt}={}){
  const def=validateDefinition(definition);
  if(typeof receivedAt!=='number'||!Number.isFinite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');
  const source=`ECB:${def.seriesKey}`;
  const input=rowsFrom(payload,def);
  const rows=[];
  const observations=[];
  for(const raw of input){
    const referencePeriod=String(raw?.TIME_PERIOD??'').trim();
    if(!referencePeriod){
      rows.push(Object.freeze({referencePeriod:null,observationStatus:String(raw?.OBS_STATUS??''),value:null,excludedReason:'TIME_PERIOD_MISSING'}));
      continue;
    }
    const value=numeric(raw?.OBS_VALUE);
    const status=value===null?'UNAVAILABLE':'SNAPSHOT';
    rows.push(Object.freeze({referencePeriod,observationStatus:String(raw?.OBS_STATUS??''),value}));
    observations.push(N.makeContextObservation({
      entityId:def.entityId,
      scope:def.scope,
      field:def.field,
      value,
      unit:def.unit,
      observedAt:receivedAt,
      receivedAt,
      source,
      status,
      confidence:value===null?0:1,
    }));
  }
  return Object.freeze({
    seriesKey:def.seriesKey,
    source,
    receivedAt,
    status:observations.some(x=>x.status!=='UNAVAILABLE')?'SNAPSHOT':'UNAVAILABLE',
    knowledgeTime:'RECEIVED_AT',
    pointInTimeSafe:false,
    observations:Object.freeze(observations),
    rows:Object.freeze(rows),
  });
}

function normalize(dataset,payload,context={}){
  if(dataset==='SERIES')return normalizeSeries(payload,context);
  throw Error('DATASET_UNSUPPORTED');
}

module.exports=Object.freeze({descriptor,numeric,normalizeSeries,normalize});
