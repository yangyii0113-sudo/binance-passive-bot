const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('../v12/providers/runtime_governance.js');
const Providers=require('../v12/providers/index.js');

function headers(values={}){
  const map=new Map(Object.entries(values).map(([k,v])=>[k.toLowerCase(),String(v)]));
  return {get(name){return map.get(String(name).toLowerCase())??null;}};
}
function result(ok,httpStatus,extra={}){
  return {ok,httpStatus,headers:headers(extra.headers||{}),value:extra.value??null,reason:extra.reason??null};
}
function harness(policy={}){
  let now=1_000;
  const sleeps=[];
  const clock=()=>now;
  const advance=ms=>{now+=ms;};
  const sleep=async ms=>{sleeps.push(ms);now+=ms;};
  const governance=G.createProviderRuntimeGovernance({
    clock,sleep,
    policy:{maxAttempts:3,baseDelayMs:100,maxDelayMs:5_000,failureThreshold:2,cooldownMs:5_000,freshnessWarnMs:10_000,...policy}
  });
  return {governance,clock,advance,sleeps};
}

test('provider runtime governance vocabulary is explicit and stable',()=>{
  assert.deepEqual(G.HEALTH_STATES,['UNKNOWN','HEALTHY','DEGRADED','STALE','RATE_LIMITED','CIRCUIT_OPEN']);
  assert.deepEqual(G.CIRCUIT_STATES,['CLOSED','OPEN','HALF_OPEN']);
  assert.deepEqual(G.RATE_LIMIT_STATES,['CLEAR','LIMITED']);
  assert.deepEqual(G.RUN_OUTCOMES,['SUCCESS','HTTP_FAILURE','DATA_FAILURE','NETWORK_FAILURE','RATE_LIMITED','CIRCUIT_OPEN']);
});

test('unknown provider health starts honest with null history rather than fabricated zeros',()=>{
  const {governance}=harness();
  const snap=governance.snapshot('twse-openapi');
  assert.equal(snap.health,'UNKNOWN');
  assert.equal(snap.lastSuccessAt,null);
  assert.equal(snap.lastFailureAt,null);
  assert.equal(snap.lastLatencyMs,null);
  assert.equal(snap.freshnessMs,null);
  assert.equal(snap.httpStatusClass,'UNKNOWN');
  assert.equal(snap.rateLimit.state,'CLEAR');
  assert.equal(snap.circuit.state,'CLOSED');
  assert.equal(snap.researchOnly,true);
  assert.equal(snap.executionWrite,false);
});

test('successful provider run records completion time latency HTTP class and freshness',async()=>{
  const {governance,advance}=harness();
  const out=await governance.run('twse-openapi',async()=>{
    advance(40);
    return result(true,200,{value:{rows:1}});
  });
  assert.equal(out.outcome,'SUCCESS');
  assert.equal(out.attempts,1);
  assert.deepEqual(out.value,{rows:1});
  const snap=governance.snapshot('twse-openapi');
  assert.equal(snap.health,'HEALTHY');
  assert.equal(snap.lastSuccessAt,1_040);
  assert.equal(snap.lastLatencyMs,40);
  assert.equal(snap.freshnessMs,0);
  assert.equal(snap.lastHttpStatus,200);
  assert.equal(snap.httpStatusClass,'2XX');
  assert.equal(snap.consecutiveFailures,0);
});

test('freshness ages from last successful completion and becomes stale without inventing a failure',async()=>{
  const {governance,advance}=harness();
  await governance.run('sec-edgar',async()=>result(true,200,{value:{ok:true}}));
  advance(10_001);
  const snap=governance.snapshot('sec-edgar');
  assert.equal(snap.health,'STALE');
  assert.equal(snap.freshnessMs,10_001);
  assert.equal(snap.lastFailureAt,null);
});

test('retryable transient HTTP failures use deterministic exponential backoff and preserve last failure history',async()=>{
  const {governance,advance,sleeps}=harness();
  let calls=0;
  const out=await governance.run('ecb-data',async()=>{
    calls+=1;
    advance(calls===1?10:calls===2?20:30);
    if(calls===1)return result(false,503,{reason:'HTTP_503'});
    if(calls===2)return result(false,502,{reason:'HTTP_502'});
    return result(true,200,{value:'ok'});
  });
  assert.equal(out.outcome,'SUCCESS');
  assert.equal(out.attempts,3);
  assert.deepEqual(sleeps,[100,200]);
  const snap=governance.snapshot('ecb-data');
  assert.equal(snap.health,'HEALTHY');
  assert.notEqual(snap.lastFailureAt,null);
  assert.equal(snap.lastHttpStatus,200);
  assert.equal(snap.consecutiveFailures,0);
});

test('non-retryable 4xx failure is degraded once and is not retried',async()=>{
  const {governance,sleeps}=harness();
  let calls=0;
  const out=await governance.run('sec-edgar',async()=>{calls+=1;return result(false,400,{reason:'HTTP_400'});});
  assert.equal(out.outcome,'HTTP_FAILURE');
  assert.equal(out.attempts,1);
  assert.equal(calls,1);
  assert.deepEqual(sleeps,[]);
  const snap=governance.snapshot('sec-edgar');
  assert.equal(snap.health,'DEGRADED');
  assert.equal(snap.lastHttpStatus,400);
  assert.equal(snap.httpStatusClass,'4XX');
  assert.equal(snap.circuit.state,'CLOSED');
});

test('data failure after HTTP success is observable as provider degradation and is never retried',async()=>{
  const {governance,sleeps}=harness();
  let calls=0;
  const out=await governance.run('bls-public',async()=>{
    calls+=1;
    return result(false,200,{reason:'PARSE_FAILED'});
  });
  assert.equal(out.outcome,'DATA_FAILURE');
  assert.equal(out.reason,'PARSE_FAILED');
  assert.equal(out.attempts,1);
  assert.equal(calls,1);
  assert.deepEqual(sleeps,[]);
  const snap=governance.snapshot('bls-public');
  assert.equal(snap.health,'DEGRADED');
  assert.equal(snap.lastHttpStatus,200);
  assert.equal(snap.httpStatusClass,'2XX');
});

test('429 rate limit honors Retry-After when it fits bounded retry policy and clears after success',async()=>{
  const {governance,sleeps}=harness();
  let calls=0;
  const out=await governance.run('twse-openapi',async()=>{
    calls+=1;
    if(calls===1)return result(false,429,{reason:'HTTP_429',headers:{'retry-after':'2','x-ratelimit-remaining':'0','x-ratelimit-limit':'60'}});
    return result(true,200,{value:'recovered'});
  });
  assert.equal(out.outcome,'SUCCESS');
  assert.equal(out.attempts,2);
  assert.deepEqual(sleeps,[2_000]);
  const snap=governance.snapshot('twse-openapi');
  assert.equal(snap.health,'HEALTHY');
  assert.equal(snap.rateLimit.state,'CLEAR');
  assert.notEqual(snap.lastRateLimitAt,null);
});

test('final 429 is rate-limited and blocks another call until retry time without touching network',async()=>{
  const {governance,advance}=harness({maxAttempts:1});
  let calls=0;
  const first=await governance.run('twse-openapi',async()=>{
    calls+=1;
    return result(false,429,{reason:'HTTP_429',headers:{'retry-after':'2','x-ratelimit-remaining':'0','x-ratelimit-limit':'60'}});
  });
  assert.equal(first.outcome,'RATE_LIMITED');
  const limited=governance.snapshot('twse-openapi');
  assert.equal(limited.health,'RATE_LIMITED');
  assert.equal(limited.rateLimit.state,'LIMITED');
  assert.equal(limited.rateLimit.retryAt,3_000);
  assert.equal(limited.rateLimit.remaining,0);
  assert.equal(limited.rateLimit.limit,60);

  const blocked=await governance.run('twse-openapi',async()=>{calls+=1;return result(true,200);});
  assert.equal(blocked.outcome,'RATE_LIMITED');
  assert.equal(blocked.attempts,0);
  assert.equal(calls,1);

  advance(2_000);
  const recovered=await governance.run('twse-openapi',async()=>{calls+=1;return result(true,200,{value:'ok'});});
  assert.equal(recovered.outcome,'SUCCESS');
  assert.equal(calls,2);
});

test('repeated transient failures open a provider-local circuit and block calls before cooldown',async()=>{
  const {governance}=harness({maxAttempts:1,failureThreshold:2});
  let calls=0;
  const fail=()=>governance.run('ecb-data',async()=>{calls+=1;throw Error('network-down');});
  assert.equal((await fail()).outcome,'NETWORK_FAILURE');
  assert.equal((await fail()).outcome,'NETWORK_FAILURE');
  const open=governance.snapshot('ecb-data');
  assert.equal(open.health,'CIRCUIT_OPEN');
  assert.equal(open.circuit.state,'OPEN');
  assert.equal(open.consecutiveFailures,2);

  const blocked=await governance.run('ecb-data',async()=>{calls+=1;return result(true,200);});
  assert.equal(blocked.outcome,'CIRCUIT_OPEN');
  assert.equal(blocked.attempts,0);
  assert.equal(calls,2);
});

test('circuit moves to half-open after cooldown and a successful probe closes it',async()=>{
  const {governance,advance}=harness({maxAttempts:1,failureThreshold:1,cooldownMs:5_000});
  await governance.run('ecb-data',async()=>{throw Error('network-down');});
  assert.equal(governance.snapshot('ecb-data').circuit.state,'OPEN');
  advance(5_000);
  assert.equal(governance.snapshot('ecb-data').circuit.state,'HALF_OPEN');
  const recovered=await governance.run('ecb-data',async()=>result(true,200,{value:'ok'}));
  assert.equal(recovered.outcome,'SUCCESS');
  const snap=governance.snapshot('ecb-data');
  assert.equal(snap.circuit.state,'CLOSED');
  assert.equal(snap.health,'HEALTHY');
  assert.equal(snap.consecutiveFailures,0);
});

test('provider circuit and rate state are isolated by provider id',async()=>{
  const {governance}=harness({maxAttempts:1,failureThreshold:1});
  await governance.run('ecb-data',async()=>{throw Error('network-down');});
  assert.equal(governance.snapshot('ecb-data').circuit.state,'OPEN');
  assert.equal(governance.snapshot('sec-edgar').circuit.state,'CLOSED');
  const other=await governance.run('sec-edgar',async()=>result(true,200,{value:'healthy'}));
  assert.equal(other.outcome,'SUCCESS');
  assert.equal(governance.snapshot('sec-edgar').health,'HEALTHY');
  assert.equal(governance.snapshot('ecb-data').health,'CIRCUIT_OPEN');
});

test('provider foundation exports runtime governance without trading or order surface',()=>{
  assert.equal(Providers.createProviderRuntimeGovernance,G.createProviderRuntimeGovernance);
  assert.doesNotMatch(JSON.stringify(Object.keys(G)).toLowerCase(),/order|execute|fill|position|trade/);
});
