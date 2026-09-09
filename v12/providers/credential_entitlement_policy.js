'use strict';

const Catalog=require('./source_catalog.js');

const ACCESS_STATES=Object.freeze(['READY','BLOCKED']);
const CREDENTIAL_STATES=Object.freeze(['NOT_REQUIRED','MISSING','PRESENT']);
const ENTITLEMENT_STATES=Object.freeze(['NOT_REQUIRED','UNKNOWN','NOT_ENTITLED','ENTITLED']);

function validResolver(value,label){
  if(value===undefined||value===null)return null;
  if(typeof value!=='function')throw Error(label+'_INVALID');
  return value;
}

function result(source,fields){
  return Object.freeze({
    sourceId:source?.id||fields.sourceId,
    access:fields.access,
    reason:fields.reason,
    credential:fields.credential,
    entitlement:fields.entitlement,
    serverOnly:source?.serverOnly===true,
    secretRequired:source?.secretRequired===true,
    researchOnly:true,
    executionWrite:false
  });
}

function createCredentialEntitlementPolicy({credentialResolver,entitlementResolver}={}){
  const credential=validResolver(credentialResolver,'CREDENTIAL_RESOLVER');
  const entitlement=validResolver(entitlementResolver,'ENTITLEMENT_RESOLVER');

  function credentialPresent(sourceId){
    if(!credential)return false;
    const value=credential(sourceId);
    if(typeof value!=='boolean')throw Error('CREDENTIAL_RESOLVER_INVALID');
    return value;
  }

  function entitlementState(sourceId){
    if(!entitlement)return 'UNKNOWN';
    const value=entitlement(sourceId);
    if(!['UNKNOWN','NOT_ENTITLED','ENTITLED'].includes(value))throw Error('ENTITLEMENT_RESOLVER_INVALID');
    return value;
  }

  function evaluate(sourceId){
    const source=Catalog.getSource(sourceId);
    if(!source){
      return result(null,{sourceId,access:'BLOCKED',reason:'SOURCE_UNKNOWN',credential:'NOT_REQUIRED',entitlement:'NOT_REQUIRED'});
    }

    if(source.status==='REVIEW_REQUIRED'){
      return result(source,{access:'BLOCKED',reason:'REVIEW_REQUIRED',credential:source.secretRequired?'MISSING':'NOT_REQUIRED',entitlement:source.entitlementProtected?'UNKNOWN':'NOT_REQUIRED'});
    }
    if(source.status==='DECISION_REQUIRED'){
      return result(source,{access:'BLOCKED',reason:'DECISION_REQUIRED',credential:source.secretRequired?'MISSING':'NOT_REQUIRED',entitlement:source.entitlementProtected?'UNKNOWN':'NOT_REQUIRED'});
    }
    if(source.status!=='ADOPTED'){
      return result(source,{access:'BLOCKED',reason:source.status||'SOURCE_BLOCKED',credential:source.secretRequired?'MISSING':'NOT_REQUIRED',entitlement:source.entitlementProtected?'UNKNOWN':'NOT_REQUIRED'});
    }

    if(source.secretRequired!==true){
      return result(source,{access:'READY',reason:'READY',credential:'NOT_REQUIRED',entitlement:'NOT_REQUIRED'});
    }

    if(!credentialPresent(source.id)){
      const requiresEntitlement=source.entitlementProtected===true||source.id==='jpx-jquants';
      return result(source,{access:'BLOCKED',reason:'CREDENTIAL_REQUIRED',credential:'MISSING',entitlement:requiresEntitlement?'UNKNOWN':'NOT_REQUIRED'});
    }

    const requiresEntitlement=source.entitlementProtected===true||source.id==='jpx-jquants';
    if(!requiresEntitlement){
      return result(source,{access:'READY',reason:'READY',credential:'PRESENT',entitlement:'NOT_REQUIRED'});
    }

    const state=entitlementState(source.id);
    if(state==='UNKNOWN')return result(source,{access:'BLOCKED',reason:'ENTITLEMENT_REQUIRED',credential:'PRESENT',entitlement:'UNKNOWN'});
    if(state==='NOT_ENTITLED')return result(source,{access:'BLOCKED',reason:'ENTITLEMENT_DENIED',credential:'PRESENT',entitlement:'NOT_ENTITLED'});
    return result(source,{access:'READY',reason:'READY',credential:'PRESENT',entitlement:'ENTITLED'});
  }

  return Object.freeze({evaluate});
}

module.exports=Object.freeze({ACCESS_STATES,CREDENTIAL_STATES,ENTITLEMENT_STATES,createCredentialEntitlementPolicy});
