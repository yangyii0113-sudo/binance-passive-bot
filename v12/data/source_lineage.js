'use strict';

const crypto=require('node:crypto');

const SOURCE_LINEAGE_SCHEMA='foxyya-source-lineage/1';
const RESEARCH_OUTPUT_LINEAGE_SCHEMA='foxyya-research-output-lineage/1';
const RESEARCH_LINEAGE_SCHEMA='foxyya-research-lineage/1';
const SOURCE_STATUSES=Object.freeze(['AVAILABLE','UNAVAILABLE']);

function text(value){return typeof value==='string'&&value.length>0;}
function finite(value){return typeof value==='number'&&Number.isFinite(value);}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}

function deepClone(value){
  if(Array.isArray(value))return value.map(deepClone);
  if(object(value)){
    const out={};
    for(const key of Object.keys(value))out[key]=deepClone(value[key]);
    return out;
  }
  return value;
}

function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const key of Object.keys(value))deepFreeze(value[key]);
  return Object.freeze(value);
}

function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(object(value)){
    const out={};
    for(const key of Object.keys(value).sort())out[key]=stableValue(value[key]);
    return out;
  }
  return value;
}

function stableStringify(value){return JSON.stringify(stableValue(value));}
function digest(value){return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');}

function requiredText(value,label){if(!text(value))throw Error(label+'_REQUIRED');return value;}
function optionalText(value,label){if(value===undefined||value===null)return null;if(!text(value))throw Error(label+'_INVALID');return value;}
function validRef(value,prefix){return typeof value==='string'&&new RegExp('^'+prefix+'_[a-f0-9]{64}$').test(value);}
function validPublicRef(value,prefix){return typeof value==='string'&&new RegExp('^'+prefix+':[a-f0-9]{64}$').test(value);}

function assertNoSecretFields(input){
  for(const key of Object.keys(input||{})){
    if(/api.?key|secret|token|password|credential/i.test(key))throw Error('SECRET_FIELD_FORBIDDEN');
  }
}

function assertNoExecutionFields(input){
  for(const key of Object.keys(input||{})){
    if(/execution|order|trade|fill|position/i.test(key))throw Error('EXECUTION_FIELD_FORBIDDEN');
  }
}

function makeObservationRef(observation){
  if(!object(observation))throw Error('CANONICAL_OBSERVATION_REQUIRED');
  return 'obs:'+digest(observation);
}

function observationRef({sourceId,datasetId,canonicalSchemaVersion,observation}){
  return 'obs_'+digest({sourceId,datasetId,canonicalSchemaVersion,observation});
}

function createSourceObservationLineage(input={}){
  const sourceId=requiredText(input.sourceId,'SOURCE_ID');
  const datasetId=requiredText(input.datasetId,'DATASET_ID');
  const subjectId=requiredText(input.subjectId,'SUBJECT_ID');
  const bindingVersion=requiredText(input.bindingVersion,'BINDING_VERSION');
  const adapterVersion=requiredText(input.adapterVersion,'ADAPTER_VERSION');
  const canonicalSchemaVersion=requiredText(input.canonicalSchemaVersion,'CANONICAL_SCHEMA_VERSION');
  if(!finite(input.fetchStartedAt)||!finite(input.receivedAt)||input.fetchStartedAt<0||input.receivedAt<0||input.fetchStartedAt>input.receivedAt)throw Error('SOURCE_TIME_ORDER_INVALID');
  if(!SOURCE_STATUSES.includes(input.sourceStatus))throw Error('SOURCE_STATUS_INVALID');
  if(!Array.isArray(input.observations))throw Error('OBSERVATIONS_REQUIRED');
  if(input.sourceStatus==='AVAILABLE'&&!input.observations.length)throw Error('AVAILABLE_OBSERVATIONS_REQUIRED');
  if(input.sourceStatus==='UNAVAILABLE'&&input.observations.length)throw Error('UNAVAILABLE_OBSERVATIONS_FORBIDDEN');

  const observations=input.observations.map((raw)=>{
    if(!object(raw))throw Error('CANONICAL_OBSERVATION_REQUIRED');
    if(raw.schemaVersion!==canonicalSchemaVersion)throw Error('CANONICAL_SCHEMA_MISMATCH');
    if(!finite(raw.receivedAt)||raw.receivedAt!==input.receivedAt)throw Error('OBSERVATION_RECEIVE_TIME_MISMATCH');
    return deepFreeze(deepClone(raw));
  });
  const observationRefs=Object.freeze(observations.map(observation=>observationRef({sourceId,datasetId,canonicalSchemaVersion,observation})));
  const base={
    schemaVersion:SOURCE_LINEAGE_SCHEMA,
    sourceId,datasetId,subjectId,
    fetchStartedAt:input.fetchStartedAt,
    receivedAt:input.receivedAt,
    bindingVersion,adapterVersion,canonicalSchemaVersion,
    sourceStatus:input.sourceStatus,
    observations:Object.freeze(observations),
    observationRefs,
    researchOnly:true,
    executionWrite:false
  };
  return deepFreeze({...base,lineageRef:'src_'+digest(base)});
}

function uniqueSortedRefs(values,prefix,label){
  if(!Array.isArray(values)||!values.length)throw Error(label+'_REQUIRED');
  const unique=[...new Set(values)];
  for(const value of unique)if(!validRef(value,prefix))throw Error(label+'_INVALID');
  return Object.freeze(unique.sort());
}

function createResearchOutputLineage(input={}){
  const outputType=requiredText(input.outputType,'OUTPUT_TYPE');
  const subjectId=requiredText(input.subjectId,'SUBJECT_ID');
  const outputSchemaVersion=requiredText(input.outputSchemaVersion,'OUTPUT_SCHEMA_VERSION');
  if(!finite(input.asOf)||input.asOf<0)throw Error('ASOF_INVALID');
  const modelVersion=optionalText(input.modelVersion,'MODEL_VERSION');
  const policyVersion=optionalText(input.policyVersion,'POLICY_VERSION');
  const sourceLineageRefs=uniqueSortedRefs(input.sourceLineageRefs,'src','SOURCE_LINEAGE_REFS');
  const observationRefs=uniqueSortedRefs(input.observationRefs,'obs','OBSERVATION_REFS');
  const base={
    schemaVersion:RESEARCH_OUTPUT_LINEAGE_SCHEMA,
    outputType,subjectId,asOf:input.asOf,outputSchemaVersion,
    modelVersion,policyVersion,
    sourceLineageRefs,observationRefs,
    researchOnly:true,
    executionWrite:false
  };
  return deepFreeze({...base,lineageRef:'out_'+digest(base)});
}

function publicObservationRefs(values,{allowEmpty=false}={}){
  if(!Array.isArray(values))throw Error('OBSERVATION_REFS_REQUIRED');
  if(!allowEmpty&&!values.length)throw Error('OBSERVATION_REFS_REQUIRED');
  const refs=[...new Set(values)];
  for(const ref of refs)if(!validPublicRef(ref,'obs'))throw Error('OBSERVATION_REF_INVALID');
  return Object.freeze(refs.sort());
}

function publicSourceBase(input={}){
  const status=requiredText(input.status,'SOURCE_STATUS');
  if(!SOURCE_STATUSES.includes(status))throw Error('SOURCE_STATUS_INVALID');
  const sourceId=requiredText(input.sourceId,'SOURCE_ID');
  const datasetId=requiredText(input.datasetId,'DATASET_ID');
  const bindingId=requiredText(input.bindingId,'BINDING_ID');
  const bindingVersion=requiredText(input.bindingVersion,'BINDING_VERSION');
  const adapterId=requiredText(input.adapterId,'ADAPTER_ID');
  const adapterVersion=requiredText(input.adapterVersion,'ADAPTER_VERSION');
  const canonicalSchemaVersion=requiredText(input.canonicalSchemaVersion,'CANONICAL_SCHEMA_VERSION');
  let receivedAt=null;
  let observationRefs;
  let reason=null;

  if(status==='AVAILABLE'){
    if(!finite(input.receivedAt)||input.receivedAt<0)throw Error('RECEIVED_AT_INVALID');
    receivedAt=input.receivedAt;
    observationRefs=publicObservationRefs(input.observationRefs);
  }else{
    if(input.receivedAt!==null)throw Error('UNAVAILABLE_RECEIVED_AT_INVALID');
    if(!Array.isArray(input.observationRefs))throw Error('OBSERVATION_REFS_REQUIRED');
    if(input.observationRefs.length)throw Error('UNAVAILABLE_OBSERVATION_REFS_FORBIDDEN');
    observationRefs=Object.freeze([]);
    reason=requiredText(input.reason,'UNAVAILABLE_REASON');
  }

  return {
    schemaVersion:SOURCE_LINEAGE_SCHEMA,
    sourceId,datasetId,receivedAt,
    bindingId,bindingVersion,adapterId,adapterVersion,
    canonicalSchemaVersion,
    status,
    reason,
    observationRefs,
    researchOnly:true,
    executionWrite:false
  };
}

function createSourceLineage(input={}){
  if(!object(input))throw Error('SOURCE_LINEAGE_INPUT_REQUIRED');
  assertNoSecretFields(input);
  assertNoExecutionFields(input);
  const base=publicSourceBase(input);
  return deepFreeze({...base,lineageId:'src:'+digest(base)});
}

function validatePublicSourceLineage(value){
  if(!object(value)||value.schemaVersion!==SOURCE_LINEAGE_SCHEMA||!validPublicRef(value.lineageId,'src')||value.researchOnly!==true||value.executionWrite!==false)throw Error('SOURCE_LINEAGE_INVALID');
  let base;
  try{
    base=publicSourceBase({
      sourceId:value.sourceId,
      datasetId:value.datasetId,
      receivedAt:value.receivedAt,
      bindingId:value.bindingId,
      bindingVersion:value.bindingVersion,
      adapterId:value.adapterId,
      adapterVersion:value.adapterVersion,
      canonicalSchemaVersion:value.canonicalSchemaVersion,
      status:value.status,
      reason:value.reason,
      observationRefs:value.observationRefs
    });
  }catch(_error){
    throw Error('SOURCE_LINEAGE_INVALID');
  }
  const expected={...base,lineageId:'src:'+digest(base)};
  if(stableStringify(expected)!==stableStringify(value))throw Error('SOURCE_LINEAGE_INVALID');
  return deepFreeze(expected);
}

function createResearchLineage(input={}){
  if(!object(input))throw Error('RESEARCH_LINEAGE_INPUT_REQUIRED');
  assertNoSecretFields(input);
  assertNoExecutionFields(input);
  const researchOutputId=requiredText(input.researchOutputId,'RESEARCH_OUTPUT_ID');
  const instrumentId=requiredText(input.instrumentId,'INSTRUMENT_ID');
  if(!finite(input.asOf)||input.asOf<0)throw Error('ASOF_INVALID');
  const modelVersion=requiredText(input.modelVersion,'MODEL_VERSION');
  const policyVersion=optionalText(input.policyVersion,'POLICY_VERSION');
  if(!Array.isArray(input.sourceLineages)||!input.sourceLineages.length)throw Error('SOURCE_LINEAGES_REQUIRED');

  const sources=input.sourceLineages.map(validatePublicSourceLineage);
  const sourceLineageIds=Object.freeze([...new Set(sources.map(source=>source.lineageId))].sort());
  const observationRefs=Object.freeze([...new Set(sources.flatMap(source=>source.observationRefs))].sort());
  const knowledgeTimes=sources.map(source=>source.receivedAt).filter(finite);
  const knowledgeAt=knowledgeTimes.length?Math.max(...knowledgeTimes):null;
  if(knowledgeAt!==null&&knowledgeAt>input.asOf)throw Error('LINEAGE_TIME_ORDER_INVALID');

  const base={
    schemaVersion:RESEARCH_LINEAGE_SCHEMA,
    researchOutputId,
    instrumentId,
    asOf:input.asOf,
    knowledgeAt,
    modelVersion,
    policyVersion,
    sourceLineageIds,
    observationRefs,
    researchOnly:true,
    executionWrite:false
  };
  return deepFreeze({...base,lineageId:'research:'+digest(base)});
}

function validateSourceObservationLineage(value){
  if(!object(value)||value.schemaVersion!==SOURCE_LINEAGE_SCHEMA||!validRef(value.lineageRef,'src'))throw Error('SOURCE_LINEAGE_INVALID');
  const rebuilt=createSourceObservationLineage(value);
  if(rebuilt.lineageRef!==value.lineageRef||stableStringify(rebuilt)!==stableStringify(value))throw Error('SOURCE_LINEAGE_INVALID');
  return rebuilt;
}

function validateResearchOutputLineage(value){
  if(!object(value)||value.schemaVersion!==RESEARCH_OUTPUT_LINEAGE_SCHEMA||!validRef(value.lineageRef,'out'))throw Error('RESEARCH_OUTPUT_LINEAGE_INVALID');
  const rebuilt=createResearchOutputLineage(value);
  if(rebuilt.lineageRef!==value.lineageRef||stableStringify(rebuilt)!==stableStringify(value))throw Error('RESEARCH_OUTPUT_LINEAGE_INVALID');
  return rebuilt;
}

function sourceIdentityKey(value){
  return digest({sourceId:value.sourceId,datasetId:value.datasetId,subjectId:value.subjectId,receivedAt:value.receivedAt});
}

function outputIdentityKey(value){
  return digest({outputType:value.outputType,subjectId:value.subjectId,asOf:value.asOf,outputSchemaVersion:value.outputSchemaVersion,modelVersion:value.modelVersion,policyVersion:value.policyVersion});
}

module.exports=Object.freeze({
  SOURCE_LINEAGE_SCHEMA,
  RESEARCH_OUTPUT_LINEAGE_SCHEMA,
  RESEARCH_LINEAGE_SCHEMA,
  SOURCE_STATUSES,
  makeObservationRef,
  createSourceLineage,
  createResearchLineage,
  createSourceObservationLineage,
  createResearchOutputLineage,
  validateSourceObservationLineage,
  validateResearchOutputLineage,
  sourceIdentityKey,
  outputIdentityKey
});
