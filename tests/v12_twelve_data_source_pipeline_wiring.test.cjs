'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');

const nowMs=Date.parse('2026-09-09T06:30:00Z');
const secEndpoint='https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json';
const quoteEndpoint='https://api.twelvedata.com/quote?symbol=NVDA';
const instrument=Object.freeze({instrumentId:'NASDAQ:NVDA',exchange:'NASDAQ',symbol:'NVDA',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'});

function response(body,{status=200}={}){return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}};}
function secPayload(){return {cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}};}
function quotePayload(){const observedAt=nowMs-5000;return {symbol:'NVDA',name:'NVIDIA Corp',exchange:'NASDAQ',mic_code:'XNAS',currency:'USD',datetime:'2026-09-09 02:29:55',timestamp:Math.floor(observedAt/1000),last_quote_at:Math.floor(observedAt/1000),open:'180.10',high:'181.40',low:'179.80',close:'181.20',volume:'41238500',previous_close:'179.90',change:'1.30',percent_change:'0.72262',average_volume:'39000000',is_market_open:true};}
function input(){return {nowMs,usAssets:[{instrument,sec:{endpoint:secEndpoint,taxonomy:'us-gaap',concept:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD'},quote:{endpoint:quoteEndpoint},researchEvidence:[],earlyEvidence:[]}]};}
function makePipeline({readSecret,quoteFailure=false}={}){
  const calls=[];
  const service=createStagingHomeService();
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(url===secEndpoint)return response(secPayload());
    if(url===quoteEndpoint){if(quoteFailure)throw Error('quote offline');return response(quotePayload());}
    throw Error('unexpected url '+url);
  };
  const pipeline=createStagingSourcePipeline({fetchImpl,clock:()=>nowMs,publishHome:service.publishHome,readSecret});
  return {pipeline,calls};
}

test('missing Twelve Data key skips quote binding and network while Coverage stays API-key blocked',async()=>{
  const {pipeline,calls}=makePipeline({readSecret:()=>null});
  const result=await pipeline.run(input());
  assert.deepEqual(calls.map(x=>x.url),[secEndpoint]);
  const datasets=result.orchestration.published.providerDiagnostics.datasets;
  assert.equal(datasets.some(x=>x.sourceId==='twelve-data-us-quote'),false,'missing credentials must not be misreported as a provider runtime failure');
  const us=result.orchestration.published.marketCoverage.markets.US;
  assert.equal(us.coverageStatus,'BLOCKED');
  assert.equal(us.directionReadiness,'NOT_READY');
  assert.equal(us.researchReadiness,'PARTIAL');
  assert.ok(us.missingCapabilities.includes('QUOTE'));
  assert.ok(us.blockers.some(x=>x.type==='API_KEY_REQUIRED'&&x.capability==='QUOTE'&&x.sourceId==='twelve-data-us-quote'));
});

test('injected Twelve Data key loads one limited-venue quote and grants QUOTE without granting US direction readiness',async()=>{
  const secret='td-runtime-secret';
  const {pipeline,calls}=makePipeline({readSecret:sourceId=>sourceId==='twelve-data-us-quote'?secret:null});
  const result=await pipeline.run(input());
  assert.deepEqual(calls.map(x=>x.url).sort(),[quoteEndpoint,secEndpoint].sort());
  const quoteCall=calls.find(x=>x.url===quoteEndpoint);
  assert.equal(quoteCall.init.headers.Authorization,`apikey ${secret}`);
  assert.doesNotMatch(quoteCall.url,new RegExp(secret));

  const datasets=result.orchestration.published.providerDiagnostics.datasets;
  const quoteRead=datasets.find(x=>x.sourceId==='twelve-data-us-quote');
  assert.ok(quoteRead);
  assert.equal(quoteRead.datasetId,'TWELVEDATA:QUOTE:US_DEFAULT');
  assert.equal(quoteRead.subjectId,'NASDAQ:NVDA');
  assert.equal(quoteRead.status,'AVAILABLE');

  const us=result.orchestration.published.marketCoverage.markets.US;
  assert.ok(us.availableCapabilities.includes('QUOTE'));
  assert.equal(us.researchReadiness,'READY');
  assert.equal(us.rankingEligibility,'ELIGIBLE');
  assert.equal(us.directionReadiness,'NOT_READY');
  assert.equal(us.coverageStatus,'BLOCKED');
  for(const cap of ['INDEX','MARKET_BREADTH'])assert.ok(us.blockers.some(x=>x.type==='LICENSE_REQUIRED'&&x.capability===cap));
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
});

test('credentialed quote provider failure does not remove SEC research or make US direction ready',async()=>{
  const {pipeline}=makePipeline({readSecret:()=> 'td-key',quoteFailure:true});
  const result=await pipeline.run(input());
  assert.equal(result.orchestration.published.home.opportunities.US.length,1,'SEC research remains publishable when quote provider fails');
  const quoteRead=result.orchestration.published.providerDiagnostics.datasets.find(x=>x.sourceId==='twelve-data-us-quote');
  assert.ok(quoteRead);
  assert.equal(quoteRead.status,'UNAVAILABLE');
  assert.equal(quoteRead.reason,'FETCH_FAILED');
  const us=result.orchestration.published.marketCoverage.markets.US;
  assert.equal(us.researchReadiness,'PARTIAL');
  assert.equal(us.directionReadiness,'NOT_READY');
  assert.ok(us.blockers.some(x=>x.type==='PROVIDER_UNAVAILABLE'&&x.capability==='QUOTE'));
});
