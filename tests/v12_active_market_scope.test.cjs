'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildHomeReadModel}=require('../v12/read_model/home_snapshot.js');
const {buildBootstrapInput}=require('../v12/staging/live_research_bootstrap.js');
const Renderer=require('../v12/ui/market_coverage_renderer.js');
const {buildHomeViewModel}=require('../v12/ui/home_view_model.js');
const {buildMarketCoverage}=require('../v12/read_model/market_coverage.js');
const deferred=['JP','CN_HK','EU'];

test('current Home API and UI omit deferred regions even with historical coverage input',()=>{
  const read=buildHomeReadModel({asOf:1000});
  assert.deepEqual(read.home.regions.map(x=>x.region),['US','TW','KR','CRYPTO']);
  assert.deepEqual(Object.keys(read.marketCoverage.markets),['CRYPTO','US','TW','KR']);
  const historical=buildMarketCoverage({asOf:1000});
  for(const market of deferred)assert.ok(historical.markets[market]);
  const vm=buildHomeViewModel({...read,marketCoverage:historical});
  const rendered=Renderer.renderHomeSections(vm);
  const initial=fs.readFileSync(path.join(__dirname,'../v12/ui/index.html'),'utf8');
  for(const market of deferred){
    assert.doesNotMatch(rendered.coverageHtml,new RegExp(`data-coverage-market="${market}"`));
    assert.doesNotMatch(rendered.regionsHtml+initial,new RegExp(`data-region="${market}"`));
  }
  assert.equal(read.executionWrite,false);
});

test('default scheduled bootstrap does not request deferred regional providers',()=>{
  const input=buildBootstrapInput(Date.parse('2026-09-15T10:00:00Z'));
  for(const market of deferred)assert.equal(input.regions[market],undefined);
  assert.doesNotMatch(JSON.stringify(input),/data-api\.ecb\.europa\.eu/);
  assert.ok(input.regions.US.bls.length);
  assert.ok(input.twAssets.length);
});
