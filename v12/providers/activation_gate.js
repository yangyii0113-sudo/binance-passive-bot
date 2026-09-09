'use strict';
const {SOURCE_STATUS,SOURCE_CATALOG}=require('./source_catalog.js');

const READINESS=Object.freeze({
  READY:'READY',
  CREDENTIAL_REQUIRED:'CREDENTIAL_REQUIRED',
  ENTITLEMENT_REQUIRED:'ENTITLEMENT_REQUIRED',
  REVIEW_REQUIRED:'REVIEW_REQUIRED',
  DECISION_REQUIRED:'DECISION_REQUIRED',
  SOURCE_UNKNOWN:'SOURCE_UNKNOWN',
});

function has(list,id){return Array.isArray(list)&&list.includes(id);}
function result(source,readiness,canActivate){
  return Object.freeze({sourceId:source?.id??null,readiness,canActivate,liveEligible:source?.liveEligible===true,serverOnly:source?.serverOnly===true});
}

function evaluateSource(sourceId,context={}){
  const source=SOURCE_CATALOG.find(x=>x.id===sourceId);
  if(!source)return result(null,READINESS.SOURCE_UNKNOWN,false);
  if(source.status===SOURCE_STATUS.DECISION_REQUIRED)return result(source,READINESS.DECISION_REQUIRED,false);
  if(source.status===SOURCE_STATUS.REVIEW_REQUIRED)return result(source,READINESS.REVIEW_REQUIRED,false);
  if(source.status===SOURCE_STATUS.KEY_REQUIRED){
    if(!has(context.credentialSources,source.id))return result(source,READINESS.CREDENTIAL_REQUIRED,false);
    if(source.entitlementRequired===true&&!has(context.entitledSources,source.id))return result(source,READINESS.ENTITLEMENT_REQUIRED,false);
    return result(source,READINESS.READY,true);
  }
  if(source.status===SOURCE_STATUS.ADOPTED||source.status===SOURCE_STATUS.EXISTING_CORE)return result(source,READINESS.READY,true);
  return result(source,READINESS.REVIEW_REQUIRED,false);
}

module.exports=Object.freeze({READINESS,evaluateSource});
