'use strict';

const HEALTH_STATES=Object.freeze(['UNKNOWN','HEALTHY','DEGRADED','STALE','RATE_LIMITED','CIRCUIT_OPEN']);
const CIRCUIT_STATES=Object.freeze(['CLOSED','OPEN','HALF_OPEN']);
const RATE_LIMIT_STATES=Object.freeze(['CLEAR','LIMITED']);
const RUN_OUTCOMES=Object.freeze(['SUCCESS','HTTP_FAILURE','DATA_FAILURE','NETWORK_FAILURE','RATE_LIMITED','CIRCUIT_OPEN']);

const DEFAULT_POLICY=Object.freeze({
  maxAttempts:3,
  baseDelayMs:250,
  maxDelayMs:5000,
  failureThreshold:3,
  cooldownMs:30000,
  freshnessWarnMs:60000
});

const RETRYABLE_HTTP=new Set([408,425,429,500,502,503,504]);

function finite(v){return typeof v==='number'&&Number.isFinite(v);}
function positiveInt(v){return Number.isInteger(v)&&v>0;}
function providerId(v){if(typeof v!=='string'||!v.trim())throw Error('PROVIDER_ID_INVALID');return v.trim();}
function httpClass(status){return Number.isInteger(status)&&status>=100&&status<=599?`${Math.floor(status/100)}XX`:'UNKNOWN';}

function normalizePolicy(value={}){
  const p={...DEFAULT_POLICY,...value};
  if(!positiveInt(p.maxAttempts)||!finite(p.baseDelayMs)||p.baseDelayMs<0||!finite(p.maxDelayMs)||p.maxDelayMs<p.baseDelayMs||!positiveInt(p.failureThreshold)||!finite(p.cooldownMs)||p.cooldownMs<=0||!finite(p.freshnessWarnMs)||p.freshnessWarnMs<0)throw Error('RUNTIME_POLICY_INVALID');
  return Object.freeze(p);
}

function headerNumber(headers,name){
  const raw=headers&&typeof headers.get==='function'?headers.get(name):null;
  if(raw===null||raw===undefined||String(raw).trim()==='')return null;
  const n=Number(raw);
  return Number.isFinite(n)?n:null;
}

function retryAfterMs(headers){
  const raw=headers&&typeof headers.get==='function'?headers.get('retry-after'):null;
  if(raw===null||raw===undefined)return null;
  const seconds=Number(raw);
  if(Number.isFinite(seconds)&&seconds>=0)return Math.round(seconds*1000);
  const when=Date.parse(String(raw));
  if(Number.isFinite(when))return when;
  return null;
}

function backoff(attempt,policy){
  return Math.min(policy.maxDelayMs,policy.baseDelayMs*(2**(attempt-1)));
}

function empty(id){
  return {
    providerId:id,
    lastSuccessAt:null,
    lastFailureAt:null,
    lastLatencyMs:null,
    lastHttpStatus:null,
    lastFailureOutcome:null,
    consecutiveFailures:0,
    lastRateLimitAt:null,
    rateLimit:{state:'CLEAR',retryAt:null,remaining:null,limit:null},
    circuit:{state:'CLOSED',openedAt:null,retryAt:null}
  };
}

function createProviderRuntimeGovernance({clock=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),policy={}}={}){
  if(typeof clock!=='function'||typeof sleep!=='function')throw Error('RUNTIME_DEPENDENCY_INVALID');
  const p=normalizePolicy(policy);
  const rows=new Map();

  function now(){const n=Number(clock());if(!finite(n)||n<0)throw Error('CLOCK_INVALID');return n;}
  function row(id){const key=providerId(id);if(!rows.has(key))rows.set(key,empty(key));return rows.get(key);}

  function refreshTemporalState(r,at){
    if(r.rateLimit.state==='LIMITED'&&finite(r.rateLimit.retryAt)&&at>=r.rateLimit.retryAt){
      r.rateLimit={state:'CLEAR',retryAt:null,remaining:r.rateLimit.remaining,limit:r.rateLimit.limit};
    }
    if(r.circuit.state==='OPEN'&&finite(r.circuit.retryAt)&&at>=r.circuit.retryAt){
      r.circuit={state:'HALF_OPEN',openedAt:r.circuit.openedAt,retryAt:r.circuit.retryAt};
    }
  }

  function healthOf(r,at){
    refreshTemporalState(r,at);
    if(r.rateLimit.state==='LIMITED')return 'RATE_LIMITED';
    if(r.circuit.state==='OPEN')return 'CIRCUIT_OPEN';
    if(r.lastSuccessAt===null)return r.lastFailureAt===null?'UNKNOWN':'DEGRADED';
    if(at-r.lastSuccessAt>p.freshnessWarnMs)return 'STALE';
    if(r.lastFailureAt!==null&&r.lastFailureAt>r.lastSuccessAt)return 'DEGRADED';
    return 'HEALTHY';
  }

  function snapshot(id){
    const r=row(id),at=now();
    const health=healthOf(r,at);
    return Object.freeze({
      providerId:r.providerId,
      health,
      lastSuccessAt:r.lastSuccessAt,
      lastFailureAt:r.lastFailureAt,
      lastLatencyMs:r.lastLatencyMs,
      freshnessMs:r.lastSuccessAt===null?null:Math.max(0,at-r.lastSuccessAt),
      lastHttpStatus:r.lastHttpStatus,
      httpStatusClass:httpClass(r.lastHttpStatus),
      lastFailureOutcome:r.lastFailureOutcome,
      consecutiveFailures:r.consecutiveFailures,
      lastRateLimitAt:r.lastRateLimitAt,
      rateLimit:Object.freeze({...r.rateLimit}),
      circuit:Object.freeze({...r.circuit}),
      researchOnly:true,
      executionWrite:false
    });
  }

  function markAttemptFailure(r,{finishedAt,latency,httpStatus,outcome}){
    r.lastFailureAt=finishedAt;
    r.lastLatencyMs=latency;
    r.lastHttpStatus=Number.isInteger(httpStatus)?httpStatus:null;
    r.lastFailureOutcome=outcome;
  }

  function markRunFailure(r,finishedAt){
    r.consecutiveFailures+=1;
    if(r.circuit.state==='HALF_OPEN'||r.consecutiveFailures>=p.failureThreshold){
      r.circuit={state:'OPEN',openedAt:finishedAt,retryAt:finishedAt+p.cooldownMs};
    }
  }

  function markSuccess(r,{finishedAt,latency,httpStatus}){
    r.lastSuccessAt=finishedAt;
    r.lastLatencyMs=latency;
    r.lastHttpStatus=Number.isInteger(httpStatus)?httpStatus:null;
    r.consecutiveFailures=0;
    r.rateLimit={state:'CLEAR',retryAt:null,remaining:r.rateLimit.remaining,limit:r.rateLimit.limit};
    r.circuit={state:'CLOSED',openedAt:null,retryAt:null};
  }

  function terminal(outcome,attempts,extra={}){
    return Object.freeze({outcome,attempts,value:extra.value??null,reason:extra.reason??null,researchOnly:true,executionWrite:false});
  }

  async function run(id,operation){
    if(typeof operation!=='function')throw Error('PROVIDER_OPERATION_REQUIRED');
    const r=row(id),at=now();
    refreshTemporalState(r,at);

    if(r.rateLimit.state==='LIMITED')return terminal('RATE_LIMITED',0,{reason:'RATE_LIMITED'});
    if(r.circuit.state==='OPEN')return terminal('CIRCUIT_OPEN',0,{reason:'CIRCUIT_OPEN'});

    let finalFailure=null;
    for(let attempt=1;attempt<=p.maxAttempts;attempt++){
      const startedAt=now();
      let response;
      try{
        response=await operation({attempt});
      }catch(error){
        const finishedAt=now();
        markAttemptFailure(r,{finishedAt,latency:finishedAt-startedAt,httpStatus:null,outcome:'NETWORK_FAILURE'});
        finalFailure={outcome:'NETWORK_FAILURE',reason:error?.message||'NETWORK_FAILURE',finishedAt};
        if(attempt<p.maxAttempts){await sleep(backoff(attempt,p));continue;}
        markRunFailure(r,finishedAt);
        return terminal('NETWORK_FAILURE',attempt,{reason:finalFailure.reason});
      }

      const finishedAt=now();
      const latency=finishedAt-startedAt;
      if(!response||typeof response!=='object'){
        markAttemptFailure(r,{finishedAt,latency,httpStatus:null,outcome:'DATA_FAILURE'});
        markRunFailure(r,finishedAt);
        return terminal('DATA_FAILURE',attempt,{reason:'PROVIDER_RESULT_INVALID'});
      }

      const status=Number.isInteger(response.httpStatus)?response.httpStatus:null;
      if(response.ok===true&&status!==null&&status>=200&&status<300){
        markSuccess(r,{finishedAt,latency,httpStatus:status});
        return terminal('SUCCESS',attempt,{value:response.value});
      }

      if(status===429){
        const retryHeader=retryAfterMs(response.headers);
        const relativeRetry=retryHeader===null?null:(retryHeader>1000000000?Math.max(0,retryHeader-finishedAt):retryHeader);
        const remaining=headerNumber(response.headers,'x-ratelimit-remaining');
        const limit=headerNumber(response.headers,'x-ratelimit-limit');
        r.lastRateLimitAt=finishedAt;
        markAttemptFailure(r,{finishedAt,latency,httpStatus:429,outcome:'RATE_LIMITED'});

        const canRetry=attempt<p.maxAttempts&&relativeRetry!==null&&relativeRetry<=p.maxDelayMs;
        if(canRetry){
          await sleep(Math.max(backoff(attempt,p),relativeRetry));
          continue;
        }

        const delay=relativeRetry!==null?relativeRetry:backoff(attempt,p);
        r.rateLimit={state:'LIMITED',retryAt:finishedAt+delay,remaining,limit};
        markRunFailure(r,finishedAt);
        return terminal('RATE_LIMITED',attempt,{reason:response.reason||'HTTP_429'});
      }

      if(response.ok===false&&status!==null&&status>=200&&status<300){
        markAttemptFailure(r,{finishedAt,latency,httpStatus:status,outcome:'DATA_FAILURE'});
        markRunFailure(r,finishedAt);
        return terminal('DATA_FAILURE',attempt,{reason:response.reason||'DATA_FAILURE'});
      }

      const failureOutcome='HTTP_FAILURE';
      markAttemptFailure(r,{finishedAt,latency,httpStatus:status,outcome:failureOutcome});
      finalFailure={outcome:failureOutcome,reason:response.reason||`HTTP_${status??'UNKNOWN'}`,finishedAt};
      if(attempt<p.maxAttempts&&status!==null&&RETRYABLE_HTTP.has(status)){
        await sleep(backoff(attempt,p));
        continue;
      }
      markRunFailure(r,finishedAt);
      return terminal(failureOutcome,attempt,{reason:finalFailure.reason});
    }

    throw Error('RUNTIME_LOOP_UNREACHABLE');
  }

  return Object.freeze({run,snapshot});
}

module.exports=Object.freeze({HEALTH_STATES,CIRCUIT_STATES,RATE_LIMIT_STATES,RUN_OUTCOMES,createProviderRuntimeGovernance});
