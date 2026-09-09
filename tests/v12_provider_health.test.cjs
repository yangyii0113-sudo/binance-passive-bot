const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../v12/providers/provider_health.js');

const policy=Object.freeze({
  maxAttempts:3,
  baseBackoffMs:250,
  maxBackoffMs:2000,
  retryableHttpStatus:Object.freeze([408,425,429,500,502,503,504]),
  circuitFailureThreshold:3,
  circuitOpenMs:30000
});

test('provider health and rate vocabularies are explicit and stable',()=>{
  assert.deepEqual(H.HEALTH_STATES,['UNKNOWN','HEALTHY','DEGRADED','RATE_LIMITED','CIRCUIT_OPEN','HALF_OPEN']);
  assert.deepEqual(H.RATE_LIMIT_STATES,['CLEAR','LIMITED']);
  assert.deepEqual(H.DEFAULT_RETRY_POLICY,policy);
});

test('HTTP status classification and retry eligibility are deterministic',()=>{
  assert.equal(H.classifyHttpStatus(200),'2XX');
  assert.equal(H.classifyHttpStatus(429),'4XX');
  assert.equal(H.classifyHttpStatus(503),'5XX');
  assert.equal(H.classifyHttpStatus(null),'NONE');
  assert.equal(H.shouldRetry({attempt:1,httpStatus:503,policy}),true);
  assert.equal(H.shouldRetry({attempt:2,httpStatus:429,policy}),true);
  assert.equal(H.shouldRetry({attempt:3,httpStatus:503,policy}),false);
  assert.equal(H.shouldRetry({attempt:1,httpStatus:404,policy}),false);
  assert.equal(H.shouldRetry({attempt:1,errorKind:'NETWORK',policy}),true);
  assert.equal(H.shouldRetry({attempt:3,errorKind:'NETWORK',policy}),false);
});

test('retry backoff is exponential capped and never shorter than Retry-After',()=>{
  assert.equal(H.retryDelayMs({attempt:1,policy}),250);
  assert.equal(H.retryDelayMs({attempt:2,policy}),500);
  assert.equal(H.retryDelayMs({attempt:4,policy}),2000);
  assert.equal(H.retryDelayMs({attempt:1,policy,retryAfterMs:5000}),5000);
  assert.throws(()=>H.retryDelayMs({attempt:0,policy}),/ATTEMPT_INVALID/);
});

test('new provider health is unknown and never fabricates success or latency',()=>{
  let now=1000;
  const registry=H.createProviderHealthRegistry({clock:()=>now,policy});
  const snap=registry.snapshot('twse-openapi');
  assert.equal(snap.state,'UNKNOWN');
  assert.equal(snap.lastSuccessAt,null);
  assert.equal(snap.lastFailureAt,null);
  assert.equal(snap.lastLatencyMs,null);
  assert.equal(snap.freshnessMs,null);
  assert.equal(snap.rateLimitState,'CLEAR');
  assert.equal(snap.executionWrite,false);
});

test('successful provider request records latency freshness and HTTP class',()=>{
  let now=1200;
  const registry=H.createProviderHealthRegistry({clock:()=>now,policy});
  registry.recordSuccess('twse-openapi',{startedAt:1000,finishedAt:1200,httpStatus:200});
  now=1500;
  const snap=registry.snapshot('twse-openapi');
  assert.equal(snap.state,'HEALTHY');
  assert.equal(snap.lastSuccessAt,1200);
  assert.equal(snap.lastFailureAt,null);
  assert.equal(snap.lastLatencyMs,200);
  assert.equal(snap.freshnessMs,300);
  assert.equal(snap.lastHttpStatus,200);
  assert.equal(snap.lastHttpStatusClass,'2XX');
  assert.equal(snap.consecutiveFailures,0);
});

test('provider failure degrades only that source and preserves other provider health',()=>{
  let now=2000;
  const registry=H.createProviderHealthRegistry({clock:()=>now,policy});
  registry.recordSuccess('sec-edgar',{startedAt:1800,finishedAt:1900,httpStatus:200});
  registry.recordFailure('twse-openapi',{startedAt:1900,finishedAt:2000,httpStatus:503,errorKind:'HTTP'});
  const tw=registry.snapshot('twse-openapi');
  const sec=registry.snapshot('sec-edgar');
  assert.equal(tw.state,'DEGRADED');
  assert.equal(tw.lastFailureAt,2000);
  assert.equal(tw.lastLatencyMs,100);
  assert.equal(tw.lastHttpStatusClass,'5XX');
  assert.equal(sec.state,'HEALTHY');
  assert.equal(sec.lastSuccessAt,1900);
});

test('429 marks source rate-limited and blocks request until explicit limit expires',()=>{
  let now=5000;
  const registry=H.createProviderHealthRegistry({clock:()=>now,policy});
  registry.recordFailure('bls-public',{startedAt:4900,finishedAt:5000,httpStatus:429,errorKind:'HTTP',rateLimitUntil:9000});
  let snap=registry.snapshot('bls-public');
  assert.equal(snap.state,'RATE_LIMITED');
  assert.equal(snap.rateLimitState,'LIMITED');
  assert.equal(snap.rateLimitedUntil,9000);
  assert.deepEqual(registry.beforeRequest('bls-public'),{allowed:false,state:'RATE_LIMITED',reason:'RATE_LIMITED',retryAt:9000});
  now=9000;
  assert.equal(registry.beforeRequest('bls-public').allowed,true);
  snap=registry.snapshot('bls-public');
  assert.equal(snap.rateLimitState,'CLEAR');
});

test('consecutive retryable failures open circuit and one half-open probe is allowed after cooldown',()=>{
  let now=1000;
  const registry=H.createProviderHealthRegistry({clock:()=>now,policy});
  for(let i=0;i<3;i++){
    const started=1000+i*100;
    const finished=started+50;
    now=finished;
    registry.recordFailure('ecb-data',{startedAt:started,finishedAt:finished,httpStatus:503,errorKind:'HTTP'});
  }
  let snap=registry.snapshot('ecb-data');
  assert.equal(snap.state,'CIRCUIT_OPEN');
  assert.equal(snap.consecutiveFailures,3);
  assert.equal(snap.circuitOpenUntil,31250);
  assert.deepEqual(registry.beforeRequest('ecb-data'),{allowed:false,state:'CIRCUIT_OPEN',reason:'CIRCUIT_OPEN',retryAt:31250});

  now=31250;
  const probe=registry.beforeRequest('ecb-data');
  assert.deepEqual(probe,{allowed:true,state:'HALF_OPEN',probe:true});
  assert.deepEqual(registry.beforeRequest('ecb-data'),{allowed:false,state:'HALF_OPEN',reason:'HALF_OPEN_PROBE_IN_FLIGHT',retryAt:null});
  registry.recordSuccess('ecb-data',{startedAt:31250,finishedAt:31300,httpStatus:200});
  snap=registry.snapshot('ecb-data');
  assert.equal(snap.state,'HEALTHY');
  assert.equal(snap.consecutiveFailures,0);
  assert.equal(snap.circuitOpenUntil,null);
});

test('failed half-open probe reopens circuit from probe failure time',()=>{
  let now=1000;
  const registry=H.createProviderHealthRegistry({clock:()=>now,policy:{...policy,circuitFailureThreshold:1}});
  registry.recordFailure('cftc-cot',{startedAt:900,finishedAt:1000,httpStatus:503,errorKind:'HTTP'});
  now=31000;
  assert.equal(registry.beforeRequest('cftc-cot').state,'HALF_OPEN');
  registry.recordFailure('cftc-cot',{startedAt:31000,finishedAt:31100,httpStatus:503,errorKind:'HTTP'});
  const snap=registry.snapshot('cftc-cot');
  assert.equal(snap.state,'CIRCUIT_OPEN');
  assert.equal(snap.circuitOpenUntil,61100);
});

test('registry snapshot-all is source-local immutable and contains no execution methods',()=>{
  const registry=H.createProviderHealthRegistry({clock:()=>1000,policy});
  registry.recordSuccess('twse-openapi',{startedAt:900,finishedAt:1000,httpStatus:200});
  registry.recordFailure('sec-edgar',{startedAt:900,finishedAt:1000,httpStatus:500,errorKind:'HTTP'});
  const all=registry.snapshots();
  assert.deepEqual(Object.keys(all),['sec-edgar','twse-openapi']);
  assert.equal(Object.isFrozen(all),true);
  assert.equal(all['twse-openapi'].executionWrite,false);
  assert.deepEqual(Object.keys(registry).sort(),['beforeRequest','recordFailure','recordSuccess','snapshot','snapshots']);
  assert.doesNotMatch(JSON.stringify(Object.keys(registry)).toLowerCase(),/order|execute|fill|position|trade/);
});
