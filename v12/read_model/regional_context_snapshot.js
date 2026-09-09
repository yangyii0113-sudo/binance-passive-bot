'use strict';

const Data=require('../data/contracts.js');
const ContextEvent=require('../data/context_event.js');
const Regional=require('../intelligence/regional_engine.js');
const Context=require('../intelligence/context_engine.js');

const finite=x=>typeof x==='number'&&Number.isFinite(x);
const text=x=>typeof x==='string'&&x.length>0;

function assertObservation(observation,region){
  const check=Data.validateContextObservation(observation);
  if(!check.ok)throw Error('CONTEXT_OBSERVATION_INVALID:'+check.errors.join('|'));
  if(observation.scope!==region&&observation.scope!=='GLOBAL')throw Error('SCOPE_MISMATCH');
  return observation;
}

function assertEvent(event,region){
  const check=ContextEvent.validateContextEvent(event);
  if(!check.ok)throw Error('CONTEXT_EVENT_INVALID:'+check.errors.join('|'));
  if(event.scope!==region&&event.scope!=='GLOBAL')throw Error('SCOPE_MISMATCH');
  return event;
}

function factText(observation){
  const value=observation.status==='UNAVAILABLE'||observation.value===null||observation.value===undefined
    ? 'UNAVAILABLE'
    : String(observation.value);
  return `${observation.entityId} ${observation.field} = ${value} ${observation.unit}`;
}

function toContextFact(observation){
  return Object.freeze({
    text:factText(observation),
    source:observation.source,
    asOf:observation.receivedAt,
    entityId:observation.entityId,
    field:observation.field,
    value:observation.value,
    unit:observation.unit,
    status:observation.status,
    confidence:observation.confidence
  });
}

function freezeList(value){
  return Object.freeze(Array.isArray(value)?value.map(x=>Object.freeze({...x})):[]);
}

function buildRegionalContextSnapshot(input={}){
  if(!Regional||typeof Regional.evaluateRegion!=='function')throw Error('REGIONAL_ENGINE_REQUIRED');
  if(!finite(input.nowMs)||input.nowMs<0)throw Error('NOW_INVALID');
  const region=input.region;
  const observations=(Array.isArray(input.observations)?input.observations:[]).map(x=>assertObservation(x,region));
  const events=(Array.isArray(input.events)?input.events:[]).map(x=>assertEvent(x,region));
  const evidence=Array.isArray(input.evidence)?input.evidence:[];

  const regionalSnapshot=Regional.evaluateRegion(region,evidence,input.nowMs);
  const facts=observations.map(toContextFact);
  const expectations=freezeList(input.expectations);
  const scenarios=freezeList(input.scenarios);
  const rotation=freezeList(input.rotation);
  const catalysts=freezeList(input.catalysts);
  const risks=freezeList(input.risks);

  const context=Context.buildContext({
    asOf:input.nowMs,
    regionSnapshot:regionalSnapshot,
    facts,
    expectations,
    scenarios,
    rotation,
    catalysts,
    risks
  });

  return Object.freeze({
    schemaVersion:'foxyya-regional-context-read-model/1',
    region,
    asOf:input.nowMs,
    regionalSnapshot,
    observations:Object.freeze([...observations]),
    events:Object.freeze([...events]),
    context,
    researchOnly:true,
    executionWrite:false
  });
}

module.exports=Object.freeze({buildRegionalContextSnapshot});
