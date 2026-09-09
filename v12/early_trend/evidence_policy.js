'use strict';

const POLICY_SCHEMA='foxyya-evidence-policy/1';
const POLICY_MODES=Object.freeze(['RESEARCH_CONTROL','SHADOW']);
const POLICY_MARKETS=Object.freeze(['TW','JP']);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const text=x=>typeof x==='string'&&x.length>0;
const positive=x=>finite(x)&&x>0;
const result=errors=>({ok:errors.length===0,errors});

function validateEvidencePolicy(value){
  const errors=[];
  if(!value||typeof value!=='object'||Array.isArray(value))return result(['OBJECT_REQUIRED']);
  if(value.schemaVersion!==POLICY_SCHEMA)errors.push('SCHEMA_VERSION_INVALID');
  if(!text(value.id)||!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(value.id))errors.push('ID_INVALID');
  if(!POLICY_MARKETS.includes(value.market))errors.push('MARKET_INVALID');
  if(!POLICY_MODES.includes(value.mode))errors.push('MODE_INVALID');
  if(!finite(value.createdAt)||value.createdAt<0)errors.push('CREATED_AT_INVALID');
  if(value.researchOnly!==true)errors.push('RESEARCH_ONLY_REQUIRED');
  if(value.executionWrite!==false)errors.push('EXECUTION_WRITE_FORBIDDEN');
  const p=value.parameters;
  if(!p||typeof p!=='object'||Array.isArray(p))errors.push('PARAMETERS_REQUIRED');
  else if(value.market==='TW'){
    if(!positive(p.institutionalFlow?.fullScaleRatio))errors.push('INSTITUTIONAL_FLOW_SCALE_INVALID');
    if(!Number.isInteger(p.institutionalPersistence?.minSessions)||p.institutionalPersistence.minSessions<2)errors.push('INSTITUTIONAL_PERSISTENCE_SESSIONS_INVALID');
    if(!positive(p.institutionalPersistence?.fullScaleAverageRatio))errors.push('INSTITUTIONAL_PERSISTENCE_SCALE_INVALID');
    if(!positive(p.revenueAcceleration?.fullScalePct))errors.push('REVENUE_ACCELERATION_SCALE_INVALID');
  }else if(value.market==='JP'){
    if(!positive(p.guidanceRevision?.fullScalePct))errors.push('GUIDANCE_REVISION_SCALE_INVALID');
  }
  return result(errors);
}

function deepFreezeObject(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreezeObject(child);
  return Object.freeze(value);
}

function freezeEvidencePolicy(value){
  const check=validateEvidencePolicy(value);
  if(!check.ok)throw Error('EVIDENCE_POLICY_INVALID:'+check.errors.join('|'));
  const copy={...value,parameters:JSON.parse(JSON.stringify(value.parameters))};
  deepFreezeObject(copy.parameters);
  return Object.freeze(copy);
}

function parametersFor(policy,section){
  const check=validateEvidencePolicy(policy);
  if(!check.ok)throw Error('EVIDENCE_POLICY_INVALID:'+check.errors.join('|'));
  if(!Object.hasOwn(policy.parameters,section))throw Error('POLICY_SECTION_MISSING');
  return policy.parameters[section];
}

function createEvidencePolicyRegistry(){
  const policies=new Map(),active=new Map();
  function register(value){
    const frozen=freezeEvidencePolicy(value);
    if(policies.has(frozen.id))throw Error('POLICY_DUPLICATE');
    policies.set(frozen.id,frozen);return frozen;
  }
  function activateResearchControl(market,policyId,review){
    const policy=policies.get(policyId);
    if(!policy||policy.market!==market||policy.mode!=='RESEARCH_CONTROL')throw Error('RESEARCH_CONTROL_POLICY_REQUIRED');
    if(!review||!text(review.approvedBy)||!finite(review.approvedAt)||review.approvedAt<policy.createdAt||!text(review.reason))throw Error('REVIEW_REQUIRED');
    const record=Object.freeze({policy,review:Object.freeze({...review})});
    active.set(market,record);return record;
  }
  function activeResearchControl(market){return active.get(market)||null;}
  function get(id){return policies.get(id)||null;}
  function list(){return [...policies.values()];}
  return Object.freeze({register,activateResearchControl,activeResearchControl,get,list});
}

module.exports=Object.freeze({POLICY_SCHEMA,POLICY_MODES,POLICY_MARKETS,validateEvidencePolicy,freezeEvidencePolicy,parametersFor,createEvidencePolicyRegistry});
