const test=require('node:test');
const assert=require('node:assert/strict');
const {createPublicSourceLoader}=require('../v12/staging/public_source_loader.js');
const {createProviderRuntimeGovernance}=require('../v12/providers/runtime_governance.js');

const endpoint='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';

function response(status,body,{contentType='application/json; charset=utf-8',headers={}}={}){
  const map=new Map(Object.entries({'content-type':contentType,...headers}).map(([k,v])=>[k.toLowerCase(),String(v)]));
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get(name){return map.get(String(name).toLowerCase())??null;}},
    async json(){if(body instanceof Error)throw body;return body;}
  };
}

function harness(policy={}){
  let now=1000;
  const sleeps=[];
  const governance=createProviderRuntimeGovernance({
    clock:()=>now,
    sleep:async ms=>{sleeps.push(ms);now+=ms;},
    policy:{maxAttempts:3,baseDelayMs:100,maxDelayMs:5000,failureThreshold:2,cooldownMs:5000,freshnessWarnMs:10000,...policy}
  });
  return {governance,sleeps,clock:()=>now,advance:ms=>{now+=ms;}};
}

test('governed public loader retries transient HTTP failure and records final success health',async()=>{
  const h=harness();
  let calls=0;
  const loader=createPublicSourceLoader({
    sourceId:'twse-openapi',endpoint,clock:h.clock,governance:h.governance,
    fetchImpl:async()=>{
      calls+=1;
      h.advance(10);
      return calls===1?response(503,{error:'busy'}):response(200,[{Code:'2330'}]);
    }
  });
  const out=await loader.load();
  assert.equal(out.status,'AVAILABLE');
  assert.deepEqual(out.data,[{Code:'2330'}]);
  assert.equal(out.receivedAt,1120);
  assert.equal(calls,2);
  assert.deepEqual(h.sleeps,[100]);
  const health=h.governance.snapshot('twse-openapi');
  assert.equal(health.health,'HEALTHY');
  assert.equal(health.lastSuccessAt,1120);
  assert.notEqual(health.lastFailureAt,null);
  assert.equal(health.consecutiveFailures,0);
});

test('governed loader treats HTTP-200 parse failure as DATA_FAILURE with no retry',async()=>{
  const h=harness();
  let calls=0;
  const loader=createPublicSourceLoader({
    sourceId:'twse-openapi',endpoint,clock:h.clock,governance:h.governance,
    fetchImpl:async()=>{calls+=1;h.advance(5);return response(200,new Error('bad json'));}
  });
  const out=await loader.load();
  assert.equal(out.status,'UNAVAILABLE');
  assert.equal(out.reason,'PARSE_FAILED');
  assert.equal(calls,1);
  assert.deepEqual(h.sleeps,[]);
  const health=h.governance.snapshot('twse-openapi');
  assert.equal(health.health,'DEGRADED');
  assert.equal(health.lastFailureOutcome,'DATA_FAILURE');
  assert.equal(health.lastHttpStatus,200);
});

test('final governed 429 becomes rate limited and next load is blocked before fetch until Retry-After',async()=>{
  const h=harness({maxAttempts:1});
  let calls=0;
  const loader=createPublicSourceLoader({
    sourceId:'twse-openapi',endpoint,clock:h.clock,governance:h.governance,
    fetchImpl:async()=>{calls+=1;return response(429,{},{headers:{'retry-after':'2','x-ratelimit-remaining':'0','x-ratelimit-limit':'60'}});}
  });
  const first=await loader.load();
  assert.equal(first.status,'UNAVAILABLE');
  assert.equal(first.reason,'RATE_LIMITED');
  assert.equal(calls,1);
  const blocked=await loader.load();
  assert.equal(blocked.status,'UNAVAILABLE');
  assert.equal(blocked.reason,'RATE_LIMITED');
  assert.equal(calls,1);
  h.advance(2000);
  assert.equal(h.governance.snapshot('twse-openapi').rateLimit.state,'CLEAR');
});

test('governed network failure can open a provider-local circuit and later calls do not touch fetch',async()=>{
  const h=harness({maxAttempts:1,failureThreshold:1});
  let calls=0;
  const loader=createPublicSourceLoader({
    sourceId:'twse-openapi',endpoint,clock:h.clock,governance:h.governance,
    fetchImpl:async()=>{calls+=1;throw Error('offline');}
  });
  const first=await loader.load();
  assert.equal(first.status,'UNAVAILABLE');
  assert.equal(first.reason,'NETWORK_FAILURE');
  assert.equal(calls,1);
  assert.equal(h.governance.snapshot('twse-openapi').health,'CIRCUIT_OPEN');
  const blocked=await loader.load();
  assert.equal(blocked.status,'UNAVAILABLE');
  assert.equal(blocked.reason,'CIRCUIT_OPEN');
  assert.equal(calls,1);
});

test('governance is optional for backward-compatible loader behavior and loader surface remains load-only',async()=>{
  let calls=0;
  const legacy=createPublicSourceLoader({
    sourceId:'twse-openapi',endpoint,clock:()=>1000,
    fetchImpl:async()=>{calls+=1;return response(503,{});}
  });
  const out=await legacy.load();
  assert.equal(out.status,'UNAVAILABLE');
  assert.equal(out.reason,'HTTP_503');
  assert.equal(calls,1);

  const h=harness();
  const governed=createPublicSourceLoader({sourceId:'twse-openapi',endpoint,clock:h.clock,governance:h.governance,fetchImpl:async()=>response(200,[])});
  assert.deepEqual(Object.keys(governed),['load']);
  assert.doesNotMatch(JSON.stringify(Object.keys(governed)).toLowerCase(),/order|execute|fill|position|trade/);
});
