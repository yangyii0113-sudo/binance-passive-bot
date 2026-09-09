const test=require('node:test');
const assert=require('node:assert/strict');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');
const {createProviderRuntimeGovernance}=require('../v12/providers/runtime_governance.js');

const quoteEndpoint='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const secEndpoint='https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json';

function response(status,body,{headers={}}={}){
  const map=new Map(Object.entries({'content-type':'application/json',...headers}).map(([k,v])=>[k.toLowerCase(),String(v)]));
  return {ok:status>=200&&status<300,status,headers:{get(name){return map.get(String(name).toLowerCase())??null;}},async json(){return body;}};
}

function quoteRow(){
  return {Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'};
}

function usInstrument(){
  return Object.freeze({instrumentId:'NASDAQ:NVDA',exchange:'NASDAQ',symbol:'NVDA',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'});
}

function harness(policy={}){
  let now=Date.parse('2026-09-09T06:30:00Z');
  const sleeps=[];
  const governance=createProviderRuntimeGovernance({
    clock:()=>now,
    sleep:async ms=>{sleeps.push(ms);now+=ms;},
    policy:{maxAttempts:3,baseDelayMs:100,maxDelayMs:5000,failureThreshold:2,cooldownMs:5000,freshnessWarnMs:60000,...policy}
  });
  return {governance,sleeps,clock:()=>now,advance:ms=>{now+=ms;}};
}

function pipeline({h,fetchImpl}){
  const service=createStagingHomeService();
  return createStagingSourcePipeline({fetchImpl,clock:h.clock,publishHome:service.publishHome,providerGovernance:h.governance});
}

test('source pipeline shares governance with public loaders and exposes final provider health diagnostics',async()=>{
  const h=harness();
  let calls=0;
  const p=pipeline({h,fetchImpl:async url=>{
    assert.equal(url,quoteEndpoint);
    calls+=1;
    h.advance(10);
    return calls===1?response(503,{}):response(200,[quoteRow()]);
  }});
  const result=await p.run({nowMs:Date.parse('2026-09-09T06:30:00Z'),twQuotes:[{symbol:'2330',endpoint:quoteEndpoint}]});
  assert.equal(calls,2);
  assert.deepEqual(h.sleeps,[100]);
  assert.equal(result.sources.TWSE[0].status,'AVAILABLE');
  assert.equal(result.providerHealth['twse-openapi'].health,'HEALTHY');
  assert.notEqual(result.providerHealth['twse-openapi'].lastFailureAt,null);
  assert.equal(result.providerHealth['twse-openapi'].executionWrite,false);
});

test('provider rate limit is isolated and does not mark an unrelated successful provider unhealthy',async()=>{
  const h=harness({maxAttempts:1});
  let twCalls=0,secCalls=0;
  const p=pipeline({h,fetchImpl:async url=>{
    if(url===quoteEndpoint){twCalls+=1;return response(200,[quoteRow()]);}
    if(url===secEndpoint){secCalls+=1;return response(429,{},{headers:{'retry-after':'2','x-ratelimit-remaining':'0','x-ratelimit-limit':'60'}});}
    throw Error('unexpected url');
  }});
  const result=await p.run({
    nowMs:Date.parse('2026-09-09T06:30:00Z'),
    twQuotes:[{symbol:'2330',endpoint:quoteEndpoint}],
    usAssets:[{instrument:usInstrument(),sec:{endpoint:secEndpoint,taxonomy:'us-gaap',concept:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD'}}]
  });
  assert.equal(twCalls,1);
  assert.equal(secCalls,1);
  assert.equal(result.providerHealth['twse-openapi'].health,'HEALTHY');
  assert.equal(result.providerHealth['sec-edgar'].health,'RATE_LIMITED');
  assert.equal(result.providerHealth['sec-edgar'].rateLimit.state,'LIMITED');
  assert.equal(result.orchestration.diagnostics.US[0].status,'UNAVAILABLE');
  assert.equal(result.sources.TWSE[0].status,'AVAILABLE');
});

test('an open provider circuit blocks the next source-pipeline run before another network request',async()=>{
  const h=harness({maxAttempts:1,failureThreshold:1});
  let calls=0;
  const p=pipeline({h,fetchImpl:async()=>{calls+=1;throw Error('offline');}});
  const input={nowMs:Date.parse('2026-09-09T06:30:00Z'),twQuotes:[{symbol:'2330',endpoint:quoteEndpoint}]};
  const first=await p.run(input);
  assert.equal(first.sources.TWSE[0].status,'UNAVAILABLE');
  assert.equal(first.providerHealth['twse-openapi'].health,'CIRCUIT_OPEN');
  assert.equal(calls,1);
  const second=await p.run(input);
  assert.equal(second.sources.TWSE[0].reason,'CIRCUIT_OPEN');
  assert.equal(second.providerHealth['twse-openapi'].health,'CIRCUIT_OPEN');
  assert.equal(calls,1);
});

test('provider health diagnostics are immutable research-only data and never become market direction or execution',async()=>{
  const h=harness();
  const p=pipeline({h,fetchImpl:async()=>response(200,[quoteRow()])});
  const result=await p.run({nowMs:Date.parse('2026-09-09T06:30:00Z'),twQuotes:[{symbol:'2330',endpoint:quoteEndpoint}]});
  assert.equal(Object.isFrozen(result.providerHealth),true);
  assert.equal(Object.isFrozen(result.providerHealth['twse-openapi']),true);
  assert.equal(result.providerHealth['twse-openapi'].researchOnly,true);
  assert.equal(result.providerHealth['twse-openapi'].executionWrite,false);
  assert.equal('direction' in result.providerHealth['twse-openapi'],false);
  assert.equal('bias' in result.providerHealth['twse-openapi'],false);
  assert.doesNotMatch(JSON.stringify(result.providerHealth).toLowerCase(),/buy|sell|order|execute|fill/);
});

test('invalid provider governance is rejected before any fetch and pipeline surface remains run-only',async()=>{
  let calls=0;
  assert.throws(()=>createStagingSourcePipeline({fetchImpl:async()=>{calls+=1;return response(200,[])},clock:()=>1,publishHome(){},providerGovernance:{}}),/PROVIDER_GOVERNANCE_INVALID/);
  assert.equal(calls,0);

  const h=harness();
  const p=pipeline({h,fetchImpl:async()=>response(200,[])});
  assert.deepEqual(Object.keys(p),['run']);
  assert.doesNotMatch(JSON.stringify(Object.keys(p)).toLowerCase(),/order|execute|fill|position|trade/);
});
