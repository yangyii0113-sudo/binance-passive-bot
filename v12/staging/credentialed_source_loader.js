'use strict';

const {evaluateSource}=require('../providers/activation_gate.js');

const CREDENTIALED_SOURCE_ORIGINS=Object.freeze({
  'twelve-data-us-quote':'https://api.twelvedata.com',
  'twelve-data-us-volatility':'https://api.twelvedata.com',
  'twelve-data-eu-breadth':'https://api.twelvedata.com'
});
const TWELVE_DATA_QUOTE_SOURCES=new Set(['twelve-data-us-quote','twelve-data-us-volatility','twelve-data-eu-breadth']);
const SENSITIVE_QUERY_KEYS=new Set(['apikey','api_key','token','authorization','key','secret','access_token']);

function unavailable(sourceId,reason,{fetchStartedAt=null,receivedAt=null}={}){
  return Object.freeze({status:'UNAVAILABLE',sourceId,reason,fetchStartedAt,receivedAt,data:null,researchOnly:true,executionWrite:false});
}
function available(sourceId,fetchStartedAt,receivedAt,data){
  return Object.freeze({status:'AVAILABLE',sourceId,fetchStartedAt,receivedAt,data,researchOnly:true,executionWrite:false});
}
function safeClock(clock){
  const value=Number(clock());
  if(!Number.isFinite(value)||value<0)throw Error('RECEIVED_AT_INVALID');
  return value;
}
function parseEndpoint(sourceId,endpoint){
  if(typeof endpoint!=='string'||!endpoint.trim())throw Error('SOURCE_ENDPOINT_FORBIDDEN');
  let url;
  try{url=new URL(endpoint)}catch(_error){throw Error('SOURCE_ENDPOINT_FORBIDDEN')}
  if(url.protocol!=='https:'||url.username||url.password)throw Error('SOURCE_ENDPOINT_FORBIDDEN');
  const origin=CREDENTIALED_SOURCE_ORIGINS[sourceId];
  if(!origin||url.origin!==origin)throw Error('SOURCE_ENDPOINT_FORBIDDEN');
  if(TWELVE_DATA_QUOTE_SOURCES.has(sourceId)&&url.pathname!=='/quote')throw Error('SOURCE_ENDPOINT_FORBIDDEN');
  for(const key of url.searchParams.keys())if(SENSITIVE_QUERY_KEYS.has(String(key).toLowerCase()))throw Error('SOURCE_SECRET_IN_URL_FORBIDDEN');
  return url;
}
function readCredential(readSecret,sourceId){
  let value;
  try{value=readSecret(sourceId)}catch(_error){return {ok:false,reason:'CREDENTIAL_CHECK_FAILED',secret:null};}
  if(typeof value!=='string'||!value.trim())return {ok:false,reason:'CREDENTIAL_REQUIRED',secret:null};
  return {ok:true,reason:'READY',secret:value.trim()};
}
function hasEntitlement(readEntitlement,sourceId){
  if(typeof readEntitlement!=='function')return false;
  try{return readEntitlement(sourceId)===true;}catch(_error){return false;}
}

function createCredentialedSourceLoader({sourceId,endpoint,fetchImpl,readSecret,readEntitlement,clock=Date.now}={}){
  if(typeof sourceId!=='string'||!sourceId)throw Error('SOURCE_ID_REQUIRED');
  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof readSecret!=='function')throw Error('SECRET_READER_REQUIRED');
  if(readEntitlement!==undefined&&readEntitlement!==null&&typeof readEntitlement!=='function')throw Error('ENTITLEMENT_READER_INVALID');
  if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');
  const url=parseEndpoint(sourceId,endpoint);

  async function load(){
    const preflight=evaluateSource(sourceId);
    if(preflight.readiness==='SOURCE_UNKNOWN')return unavailable(sourceId,'SOURCE_UNKNOWN');
    if(preflight.readiness!=='CREDENTIAL_REQUIRED'&&preflight.canActivate!==true)return unavailable(sourceId,preflight.readiness);

    const credential=readCredential(readSecret,sourceId);
    if(!credential.ok)return unavailable(sourceId,credential.reason);

    let ready=evaluateSource(sourceId,{credentialSources:[sourceId]});
    if(ready.readiness==='ENTITLEMENT_REQUIRED'){
      if(!hasEntitlement(readEntitlement,sourceId))return unavailable(sourceId,'ENTITLEMENT_REQUIRED');
      ready=evaluateSource(sourceId,{credentialSources:[sourceId],entitledSources:[sourceId]});
    }
    if(ready.canActivate!==true)return unavailable(sourceId,ready.readiness);

    const fetchStartedAt=safeClock(clock);
    let response;
    try{
      response=await fetchImpl(url.href,{
        method:'GET',redirect:'error',
        headers:{Accept:'application/json',Authorization:`apikey ${credential.secret}`}
      });
    }catch(_error){return unavailable(sourceId,'FETCH_FAILED',{fetchStartedAt,receivedAt:safeClock(clock)});}

    const receivedAt=safeClock(clock);
    if(!response||response.ok!==true){
      const status=Number.isInteger(response?.status)?response.status:'UNKNOWN';
      return unavailable(sourceId,'HTTP_'+status,{fetchStartedAt,receivedAt});
    }
    const contentType=response.headers&&typeof response.headers.get==='function'?String(response.headers.get('content-type')||'').toLowerCase():'';
    if(!contentType.includes('json'))return unavailable(sourceId,'CONTENT_TYPE_INVALID',{fetchStartedAt,receivedAt});
    let data;
    try{data=await response.json();}catch(_error){return unavailable(sourceId,'PARSE_FAILED',{fetchStartedAt,receivedAt:safeClock(clock)});}
    return available(sourceId,fetchStartedAt,receivedAt,data);
  }
  return Object.freeze({load});
}

module.exports=Object.freeze({CREDENTIALED_SOURCE_ORIGINS,createCredentialedSourceLoader});
