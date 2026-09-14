'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SOURCE_CATALOG,SOURCE_STATUS}=require('../v12/providers/source_catalog.js');
const {buildMarketCoverage}=require('../v12/read_model/market_coverage.js');

const NOW=Date.parse('2026-09-14T14:00:00Z');
function home(){return Object.freeze({schema:'foxyya-home-model/1',asOf:NOW,regions:Object.freeze(['US','TW','CN_HK','JP','KR','EU','CRYPTO'].map(region=>Object.freeze({region,status:region==='US'?'AVAILABLE':'UNAVAILABLE',bias:'UNAVAILABLE',asOf:NOW,facts:region==='US'?Object.freeze([{field:'fundamental.sec.us-gaap.Revenue',value:1}]):Object.freeze([])}))),marketPulse:Object.freeze([{market:'CRYPTO',status:'UNAVAILABLE',asOf:NOW,data:null},{market:'US',status:'UNAVAILABLE',asOf:NOW,data:null},{market:'TW',status:'UNAVAILABLE',asOf:NOW,data:null}]),opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([{market:'US',instrumentId:'NASDAQ:NVDA',researchOnly:true,executionWrite:false}]),TW:Object.freeze([])}),events:Object.freeze([]),todayFocus:Object.freeze([]),earlyTrend:Object.freeze([])});}
function diagnostics(){return Object.freeze({schemaVersion:'foxyya-provider-diagnostics/1',asOf:NOW,status:'AVAILABLE',providers:Object.freeze([]),datasets:Object.freeze([{sourceId:'sec-edgar',datasetId:'SEC:companyfacts',status:'AVAILABLE',reason:null,observedAt:NOW-1000,receivedAt:NOW-500}]),researchOnly:true,executionWrite:false});}

test('US quote provider decision selects Twelve Data as credential-gated limited-venue research source',()=>{
 const selected=SOURCE_CATALOG.find(x=>x.id==='twelve-data-us-quote');
 assert.ok(selected);
 assert.equal(selected.provider,'Twelve Data US Equities Default Feed');
 assert.equal(selected.status,SOURCE_STATUS.KEY_REQUIRED);
 assert.equal(selected.authority,'LICENSED');
 assert.equal(selected.accessClass,'API_KEY');
 assert.equal(selected.secretRequired,true);
 assert.equal(selected.entitlementRequired,false);
 assert.equal(selected.serverOnly,true);
 assert.equal(selected.liveEligible,true);
 assert.ok(selected.capabilities.includes('QUOTE'));
 assert.deepEqual(selected.markets,['US']);
 assert.equal(selected.marketScope,'LIMITED_US_VENUES');
 assert.equal(selected.consolidated,false);
 assert.equal(selected.nbbo,false);
 assert.equal(SOURCE_CATALOG.some(x=>x.id==='us-equity-realtime'),false,'generic unresolved US quote source must be replaced after provider selection');
});

test('without Twelve Data key US quote stays blocked by API_KEY_REQUIRED and never grants direction readiness',()=>{
 const row=buildMarketCoverage({asOf:NOW,sourceCatalog:SOURCE_CATALOG,providerDiagnostics:diagnostics(),home:home(),cryptoExecution:null,researchPerformance:null}).markets.US;
 assert.equal(row.coverageStatus,'BLOCKED');
 assert.equal(row.directionReadiness,'NOT_READY');
 assert.equal(row.researchReadiness,'PARTIAL');
 assert.equal(row.rankingEligibility,'LIMITED');
 assert.ok(row.missingCapabilities.includes('QUOTE'));
 assert.ok(row.blockers.some(x=>x.type==='API_KEY_REQUIRED'&&x.capability==='QUOTE'&&x.sourceId==='twelve-data-us-quote'));
 assert.equal(row.blockers.some(x=>x.type==='PROVIDER_DECISION_REQUIRED'&&x.capability==='QUOTE'),false);
 for(const cap of ['INDEX','MARKET_BREADTH'])assert.ok(row.blockers.some(x=>x.type==='LICENSE_REQUIRED'&&x.capability===cap&&x.sourceId==='nasdaq-trader-daily'));
});
