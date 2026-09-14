'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {runMarketCoverageLiveProbe}=require('../v12/staging/market_coverage_live_probe.js');

const MARKETS=['CRYPTO','US','TW','CN_HK','JP','KR','EU'];
function listen(handler){const server=http.createServer(handler);return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server));});}
function close(server){return new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
function row(market){return {market,coverageStatus:market==='US'?'BLOCKED':'UNAVAILABLE',directionReadiness:'NOT_READY',researchReadiness:market==='US'?'PARTIAL':'NOT_READY',rankingEligibility:market==='US'?'LIMITED':'NOT_ELIGIBLE',availableCapabilities:market==='US'?['FUNDAMENTAL','FUTURES_POSITIONING','MACRO']:[],missingCapabilities:market==='US'?['INDEX','MARKET_BREADTH','QUOTE','VOLATILITY_CONTEXT']:[],blockers:[],researchOnly:true,executionWrite:false};}

function home(){return {
  schemaVersion:'foxyya-home-read-model/1',asOf:123,home:{},
  providerDiagnostics:{datasets:[{
    sourceId:'cftc-cot',datasetId:'CFTC:TFF:gpe5-46if:EQUITY_INDEX',subjectId:'REGION:US',status:'AVAILABLE',reason:null,observedAt:100,receivedAt:123
  }]},
  marketCoverage:{schemaVersion:'foxyya-market-coverage/1',asOf:123,markets:Object.fromEntries(MARKETS.map(m=>[m,row(m)])),researchOnly:true,executionWrite:false},
  researchOnly:true,executionWrite:false
};}

test('live coverage probe exposes available capabilities and CFTC dataset status for runtime verification',async()=>{
  const server=await listen((req,res)=>{
    if(req.url==='/v12/api/home'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(home()));}
    if(req.url==='/v12-preview/')return res.end('<link href="coverage.css"><script src="home_dom.js"></script><script src="market_coverage_renderer.js"></script><script src="app.js"></script>');
    if(req.url==='/v12-preview/coverage.css')return res.end('.coverage-grid{}@media(max-width:820px){}');
    if(req.url==='/v12-preview/market_coverage_renderer.js')return res.end("const MARKET_ORDER=['CRYPTO','US','TW','CN_HK','JP','KR','EU'];function ensureCoverageTarget(){};function renderMarketCoverage(){};");
    res.statusCode=404;res.end('NOT_FOUND');
  });
  try{
    const result=await runMarketCoverageLiveProbe({host:'127.0.0.1',port:server.address().port,timeoutMs:2000});
    assert.ok(result.marketSummary.US.availableCapabilities.includes('FUTURES_POSITIONING'));
    assert.deepEqual(result.providerSummary.cftc,{status:'AVAILABLE',reason:null,observedAt:100,receivedAt:123});
    assert.equal(result.researchOnly,true);
    assert.equal(result.executionWrite,false);
  }finally{await close(server);}
});
