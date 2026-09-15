'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');

const nowMs=Date.parse('2026-09-15T02:00:00Z');
const secEndpoint='https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json';
const volatilityEndpoint='https://api.twelvedata.com/quote?symbol=VIX';
const instrument=Object.freeze({instrumentId:'NASDAQ:NVDA',exchange:'NASDAQ',symbol:'NVDA',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'});
function response(body,{status=200}={}){return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}};}
function secPayload(){return {cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}};}
function volatilityPayload(){const observedAt=nowMs-5000;return {symbol:'VIX',name:'CBOE Volatility Index',exchange:'CBOE',timestamp:Math.floor(observedAt/1000),last_quote_at:Math.floor(observedAt/1000),open:'17.20',high:'18.10',low:'16.95',close:'17.84',previous_close:'17.30',change:'0.54',percent_change:'3.121'};}
function input(){return {nowMs,usAssets:[{instrument,sec:{endpoint:secEndpoint,taxonomy:'us-gaap',concept:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD'},researchEvidence:[],earlyEvidence:[]}],usVolatility:{endpoint:volatilityEndpoint,symbol:'VIX'}};}
function makePipeline({readSecret,readEntitlement,volatilityFailure=false}={}){
  const calls=[];
  const service=createStagingHomeService();
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(url===secEndpoint)return response(secPayload());
    if(url===volatilityEndpoint){if(volatilityFailure)throw Error('volatility offline');return response(volatilityPayload());}
    throw Error('unexpected url '+url);
  };
  const pipeline=createStagingSourcePipeline({fetchImpl,clock:()=>nowMs,publishHome:service.publishHome,readSecret,readEntitlement});
  return {pipeline,calls};
}

test('missing volatility key and entitlement skip provider network and keep explicit external blockers',async()=>{
  const {pipeline,calls}=makePipeline({readSecret:()=>null,readEntitlement:()=>false});
  const result=await pipeline.run(input());
  assert.deepEqual(calls.map(x=>x.url),[secEndpoint]);
  const datasets=result.orchestration.published.providerDiagnostics.datasets;
  assert.equal(datasets.some(x=>x.sourceId==='twelve-data-us-volatility'),false);
  const us=result.orchestration.published.marketCoverage.markets.US;
  assert.equal(us.coverageStatus,'BLOCKED');
  assert.equal(us.directionReadiness,'NOT_READY');
  assert.ok(us.missingCapabilities.includes('VOLATILITY_CONTEXT'));
  assert.ok(us.blockers.some(x=>x.type==='API_KEY_REQUIRED'&&x.capability==='VOLATILITY_CONTEXT'&&x.sourceId==='twelve-data-us-volatility'));
  assert.ok(us.blockers.some(x=>x.type==='ENTITLEMENT_REQUIRED'&&x.capability==='VOLATILITY_CONTEXT'&&x.sourceId==='twelve-data-us-volatility'));
});

test('key without volatility entitlement performs zero volatility provider requests',async()=>{
  const {pipeline,calls}=makePipeline({readSecret:id=>id==='twelve-data-us-volatility'?'td-secret':null,readEntitlement:()=>false});
  const result=await pipeline.run(input());
  assert.deepEqual(calls.map(x=>x.url),[secEndpoint]);
  assert.equal(result.orchestration.published.providerDiagnostics.datasets.some(x=>x.sourceId==='twelve-data-us-volatility'),false);
  const us=result.orchestration.published.marketCoverage.markets.US;
  assert.equal(us.directionReadiness,'NOT_READY');
  assert.ok(us.missingCapabilities.includes('VOLATILITY_CONTEXT'));
});

test('key plus entitlement loads one volatility context dataset but US direction remains blocked by index and breadth',async()=>{
  const secret='td-vol-runtime-secret';
  const {pipeline,calls}=makePipeline({readSecret:id=>id==='twelve-data-us-volatility'?secret:null,readEntitlement:id=>id==='twelve-data-us-volatility'});
  const result=await pipeline.run(input());
  assert.deepEqual(calls.map(x=>x.url).sort(),[secEndpoint,volatilityEndpoint].sort());
  const call=calls.find(x=>x.url===volatilityEndpoint);
  assert.equal(call.init.headers.Authorization,`apikey ${secret}`);
  assert.doesNotMatch(call.url,new RegExp(secret));
  const read=result.orchestration.published.providerDiagnostics.datasets.find(x=>x.sourceId==='twelve-data-us-volatility');
  assert.ok(read);
  assert.equal(read.datasetId,'TWELVEDATA:VOLATILITY:US');
  assert.equal(read.subjectId,'VIX');
  assert.equal(read.status,'AVAILABLE');
  const us=result.orchestration.published.marketCoverage.markets.US;
  assert.ok(us.availableCapabilities.includes('VOLATILITY_CONTEXT'));
  assert.equal(us.missingCapabilities.includes('VOLATILITY_CONTEXT'),false);
  assert.equal(us.directionReadiness,'PARTIAL');
  assert.equal(us.coverageStatus,'BLOCKED');
  for(const cap of ['INDEX','MARKET_BREADTH'])assert.ok(us.blockers.some(x=>x.type==='LICENSE_REQUIRED'&&x.capability===cap));
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
});

test('credentialed volatility transport failure is diagnosed without fabricating volatility context',async()=>{
  const {pipeline}=makePipeline({readSecret:()=> 'td-key',readEntitlement:()=>true,volatilityFailure:true});
  const result=await pipeline.run(input());
  const read=result.orchestration.published.providerDiagnostics.datasets.find(x=>x.sourceId==='twelve-data-us-volatility');
  assert.ok(read);
  assert.equal(read.status,'UNAVAILABLE');
  assert.equal(read.reason,'FETCH_FAILED');
  const us=result.orchestration.published.marketCoverage.markets.US;
  assert.equal(us.availableCapabilities.includes('VOLATILITY_CONTEXT'),false);
  assert.ok(us.blockers.some(x=>x.type==='PROVIDER_UNAVAILABLE'&&x.capability==='VOLATILITY_CONTEXT'&&x.sourceId==='twelve-data-us-volatility'));
  assert.equal(result.orchestration.published.home.opportunities.US.length,1,'SEC research remains available');
});
