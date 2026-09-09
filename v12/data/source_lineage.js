'use strict';

const crypto=require('node:crypto');

const SOURCE_LINEAGE_SCHEMA='foxyya-source-lineage/1';
const RESEARCH_OUTPUT_LINEAGE_SCHEMA='foxyya-research-output-lineage/1';
const SOURCE_STATUSES=Object.freeze(['AVAILABLE','UNAVAILABLE']);
const SECRET_KEYS=new Set(['apikey','secret','token','authorization','password','credential']);

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

function normalizedKey(key){return String(key).toLowerCase().replace(/[^a-z0-9]/g,'');}

function assertCanonicalSafeInput(input){
  if(!object(input))throw Error('LINEAGE_INPUT_REQUIRED');
  for(const key of Object.keys(input)){
    const normalized=normalizedKey(key);
    if(SECRET_KEYS.has(normalized))throw Error('SECRET_FIELD_FORBIDDEN');
    if(normalized==='researchonly'){
      if(input[key]!==true)throw Error('RESEARCH_ONLY_REQUIRED');
      continue;
    }
    if(normalized==='executionwrite'){
      if(input[key]!==false)throw Error('EXECUTION_FIELD_FORBIDDEN');
      continue;
    }
    if(/execution|execute|order|fill|position|trade/.test(normalized))throw Error('EXECUTION_FIELD_FORBIDDEN');
  }
}

function observationRef({sourceId,datasetId,canonicalSchemaVersion,observation}){
  return 'obs_'+digest({sourceId,datasetId,canonicalSchemaVersion,observation});
}

function createSourceObservationLineage(input={}){
  assertCanonicalSafeInput(input);
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
  assertCanonicalSafeInput(input);
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
  SOURCE_STATUSES,
  createSourceObservationLineage,
  createResearchOutputLineage,
  validateSourceObservationLineage,
  validateResearchOutputLineage,
  sourceIdentityKey,
  outputIdentityKey
});
