'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {runMarketCoverageLiveProbe}=require('../v12/staging/market_coverage_live_probe.js');

function listen(handler){
  const server=http.createServer(handler);
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(server));
  });
}
function close(server){return new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}

const MARKETS=['CRYPTO','US','TW','CN_HK','JP','KR','EU'];
function marketCoverage(){
  return {
    schemaVersion:'foxyya-market-coverage/1',
    asOf:123,
    markets:Object.fromEntries(MARKETS.map(market=>[market,{
      market,
      coverageStatus:'BLOCKED',
      directionReadiness:'PARTIAL',
      researchReadiness:'READY',
      rankingEligibility:market==='TW'?'ELIGIBLE':'NOT_ELIGIBLE',
      availableCapabilities:[],
      missingCapabilities:['INDEX'],
      blockers:[{type:'LICENSE_REVIEW_REQUIRED',capability:'INDEX',sourceId:'example-source'}],
      researchOnly:true,
      executionWrite:false
    }])),
    researchOnly:true,
    executionWrite:false
  };
}

test('live coverage probe validates home coverage and preview assets through real localhost HTTP',async()=>{
  const seen=[];
  const server=await listen((req,res)=>{
    seen.push(req.url);
    if(req.url==='/v12/api/home'){
      res.setHeader('content-type','application/json');
      return res.end(JSON.stringify({schemaVersion:'foxyya-home-read-model/1',asOf:123,home:{},marketCoverage:marketCoverage(),researchOnly:true,executionWrite:false}));
    }
    if(req.url==='/v12-preview/'){
      res.setHeader('content-type','text/html; charset=utf-8');
      return res.end('<link rel="stylesheet" href="coverage.css"><script src="home_dom.js"></script><script src="market_coverage_renderer.js"></script><script src="app.js"></script>');
    }
    if(req.url==='/v12-preview/coverage.css'){
      res.setHeader('content-type','text/css; charset=utf-8');
      return res.end('.coverage-grid{display:grid}@media(max-width:820px){.coverage-grid{grid-template-columns:1fr}}');
    }
    if(req.url==='/v12-preview/market_coverage_renderer.js'){
      res.setHeader('content-type','application/javascript; charset=utf-8');
      return res.end("const MARKET_ORDER=['CRYPTO','US','TW','CN_HK','JP','KR','EU'];function ensureCoverageTarget(){};function renderMarketCoverage(){};");
    }
    res.statusCode=404;res.end('NOT_FOUND');
  });
  try{
    const result=await runMarketCoverageLiveProbe({host:'127.0.0.1',port:server.address().port,timeoutMs:2000});
    assert.equal(result.status,'PASSED');
    assert.equal(result.homeStatus,200);
    assert.equal(result.marketCount,7);
    assert.deepEqual(result.markets,MARKETS);
    assert.equal(result.previewStatus,200);
    assert.equal(result.coverageCssStatus,200);
    assert.equal(result.rendererStatus,200);
    assert.equal(result.mobileCss,true);
    assert.equal(result.researchOnly,true);
    assert.equal(result.executionWrite,false);
    assert.deepEqual(seen,['/v12/api/home','/v12-preview/','/v12-preview/coverage.css','/v12-preview/market_coverage_renderer.js']);
  }finally{await close(server);}
});

test('live coverage probe exposes deterministic per-market readiness and blocker summaries for provider expansion',async()=>{
  const server=await listen((req,res)=>{
    if(req.url==='/v12/api/home'){
      res.setHeader('content-type','application/json');
      return res.end(JSON.stringify({schemaVersion:'foxyya-home-read-model/1',asOf:123,home:{},marketCoverage:marketCoverage(),researchOnly:true,executionWrite:false}));
    }
    if(req.url==='/v12-preview/')return res.end('<link href="coverage.css"><script src="home_dom.js"></script><script src="market_coverage_renderer.js"></script><script src="app.js"></script>');
    if(req.url==='/v12-preview/coverage.css')return res.end('.coverage-grid{}@media(max-width:820px){}');
    if(req.url==='/v12-preview/market_coverage_renderer.js')return res.end("const MARKET_ORDER=['CRYPTO','US','TW','CN_HK','JP','KR','EU'];function ensureCoverageTarget(){};function renderMarketCoverage(){};");
    res.statusCode=404;res.end('NOT_FOUND');
  });
  try{
    const result=await runMarketCoverageLiveProbe({host:'127.0.0.1',port:server.address().port,timeoutMs:2000});
    assert.deepEqual(result.marketSummary.TW,{
      coverageStatus:'BLOCKED',
      directionReadiness:'PARTIAL',
      researchReadiness:'READY',
      rankingEligibility:'ELIGIBLE',
      availableCapabilities:[],
      missingCapabilities:['INDEX'],
      blockers:[{type:'LICENSE_REVIEW_REQUIRED',capability:'INDEX',sourceId:'example-source'}]
    });
    assert.deepEqual(Object.keys(result.marketSummary),MARKETS);
    assert.ok(Object.isFrozen(result.marketSummary));
    assert.ok(Object.isFrozen(result.marketSummary.TW));
  }finally{await close(server);}
});

test('live coverage probe fails closed when the seven-market coverage contract is incomplete',async()=>{
  const broken=marketCoverage();delete broken.markets.EU;
  const server=await listen((req,res)=>{
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({schemaVersion:'foxyya-home-read-model/1',asOf:123,home:{},marketCoverage:broken,researchOnly:true,executionWrite:false}));
  });
  try{
    await assert.rejects(()=>runMarketCoverageLiveProbe({host:'127.0.0.1',port:server.address().port,timeoutMs:2000}),/MARKET_COVERAGE_LIVE_PROBE_MARKETS_INVALID/);
  }finally{await close(server);}
});

test('live coverage probe rejects any coverage row that enables execution writes',async()=>{
  const broken=marketCoverage();broken.markets.TW={...broken.markets.TW,executionWrite:true};
  const server=await listen((req,res)=>{
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({schemaVersion:'foxyya-home-read-model/1',asOf:123,home:{},marketCoverage:broken,researchOnly:true,executionWrite:false}));
  });
  try{
    await assert.rejects(()=>runMarketCoverageLiveProbe({host:'127.0.0.1',port:server.address().port,timeoutMs:2000}),/MARKET_COVERAGE_LIVE_PROBE_READ_ONLY_REQUIRED/);
  }finally{await close(server);}
});
