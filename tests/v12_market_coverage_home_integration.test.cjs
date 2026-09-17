'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildHomeReadModel}=require('../v12/read_model/home_snapshot.js');
const {buildMarketCoverage}=require('../v12/read_model/market_coverage.js');
const {buildHomeViewModel}=require('../v12/ui/home_view_model.js');

const NOW=Date.parse('2026-09-14T10:00:00Z');
function diagnostics(){return Object.freeze({
  schemaVersion:'foxyya-provider-diagnostics/1',asOf:NOW,status:'DEGRADED',providers:Object.freeze([]),
  datasets:Object.freeze([
    Object.freeze({sourceId:'twse-market',datasetId:'TWSE:MI_INDEX',status:'AVAILABLE',reason:null,observedAt:NOW-1000,receivedAt:NOW-500}),
    Object.freeze({sourceId:'tpex-openapi',datasetId:'TPEX:tpex_mainborad_highlight',status:'AVAILABLE',reason:null,observedAt:NOW-1000,receivedAt:NOW-500}),
    Object.freeze({sourceId:'tpex-openapi',datasetId:'TPEX:tpex_trading_volume_ratio',status:'AVAILABLE',reason:null,observedAt:NOW-1000,receivedAt:NOW-500}),
    Object.freeze({sourceId:'twse-t86',datasetId:'TWSE:T86',status:'UNAVAILABLE',reason:'HTTP_ERROR',observedAt:null,receivedAt:NOW-500})
  ]),researchOnly:true,executionWrite:false
});}
function twPulse(){return Object.freeze({status:'AVAILABLE',state:'BROAD_ADVANCE',asOf:NOW-500,data:Object.freeze({directionCoverage:'COMPLETE',industryCoverage:'COMPLETE',breadth:Object.freeze({combined:Object.freeze({advancers:700,decliners:300})}),industries:Object.freeze({twseLeaders:Object.freeze([{name:'半導體',changePct:2}]),tpexTurnoverLeaders:Object.freeze([{name:'電子',tradeWeightPct:40}])})})});}

test('Home backend publishes one authoritative marketCoverage object derived from backend evidence',()=>{
  const providerDiagnostics=diagnostics();
  const snapshot=buildHomeReadModel({asOf:NOW,pulses:Object.freeze({TW:twPulse()}),providerDiagnostics});
  assert.ok(snapshot.marketCoverage);
  assert.equal(snapshot.marketCoverage.schemaVersion,'foxyya-market-coverage/1');
  assert.equal(snapshot.marketCoverage.researchOnly,true);
  assert.equal(snapshot.marketCoverage.executionWrite,false);
  const expected=buildMarketCoverage({asOf:NOW,marketScope:['CRYPTO','US','TW'],providerDiagnostics,home:snapshot.home,cryptoExecution:null,researchPerformance:null});
  assert.deepEqual(snapshot.marketCoverage,expected);
  assert.equal(snapshot.marketCoverage.markets.TW.directionReadiness,'READY');
  assert.equal(snapshot.marketCoverage.markets.TW.researchReadiness,'NOT_READY');
});

test('Home UI view model preserves backend coverage exactly and never recomputes readiness',()=>{
  const snapshot=buildHomeReadModel({asOf:NOW,pulses:Object.freeze({TW:twPulse()}),providerDiagnostics:diagnostics()});
  const view=buildHomeViewModel(snapshot);
  assert.strictEqual(view.marketCoverage,snapshot.marketCoverage);
  assert.equal(view.marketCoverage.markets.TW.directionReadiness,'READY');
  assert.equal(view.marketCoverage.markets.TW.executionWrite,false);
});

test('Home view model remains compatible with an older read snapshot that has no marketCoverage field',()=>{
  const snapshot=buildHomeReadModel({asOf:NOW});
  const legacy=Object.freeze(Object.fromEntries(Object.entries(snapshot).filter(([key])=>key!=='marketCoverage')));
  const view=buildHomeViewModel(legacy);
  assert.equal(view.marketCoverage,null);
  assert.equal(view.researchOnly,true);
  assert.equal(view.executionWrite,false);
});
