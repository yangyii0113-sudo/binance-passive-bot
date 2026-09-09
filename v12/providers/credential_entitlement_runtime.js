'use strict';

const {SOURCE_STATUS,SOURCE_CATALOG}=require('./source_catalog.js');
const {READINESS,evaluateSource}=require('./activation_gate.js');

const CREDENTIAL_STATES=Object.freeze(['NOT_REQUIRED','MISSING','PRESENT','UNKNOWN']);
const ENTITLEMENT_STATES=Object.freeze(['NOT_REQUIRED','UNKNOWN','ENTITLED','NOT_ENTITLED']);
const ACCESS_STATES=Object.freeze(['READY','BLOCKED','UNAVAILABLE']);

function findSource(sourceId){
  return SOURCE_CATALOG.find(item=>item.id===sourceId)||null;
}

function stateObject(required,state){
  return Object.freeze({required:required===true,state});
}

function accessResult({source,activation,access,reason,credentialState,entitlementState}){
  return Object.freeze({
    sourceId:source?.id??activation?.sourceId??null,
    access,
    reason,
    credential:stateObject(source?.secretRequired===true,credentialState),
    entitlement:stateObject(source?.entitlementRequired===true,entitlementState),
    activation,
    serverOnly:source?.serverOnly===true,
    accessControlOnly:true,
    executionWrite:false
  });
}

function hasCredential(value){
  if(typeof value==='string')return value.trim().length>0;
  if(Buffer.isBuffer(value))return value.length>0;
  return false;
}

function createCredentialEntitlementRuntime({readSecret,readEntitlement}={}){
  if(typeof readSecret!=='function')throw Error('SECRET_READER_REQUIRED');
  if(typeof readEntitlement!=='function')throw Error('ENTITLEMENT_READER_REQUIRED');

  function evaluate(sourceId){
    const source=findSource(sourceId);
    if(!source){
      const activation=evaluateSource(sourceId);
      return accessResult({
        source:null,
        activation,
        access:'UNAVAILABLE',
        reason:'SOURCE_UNKNOWN',
        credentialState:'UNKNOWN',
        entitlementState:'UNKNOWN'
      });
    }

    // Catalog decision is authoritative and runs before any secret or entitlement lookup.
    // Credentials cannot override unresolved/review-required source governance.
    if(source.status===SOURCE_STATUS.REVIEW_REQUIRED){
      const activation=evaluateSource(source.id);
      return accessResult({
        source,
        activation,
        access:'BLOCKED',
        reason:'SOURCE_REVIEW_REQUIRED',
        credentialState:source.secretRequired?'UNKNOWN':'NOT_REQUIRED',
        entitlementState:source.entitlementRequired?'UNKNOWN':'NOT_REQUIRED'
      });
    }
    if(source.status===SOURCE_STATUS.DECISION_REQUIRED){
      const activation=evaluateSource(source.id);
      return accessResult({
        source,
        activation,
        access:'BLOCKED',
        reason:'SOURCE_DECISION_REQUIRED',
        credentialState:source.secretRequired?'UNKNOWN':'NOT_REQUIRED',
        entitlementState:source.entitlementRequired?'UNKNOWN':'NOT_REQUIRED'
      });
    }

    if(source.secretRequired!==true){
      const activation=evaluateSource(source.id);
      return accessResult({
        source,
        activation,
        access:activation.canActivate?'READY':'BLOCKED',
        reason:activation.canActivate?'READY':'SOURCE_NOT_ACTIVATABLE',
        credentialState:'NOT_REQUIRED',
        entitlementState:source.entitlementRequired?'UNKNOWN':'NOT_REQUIRED'
      });
    }

    let credentialPresent=false;
    try{
      // Secret material remains closure-local. Only presence is retained.
      credentialPresent=hasCredential(readSecret(source.id));
    }catch(_error){
      const activation=evaluateSource(source.id);
      return accessResult({
        source,
        activation,
        access:'UNAVAILABLE',
        reason:'CREDENTIAL_CHECK_FAILED',
        credentialState:'UNKNOWN',
        entitlementState:'UNKNOWN'
      });
    }

    if(!credentialPresent){
      const activation=evaluateSource(source.id);
      return accessResult({
        source,
        activation,
        access:'BLOCKED',
        reason:'CREDENTIAL_MISSING',
        credentialState:'MISSING',
        entitlementState:source.entitlementRequired?'UNKNOWN':'NOT_REQUIRED'
      });
    }

    if(source.entitlementRequired!==true){
      const activation=evaluateSource(source.id,{credentialSources:[source.id]});
      return accessResult({
        source,
        activation,
        access:activation.canActivate?'READY':'BLOCKED',
        reason:activation.canActivate?'READY':'SOURCE_NOT_ACTIVATABLE',
        credentialState:'PRESENT',
        entitlementState:'NOT_REQUIRED'
      });
    }

    let entitlement;
    try{
      entitlement=readEntitlement(source.id);
    }catch(_error){
      const activation=evaluateSource(source.id,{credentialSources:[source.id]});
      return accessResult({
        source,
        activation,
        access:'UNAVAILABLE',
        reason:'ENTITLEMENT_CHECK_FAILED',
        credentialState:'PRESENT',
        entitlementState:'UNKNOWN'
      });
    }

    if(entitlement===true){
      const activation=evaluateSource(source.id,{credentialSources:[source.id],entitledSources:[source.id]});
      return accessResult({
        source,
        activation,
        access:activation.canActivate?'READY':'BLOCKED',
        reason:activation.canActivate?'READY':'SOURCE_NOT_ACTIVATABLE',
        credentialState:'PRESENT',
        entitlementState:'ENTITLED'
      });
    }

    if(entitlement===false){
      const activation=evaluateSource(source.id,{credentialSources:[source.id]});
      return accessResult({
        source,
        activation,
        access:'BLOCKED',
        reason:'ENTITLEMENT_NOT_GRANTED',
        credentialState:'PRESENT',
        entitlementState:'NOT_ENTITLED'
      });
    }

    const activation=evaluateSource(source.id,{credentialSources:[source.id]});
    return accessResult({
      source,
      activation,
      access:'UNAVAILABLE',
      reason:'ENTITLEMENT_UNKNOWN',
      credentialState:'PRESENT',
      entitlementState:'UNKNOWN'
    });
  }

  return Object.freeze({evaluate});
}

module.exports=Object.freeze({
  CREDENTIAL_STATES,
  ENTITLEMENT_STATES,
  ACCESS_STATES,
  createCredentialEntitlementRuntime
});
