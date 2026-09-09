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

function rowsFrom(payload){
  if(Array.isArray(payload))return payload;
  if(payload&&Array.isArray(payload.data))return payload.data;
  throw Error('ECB_PAYLOAD_REQUIRED');
}

function normalizeSeries(payload,{definition,receivedAt}={}){
  const def=validateDefinition(definition);
  if(typeof receivedAt!=='number'||!Number.isFinite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');
  const source=`ECB:${def.seriesKey}`;
  const input=rowsFrom(payload);
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
