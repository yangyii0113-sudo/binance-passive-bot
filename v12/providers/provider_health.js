'use strict';

const HEALTH_STATES=Object.freeze(['UNKNOWN','HEALTHY','DEGRADED','RATE_LIMITED','CIRCUIT_OPEN','HALF_OPEN']);
const RATE_LIMIT_STATES=Object.freeze(['CLEAR','LIMITED']);
const DEFAULT_RETRY_POLICY=Object.freeze({
  maxAttempts:3,
  baseBackoffMs:250,
  maxBackoffMs:2000,
  retryableHttpStatus:Object.freeze([408,425,429,500,502,503,504]),
  circuitFailureThreshold:3,
  circuitOpenMs:30000
});

function finite(value){return typeof value==='number'&&Number.isFinite(value);}
function positiveInteger(value){return Number.isInteger(value)&&value>0;}
function sourceId(value){if(typeof value!=='string'||!value.trim())throw Error('SOURCE_ID_INVALID');return value.trim();}

function normalizePolicy(value=DEFAULT_RETRY_POLICY){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('RETRY_POLICY_INVALID');
  const retryable=Array.isArray(value.retryableHttpStatus)?[...value.retryableHttpStatus]:null;
  if(!positiveInteger(value.maxAttempts)||!finite(value.baseBackoffMs)||value.baseBackoffMs<0||!finite(value.maxBackoffMs)||value.maxBackoffMs<value.baseBackoffMs||!retryable||retryable.some(x=>!Number.isInteger(x)||x<100||x>599)||!positiveInteger(value.circuitFailureThreshold)||!finite(value.circuitOpenMs)||value.circuitOpenMs<=0)throw Error('RETRY_POLICY_INVALID');
  return Object.freeze({
    maxAttempts:value.maxAttempts,
    baseBackoffMs:value.baseBackoffMs,
    maxBackoffMs:value.maxBackoffMs,
    retryableHttpStatus:Object.freeze(retryable),
    circuitFailureThreshold:value.circuitFailureThreshold,
    circuitOpenMs:value.circuitOpenMs
  });
}

function classifyHttpStatus(status){
  if(status===null||status===undefined)return 'NONE';
  if(!Number.isInteger(status)||status<100||status>599)return 'NONE';
  return `${Math.floor(status/100)}XX`;
}

function shouldRetry({attempt,httpStatus=null,errorKind=null,policy=DEFAULT_RETRY_POLICY}={}){
  const p=normalizePolicy(policy);
  if(!positiveInteger(attempt))throw Error('ATTEMPT_INVALID');
  if(attempt>=p.maxAttempts)return false;
  if(errorKind==='NETWORK')return true;
  return Number.isInteger(httpStatus)&&p.retryableHttpStatus.includes(httpStatus);
}

function retryDelayMs({attempt,policy=DEFAULT_RETRY_POLICY,retryAfterMs=null}={}){
  const p=normalizePolicy(policy);
  if(!positiveInteger(attempt))throw Error('ATTEMPT_INVALID');
  const exponential=Math.min(p.maxBackoffMs,p.baseBackoffMs*(2**(attempt-1)));
  const retryAfter=finite(retryAfterMs)&&retryAfterMs>=0?retryAfterMs:0;
  return Math.max(exponential,retryAfter);
}

function validateTiming({startedAt,finishedAt}){
  if(!finite(startedAt)||!finite(finishedAt)||startedAt<0||finishedAt<startedAt)throw Error('REQUEST_TIME_INVALID');
}

function createEmpty(id){
  return {
    providerId:id,
    state:'UNKNOWN',
    lastSuccessAt:null,
    lastFailureAt:null,
    lastLatencyMs:null,
    lastHttpStatus:null,
    lastHttpStatusClass:'NONE',
    lastErrorKind:null,
    consecutiveFailures:0,
    rateLimitState:'CLEAR',
    rateLimitedUntil:null,
    circuitOpenUntil:null,
    halfOpenProbeInFlight:false
  };
}

function createProviderHealthRegistry({clock=Date.now,policy=DEFAULT_RETRY_POLICY}={}){
  if(typeof clock!=='function')throw Error('CLOCK_INVALID');
  const p=normalizePolicy(policy);
  const states=new Map();

  function now(){
    const value=Number(clock());
    if(!finite(value)||value<0)throw Error('CLOCK_INVALID');
    return value;
  }

  function record(id){
    const key=sourceId(id);
    if(!states.has(key))states.set(key,createEmpty(key));
    return states.get(key);
  }

  function clearExpiredRateLimit(row,at){
    if(row.rateLimitState==='LIMITED'&&finite(row.rateLimitedUntil)&&at>=row.rateLimitedUntil){
      row.rateLimitState='CLEAR';
      row.rateLimitedUntil=null;
      if(row.state==='RATE_LIMITED')row.state=row.lastSuccessAt===null?'DEGRADED':'HEALTHY';
    }
  }

  function frozenSnapshot(row){
    const at=now();
    clearExpiredRateLimit(row,at);
    return Object.freeze({
      providerId:row.providerId,
      state:row.state,
      lastSuccessAt:row.lastSuccessAt,
      lastFailureAt:row.lastFailureAt,
      lastLatencyMs:row.lastLatencyMs,
      freshnessMs:row.lastSuccessAt===null?null:Math.max(0,at-row.lastSuccessAt),
      lastHttpStatus:row.lastHttpStatus,
      lastHttpStatusClass:row.lastHttpStatusClass,
      lastErrorKind:row.lastErrorKind,
      consecutiveFailures:row.consecutiveFailures,
      rateLimitState:row.rateLimitState,
      rateLimitedUntil:row.rateLimitedUntil,
      circuitOpenUntil:row.circuitOpenUntil,
      researchOnly:true,
      executionWrite:false
    });
  }

  function snapshot(id){return frozenSnapshot(record(id));}

  function snapshots(){
    const out={};
    for(const id of [...states.keys()].sort())out[id]=frozenSnapshot(states.get(id));
    return Object.freeze(out);
  }

  function recordSuccess(id,{startedAt,finishedAt,httpStatus=200}={}){
    validateTiming({startedAt,finishedAt});
    const row=record(id);
    row.state='HEALTHY';
    row.lastSuccessAt=finishedAt;
    row.lastLatencyMs=finishedAt-startedAt;
    row.lastHttpStatus=Number.isInteger(httpStatus)?httpStatus:null;
    row.lastHttpStatusClass=classifyHttpStatus(row.lastHttpStatus);
    row.lastErrorKind=null;
    row.consecutiveFailures=0;
    row.rateLimitState='CLEAR';
    row.rateLimitedUntil=null;
    row.circuitOpenUntil=null;
    row.halfOpenProbeInFlight=false;
    return frozenSnapshot(row);
  }

  function recordFailure(id,{startedAt,finishedAt,httpStatus=null,errorKind=null,rateLimitUntil=null}={}){
    validateTiming({startedAt,finishedAt});
    const row=record(id);
    const wasHalfOpen=row.state==='HALF_OPEN'&&row.halfOpenProbeInFlight===true;
    row.lastFailureAt=finishedAt;
    row.lastLatencyMs=finishedAt-startedAt;
    row.lastHttpStatus=Number.isInteger(httpStatus)?httpStatus:null;
    row.lastHttpStatusClass=classifyHttpStatus(row.lastHttpStatus);
    row.lastErrorKind=typeof errorKind==='string'&&errorKind?errorKind:null;
    row.halfOpenProbeInFlight=false;

    const retryable=(row.lastErrorKind==='NETWORK')||(Number.isInteger(row.lastHttpStatus)&&p.retryableHttpStatus.includes(row.lastHttpStatus));
    if(retryable)row.consecutiveFailures+=1;
    else row.consecutiveFailures=0;

    if(row.lastHttpStatus===429){
      if(!finite(rateLimitUntil)||rateLimitUntil<finishedAt)throw Error('RATE_LIMIT_UNTIL_INVALID');
      row.rateLimitState='LIMITED';
      row.rateLimitedUntil=rateLimitUntil;
      row.state='RATE_LIMITED';
      row.circuitOpenUntil=null;
      return frozenSnapshot(row);
    }

    row.rateLimitState='CLEAR';
    row.rateLimitedUntil=null;
    if(wasHalfOpen||(retryable&&row.consecutiveFailures>=p.circuitFailureThreshold)){
      row.state='CIRCUIT_OPEN';
      row.circuitOpenUntil=finishedAt+p.circuitOpenMs;
    }else{
      row.state='DEGRADED';
      row.circuitOpenUntil=null;
    }
    return frozenSnapshot(row);
  }

  function beforeRequest(id){
    const row=record(id);
    const at=now();
    clearExpiredRateLimit(row,at);

    if(row.rateLimitState==='LIMITED'){
      return Object.freeze({allowed:false,state:'RATE_LIMITED',reason:'RATE_LIMITED',retryAt:row.rateLimitedUntil});
    }

    if(row.state==='CIRCUIT_OPEN'){
      if(finite(row.circuitOpenUntil)&&at<row.circuitOpenUntil){
        return Object.freeze({allowed:false,state:'CIRCUIT_OPEN',reason:'CIRCUIT_OPEN',retryAt:row.circuitOpenUntil});
      }
      row.state='HALF_OPEN';
      row.halfOpenProbeInFlight=true;
      return Object.freeze({allowed:true,state:'HALF_OPEN',probe:true});
    }

    if(row.state==='HALF_OPEN'){
      if(row.halfOpenProbeInFlight){
        return Object.freeze({allowed:false,state:'HALF_OPEN',reason:'HALF_OPEN_PROBE_IN_FLIGHT',retryAt:null});
      }
      row.halfOpenProbeInFlight=true;
      return Object.freeze({allowed:true,state:'HALF_OPEN',probe:true});
    }

    return Object.freeze({allowed:true,state:row.state,probe:false});
  }

  return Object.freeze({beforeRequest,recordFailure,recordSuccess,snapshot,snapshots});
}

module.exports=Object.freeze({HEALTH_STATES,RATE_LIMIT_STATES,DEFAULT_RETRY_POLICY,classifyHttpStatus,shouldRetry,retryDelayMs,createProviderHealthRegistry});
