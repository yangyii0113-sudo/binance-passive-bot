'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SOURCE_CATALOG,SOURCE_STATUS}=require('../v12/providers/source_catalog.js');
const {buildMarketCoverage}=require('../v12/read_model/market_coverage.js');

const NOW=Date.parse('2026-09-15T02:00:00Z');
function home(){return Object.freeze({schema:'foxyya-home-model/1',asOf:NOW,regions:Object.freeze(['US','TW','CN_HK','JP','KR','EU','CRYPTO'].map(region=>Object.freeze({region,status:region==='US'?'AVAILABLE':'UNAVAILABLE',bias:'UNAVAILABLE',asOf:NOW,facts:region==='US'?Object.freeze([{field:'fundamental.sec.us-gaap.Revenue',value:1}]):Object.freeze([])}))),marketPulse:Object.freeze([{market:'CRYPTO',status:'UNAVAILABLE',asOf:NOW,data:null},{market:'US',status:'UNAVAILABLE',asOf:NOW,data:null},{market:'TW',status:'UNAVAILABLE',asOf:NOW,data:null}]),opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([{market:'US',instrumentId:'NASDAQ:NVDA',researchOnly:true,executionWrite:false}]),TW:Object.freeze([])}),events:Object.freeze([]),todayFocus:Object.freeze([]),earlyTrend:Object.freeze([])});}
function diagnostics(){return Object.freeze({schemaVersion:'foxyya-provider-diagnostics/1',asOf:NOW,status:'AVAILABLE',providers:Object.freeze([]),datasets:Object.freeze([{sourceId:'sec-edgar',datasetId:'SEC:companyfacts',status:'AVAILABLE',reason:null,observedAt:NOW-1000,receivedAt:NOW-500}]),researchOnly:true,executionWrite:false});}

test('US volatility provider decision selects Twelve Data index context behind credential and entitlement verification',()=>{
  const selected=SOURCE_CATALOG.find(x=>x.id==='twelve-data-us-volatility');
  assert.ok(selected);
  assert.equal(selected.provider,'Twelve Data Global Indices API');
  assert.equal(selected.status,SOURCE_STATUS.KEY_REQUIRED);
  assert.equal(selected.authority,'LICENSED');
  assert.equal(selected.accessClass,'API_KEY');
  assert.equal(selected.secretRequired,true);
  assert.equal(selected.entitlementRequired,true);
  assert.equal(selected.serverOnly,true);
  assert.equal(selected.liveEligible,false,'exact VIX-like symbol and plan entitlement must be verified before live activation');
  assert.ok(selected.capabilities.includes('VOLATILITY_INDEX'));
  assert.deepEqual(selected.markets,['US']);
  assert.equal(selected.evidenceRole,'MARKET_CONTEXT');
  assert.equal(selected.externalDistribution,false);
  assert.equal(SOURCE_CATALOG.some(x=>x.id==='us-options-analytics'),false,'generic unresolved options analytics source must no longer own the minimal VOLATILITY_CONTEXT requirement');
});

test('without verified Twelve Data volatility access US stays blocked by key plus entitlement and never gains direction readiness',()=>{
  const row=buildMarketCoverage({asOf:NOW,sourceCatalog:SOURCE_CATALOG,providerDiagnostics:diagnostics(),home:home(),cryptoExecution:null,researchPerformance:null}).markets.US;
  assert.equal(row.coverageStatus,'BLOCKED');
  assert.equal(row.directionReadiness,'NOT_READY');
  assert.ok(row.missingCapabilities.includes('VOLATILITY_CONTEXT'));
  assert.ok(row.blockers.some(x=>x.type==='API_KEY_REQUIRED'&&x.capability==='VOLATILITY_CONTEXT'&&x.sourceId==='twelve-data-us-volatility'));
  assert.ok(row.blockers.some(x=>x.type==='ENTITLEMENT_REQUIRED'&&x.capability==='VOLATILITY_CONTEXT'&&x.sourceId==='twelve-data-us-volatility'));
  assert.equal(row.blockers.some(x=>x.type==='PROVIDER_DECISION_REQUIRED'&&x.capability==='VOLATILITY_CONTEXT'),false);
  assert.equal(row.availableCapabilities.includes('VOLATILITY_CONTEXT'),false);
});
