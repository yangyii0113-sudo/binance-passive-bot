'use strict';

const {evaluateSource}=require('../providers/activation_gate.js');

const PUBLIC_SOURCE_ORIGINS=Object.freeze({
  'sec-edgar':'https://data.sec.gov',
  'bls-public':'https://api.bls.gov',
  'fed-official':'https://www.federalreserve.gov',
  'cftc-cot':'https://publicreporting.cftc.gov',
  'twse-openapi':'https://openapi.twse.com.tw',
  'twse-market':'https://www.twse.com.tw',
  'twse-t86':'https://www.twse.com.tw',
  'tpex-openapi':'https://www.tpex.org.tw',
  'ecb-data':'https://data-api.ecb.europa.eu'
});

function unavailable(sourceId,reason,{fetchStartedAt=null,receivedAt=null}={}){
  return Object.freeze({
    status:'UNAVAILABLE',
    sourceId,
    reason,
    fetchStartedAt,
    receivedAt,
    data:null,
    researchOnly:true,
    executionWrite:false
  });
}

function available(sourceId,fetchStartedAt,receivedAt,data){
  return Object.freeze({
    status:'AVAILABLE',
    sourceId,
    fetchStartedAt,
    receivedAt,
    data,
    researchOnly:true,
    executionWrite:false
  });
}

function safeClock(clock){
  const receivedAt=Number(clock());
  if(!Number.isFinite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');
  return receivedAt;
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

function validateGovernance(governance){
  if(governance===undefined||governance===null)return null;
  if(typeof governance!=='object'||typeof governance.run!=='function'||typeof governance.snapshot!=='function')throw Error('PROVIDER_GOVERNANCE_INVALID');
  return governance;
}

function createPublicSourceLoader({sourceId,endpoint,fetchImpl,clock=Date.now,activationContext={},governance}={}){
  if(typeof sourceId!=='string'||!sourceId)throw Error('SOURCE_ID_REQUIRED');
  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');
  const runtime=validateGovernance(governance);

  const url=parseEndpoint(endpoint);
  const initialReadiness=evaluateSource(sourceId,activationContext);
  if(initialReadiness.canActivate===true)assertReadyEndpoint(sourceId,url);

  async function legacyLoad(){
    const fetchStartedAt=safeClock(clock);
    let response;
    try{
      response=await fetchImpl(url.href,{
        method:'GET',
        redirect:'error',
        headers:{Accept:'application/json'}
      });
    }catch(error){
      const receivedAt=safeClock(clock);
      const message=typeof error?.message==='string'&&error.message?error.message:'UNKNOWN';
      return unavailable(sourceId,'FETCH_FAILED:'+message,{fetchStartedAt,receivedAt});
    }

    const receivedAt=safeClock(clock);
    if(!response||response.ok!==true){
      const status=Number.isInteger(response?.status)?response.status:'UNKNOWN';
      return unavailable(sourceId,'HTTP_'+status,{fetchStartedAt,receivedAt});
    }

    const contentType=response.headers&&typeof response.headers.get==='function'
      ?String(response.headers.get('content-type')||'').toLowerCase()
      :'';
    if(!contentType.includes('json'))return unavailable(sourceId,'CONTENT_TYPE_INVALID',{fetchStartedAt,receivedAt});

    let data;
    try{data=await response.json();}
    catch(_error){return unavailable(sourceId,'PARSE_FAILED',{fetchStartedAt,receivedAt:safeClock(clock)});}
    return available(sourceId,fetchStartedAt,receivedAt,data);
  }

  async function governedLoad(){
    let fetchStartedAt=null;
    const transportAttempt=async()=>{
      if(fetchStartedAt===null)fetchStartedAt=safeClock(clock);
      const response=await fetchImpl(url.href,{
        method:'GET',
        redirect:'error',
        headers:{Accept:'application/json'}
      });

      const status=Number.isInteger(response?.status)?response.status:null;
      const headers=response?.headers||null;
      if(!response||response.ok!==true){
        return {ok:false,httpStatus:status,headers,reason:'HTTP_'+(status??'UNKNOWN')};
      }

      const contentType=response.headers&&typeof response.headers.get==='function'
        ?String(response.headers.get('content-type')||'').toLowerCase()
        :'';
      if(!contentType.includes('json'))return {ok:false,httpStatus:status,headers,reason:'CONTENT_TYPE_INVALID'};

      let data;
      try{data=await response.json();}
      catch(_error){return {ok:false,httpStatus:status,headers,reason:'PARSE_FAILED'};}

      return {ok:true,httpStatus:status,headers,value:data};
    };

    const result=await runtime.run(sourceId,transportAttempt);
    const touchedNetwork=fetchStartedAt!==null;
    const receivedAt=touchedNetwork?safeClock(clock):null;
    if(result.outcome==='SUCCESS')return available(sourceId,fetchStartedAt,receivedAt,result.value);
    if(result.outcome==='RATE_LIMITED')return unavailable(sourceId,'RATE_LIMITED',{fetchStartedAt,receivedAt});
    if(result.outcome==='CIRCUIT_OPEN')return unavailable(sourceId,'CIRCUIT_OPEN',{fetchStartedAt,receivedAt});
    if(result.outcome==='NETWORK_FAILURE')return unavailable(sourceId,'NETWORK_FAILURE',{fetchStartedAt,receivedAt});
    return unavailable(sourceId,result.reason||result.outcome||'PROVIDER_RUNTIME_FAILURE',{fetchStartedAt,receivedAt});
  }

  async function load(){
    const readiness=evaluateSource(sourceId,activationContext);
    if(readiness.canActivate!==true)return unavailable(sourceId,readiness.readiness);
    assertReadyEndpoint(sourceId,url);
    return runtime?governedLoad():legacyLoad();
  }

  return Object.freeze({load});
}

module.exports=Object.freeze({PUBLIC_SOURCE_ORIGINS,createPublicSourceLoader});
