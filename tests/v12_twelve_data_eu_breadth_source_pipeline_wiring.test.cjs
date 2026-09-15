'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');

const nowMs=Date.parse('2026-09-15T09:15:00Z');
const breadthEndpoint='https://api.twelvedata.com/quote?symbol=AAA,BBB,CCC';
function response(body,{status=200}={}){return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}};}
function breadthPayload(){return [
  {symbol:'AAA',close:'101',previous_close:'100',last_quote_at:String((nowMs-3000)/1000)},
  {symbol:'BBB',close:'99',previous_close:'100',last_quote_at:String((nowMs-2000)/1000)},
  {symbol:'CCC',close:'100',previous_close:'100',last_quote_at:String((nowMs-1000)/1000)}
];}
function input(){return {nowMs,euBreadth:{endpoint:breadthEndpoint}};}
function makePipeline({readSecret,readEntitlement,breadthFailure=false}={}){
  const calls=[];
  const service=createStagingHomeService();
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(url===breadthEndpoint){if(breadthFailure)throw Error('breadth offline');return response(breadthPayload());}
    throw Error('unexpected url '+url);
  };
  const pipeline=createStagingSourcePipeline({fetchImpl,clock:()=>nowMs,publishHome:service.publishHome,readSecret,readEntitlement});
  return {pipeline,calls};
}

test('missing EU breadth key and entitlement performs zero provider requests and keeps external blockers',async()=>{
  const {pipeline,calls}=makePipeline({readSecret:()=>null,readEntitlement:()=>false});
  const result=await pipeline.run(input());
  assert.deepEqual(calls,[]);
  const datasets=result.orchestration.published.providerDiagnostics.datasets;
  assert.equal(datasets.some(x=>x.sourceId==='twelve-data-eu-breadth'),false);
  const eu=result.orchestration.published.marketCoverage.markets.EU;
  assert.equal(eu.coverageStatus,'BLOCKED');
  assert.ok(eu.missingCapabilities.includes('MARKET_BREADTH'));
  assert.ok(eu.blockers.some(x=>x.type==='API_KEY_REQUIRED'&&x.capability==='MARKET_BREADTH'&&x.sourceId==='twelve-data-eu-breadth'));
  assert.ok(eu.blockers.some(x=>x.type==='ENTITLEMENT_REQUIRED'&&x.capability==='MARKET_BREADTH'&&x.sourceId==='twelve-data-eu-breadth'));
});

test('EU breadth key without entitlement performs zero provider requests',async()=>{
  const {pipeline,calls}=makePipeline({readSecret:id=>id==='twelve-data-eu-breadth'?'td-eu-secret':null,readEntitlement:()=>false});
  const result=await pipeline.run(input());
  assert.deepEqual(calls,[]);
  assert.equal(result.orchestration.published.providerDiagnostics.datasets.some(x=>x.sourceId==='twelve-data-eu-breadth'),false);
  assert.ok(result.orchestration.published.marketCoverage.markets.EU.missingCapabilities.includes('MARKET_BREADTH'));
});

test('EU breadth key plus entitlement loads canonical breadth but EU remains blocked by index licence',async()=>{
  const secret='td-eu-runtime-secret';
  const {pipeline,calls}=makePipeline({readSecret:id=>id==='twelve-data-eu-breadth'?secret:null,readEntitlement:id=>id==='twelve-data-eu-breadth'});
  const result=await pipeline.run(input());
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,breadthEndpoint);
  assert.equal(calls[0].init.headers.Authorization,`apikey ${secret}`);
  assert.doesNotMatch(calls[0].url,new RegExp(secret));
  const read=result.orchestration.published.providerDiagnostics.datasets.find(x=>x.sourceId==='twelve-data-eu-breadth');
  assert.ok(read);
  assert.equal(read.datasetId,'TWELVEDATA:BREADTH:EU');
  assert.equal(read.subjectId,'REGION:EU');
  assert.equal(read.status,'AVAILABLE');
  const eu=result.orchestration.published.marketCoverage.markets.EU;
  assert.ok(eu.availableCapabilities.includes('MARKET_BREADTH'));
  assert.equal(eu.missingCapabilities.includes('MARKET_BREADTH'),false);
  assert.equal(eu.directionReadiness,'PARTIAL');
  assert.equal(eu.coverageStatus,'BLOCKED');
  assert.ok(eu.blockers.some(x=>x.type==='LICENSE_REQUIRED'&&x.capability==='INDEX'&&x.sourceId==='cboe-europe-index'));
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
});

test('EU breadth transport failure is diagnosed without fabricating breadth capability',async()=>{
  const {pipeline}=makePipeline({readSecret:()=> 'td-key',readEntitlement:()=>true,breadthFailure:true});
  const result=await pipeline.run(input());
  const read=result.orchestration.published.providerDiagnostics.datasets.find(x=>x.sourceId==='twelve-data-eu-breadth');
  assert.ok(read);
  assert.equal(read.status,'UNAVAILABLE');
  assert.equal(read.reason,'FETCH_FAILED');
  const eu=result.orchestration.published.marketCoverage.markets.EU;
  assert.equal(eu.availableCapabilities.includes('MARKET_BREADTH'),false);
  assert.ok(eu.blockers.some(x=>x.type==='PROVIDER_UNAVAILABLE'&&x.capability==='MARKET_BREADTH'&&x.sourceId==='twelve-data-eu-breadth'));
});
