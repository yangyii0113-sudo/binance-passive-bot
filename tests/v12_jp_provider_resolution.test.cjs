'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {SOURCE_STATUS,SOURCE_CATALOG}=require('../v12/providers/source_catalog.js');
const {buildMarketCoverage}=require('../v12/read_model/market_coverage.js');

const NOW=Date.parse('2026-09-15T08:15:00Z');

function emptyHome(){
  return Object.freeze({
    schema:'foxyya-home-model/1',asOf:NOW,
    regions:Object.freeze(['US','TW','CN_HK','JP','KR','EU','CRYPTO'].map(region=>Object.freeze({region,status:'UNAVAILABLE',bias:'UNAVAILABLE',asOf:NOW,facts:Object.freeze([])}))),
    marketPulse:Object.freeze([
      Object.freeze({market:'CRYPTO',status:'UNAVAILABLE',asOf:NOW,data:null}),
      Object.freeze({market:'US',status:'UNAVAILABLE',asOf:NOW,data:null}),
      Object.freeze({market:'TW',status:'UNAVAILABLE',asOf:NOW,data:null})
    ]),
    opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([])}),
    events:Object.freeze([]),todayFocus:Object.freeze([]),earlyTrend:Object.freeze([])
  });
}

function diagnostics(){
  return Object.freeze({schemaVersion:'foxyya-provider-diagnostics/1',asOf:NOW,status:'UNAVAILABLE',providers:Object.freeze([]),datasets:Object.freeze([]),researchOnly:true,executionWrite:false});
}

test('JP direction resolves to licensed TSE Market Information while J-Quants remains the research source',()=>{
  const tse=SOURCE_CATALOG.find(x=>x.id==='tse-market-information');
  assert.ok(tse);
  assert.equal(tse.provider,'Tokyo Stock Exchange Market Information');
  assert.equal(tse.status,SOURCE_STATUS.LICENSE_REQUIRED);
  assert.deepEqual(tse.markets,['JP']);
  assert.ok(tse.capabilities.includes('INDEX'));
  assert.ok(tse.capabilities.includes('MARKET_BREADTH'));
  assert.equal(tse.liveEligible,false);
  assert.equal(tse.evidenceRole,'MARKET_CORE');
  assert.equal(tse.marketScope,'TSE_MARKET_DIRECTION');

  const jq=SOURCE_CATALOG.find(x=>x.id==='jpx-jquants');
  assert.ok(jq);
  assert.equal(jq.status,SOURCE_STATUS.KEY_REQUIRED);
  assert.equal(jq.secretRequired,true);
  assert.equal(jq.entitlementRequired,true);
  assert.ok(jq.capabilities.includes('HISTORICAL_PRICE'));
  assert.ok(jq.capabilities.includes('FINANCIALS'));
});

test('JP stays BLOCKED and replaces NOT_IMPLEMENTED direction gaps with TSE licence blockers',()=>{
  const row=buildMarketCoverage({
    asOf:NOW,
    sourceCatalog:SOURCE_CATALOG,
    providerDiagnostics:diagnostics(),
    home:emptyHome(),
    cryptoExecution:null,
    researchPerformance:null
  }).markets.JP;

  assert.equal(row.coverageStatus,'BLOCKED');
  assert.equal(row.directionReadiness,'NOT_READY');
  assert.equal(row.researchReadiness,'NOT_READY');
  assert.equal(row.rankingEligibility,'NOT_ELIGIBLE');
  assert.deepEqual(row.missingCapabilities,['FUNDAMENTAL','HISTORICAL_PRICE','INDEX','MARKET_BREADTH']);
  assert.ok(row.blockers.some(x=>x.type==='LICENSE_REQUIRED'&&x.capability==='INDEX'&&x.sourceId==='tse-market-information'));
  assert.ok(row.blockers.some(x=>x.type==='LICENSE_REQUIRED'&&x.capability==='MARKET_BREADTH'&&x.sourceId==='tse-market-information'));
  assert.ok(row.blockers.some(x=>x.type==='API_KEY_REQUIRED'&&x.capability==='HISTORICAL_PRICE'&&x.sourceId==='jpx-jquants'));
  assert.ok(row.blockers.some(x=>x.type==='ENTITLEMENT_REQUIRED'&&x.capability==='HISTORICAL_PRICE'&&x.sourceId==='jpx-jquants'));
  assert.ok(row.blockers.some(x=>x.type==='API_KEY_REQUIRED'&&x.capability==='FUNDAMENTAL'&&x.sourceId==='jpx-jquants'));
  assert.ok(row.blockers.some(x=>x.type==='ENTITLEMENT_REQUIRED'&&x.capability==='FUNDAMENTAL'&&x.sourceId==='jpx-jquants'));
  assert.equal(row.blockers.some(x=>x.type==='NOT_IMPLEMENTED'&&['INDEX','MARKET_BREADTH'].includes(x.capability)),false);
  assert.equal(row.activationState,'BLOCKED');
});
