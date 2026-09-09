'use strict';

const {evaluateSource}=require('../providers/activation_gate.js');

const PUBLIC_SOURCE_ORIGINS=Object.freeze({
  'sec-edgar':'https://data.sec.gov',
  'bls-public':'https://api.bls.gov',
  'fed-official':'https://www.federalreserve.gov',
  'cftc-cot':'https://publicreporting.cftc.gov',
  'twse-openapi':'https://openapi.twse.com.tw',
  'twse-t86':'https://www.twse.com.tw',
  'tpex-openapi':'https://www.tpex.org.tw',
  'ecb-data':'https://data-api.ecb.europa.eu'
});

function unavailable(sourceId,reason){
  return Object.freeze({
    status:'UNAVAILABLE',
    sourceId,
    reason,
    receivedAt:null,
    data:null,
    researchOnly:true,
    executionWrite:false
  });
}

function parseEndpoint(endpoint){
  if(typeof endpoint!=='string'||!endpoint.trim())throw Error('SOURCE_ENDPOINT_FORBIDDEN');
  let url;
  try{url=new URL(endpoint)}catch(_error){throw Error('SOURCE_ENDPOINT_FORBIDDEN')}
  if(url.protocol!=='https:'||url.username||url.password)throw Error('SOURCE_ENDPOINT_FORBIDDEN');
  return url;
}

function assertReadyEndpoint(sourceId,url){
  const origin=PUBLIC_SOURCE_ORIGINS[sourceId];
  if(!origin||url.origin!==origin)throw Error('SOURCE_ENDPOINT_FORBIDDEN');
}

function createPublicSourceLoader({sourceId,endpoint,fetchImpl,clock=Date.now,activationContext={}}={}){
  if(typeof sourceId!=='string'||!sourceId)throw Error('SOURCE_ID_REQUIRED');
  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');

  const url=parseEndpoint(endpoint);
  const initialReadiness=evaluateSource(sourceId,activationContext);
  if(initialReadiness.canActivate===true)assertReadyEndpoint(sourceId,url);

  async function load(){
    const readiness=evaluateSource(sourceId,activationContext);
    if(readiness.canActivate!==true)return unavailable(sourceId,readiness.readiness);

    assertReadyEndpoint(sourceId,url);

    let response;
    try{
      response=await fetchImpl(url.href,{
        method:'GET',
        redirect:'error',
        headers:{Accept:'application/json'}
      });
    }catch(error){
      const message=typeof error?.message==='string'&&error.message?error.message:'UNKNOWN';
      return unavailable(sourceId,'FETCH_FAILED:'+message);
    }

    const receivedAt=clock();
    if(typeof receivedAt!=='number'||!Number.isFinite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');

    if(!response||response.ok!==true){
      const status=Number.isInteger(response?.status)?response.status:'UNKNOWN';
      return unavailable(sourceId,'HTTP_'+status);
    }

    const contentType=response.headers&&typeof response.headers.get==='function'
      ?String(response.headers.get('content-type')||'').toLowerCase()
      :'';
    if(!contentType.includes('json'))return unavailable(sourceId,'CONTENT_TYPE_INVALID');

    let data;
    try{
      data=await response.json();
    }catch(_error){
      return unavailable(sourceId,'PARSE_FAILED');
    }

    return Object.freeze({
      status:'AVAILABLE',
      sourceId,
      receivedAt,
      data,
      researchOnly:true,
      executionWrite:false
    });
  }

  return Object.freeze({load});
}

module.exports=Object.freeze({PUBLIC_SOURCE_ORIGINS,createPublicSourceLoader});
