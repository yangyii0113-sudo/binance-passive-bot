'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {SOURCE_STATUS,SOURCE_CATALOG}=require('../v12/providers/source_catalog.js');
const {buildMarketCoverage}=require('../v12/read_model/market_coverage.js');

const NOW=Date.parse('2026-09-15T08:00:00Z');

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

test('CN_HK catalog resolves historical price, index and breadth into explicit licensed/product sources',()=>{
  assert.equal(SOURCE_CATALOG.some(x=>x.id==='hkex-marketplace'),false,'generic HKEX marketplace source must be replaced by capability-specific sources');

  const history=SOURCE_CATALOG.find(x=>x.id==='hkex-eod-summary');
  assert.ok(history);
  assert.equal(history.provider,'HKEX Data Marketplace End of Day / End of Session Summary');
  assert.equal(history.status,SOURCE_STATUS.REVIEW_REQUIRED);
  assert.equal(history.accessClass,'PRODUCT_DEPENDENT');
  assert.deepEqual(history.markets,['CN_HK']);
  assert.ok(history.capabilities.includes('HISTORICAL_DATA'));
  assert.equal(history.liveEligible,false);
  assert.equal(history.marketScope,'HKEX_MAIN_BOARD_GEM');

  const index=SOURCE_CATALOG.find(x=>x.id==='hkex-omd-index');
  assert.ok(index);
  assert.equal(index.provider,'HKEX OMD Index Datafeed');
  assert.equal(index.status,SOURCE_STATUS.LICENSE_REQUIRED);
  assert.ok(index.capabilities.includes('INDEX'));
  assert.equal(index.liveEligible,false);
  assert.equal(index.evidenceRole,'MARKET_CORE');

  const sse=SOURCE_CATALOG.find(x=>x.id==='sse-market-data');
  const szse=SOURCE_CATALOG.find(x=>x.id==='szse-ssic-market-data');
  for(const source of [sse,szse]){
    assert.ok(source);
    assert.equal(source.status,SOURCE_STATUS.REVIEW_REQUIRED);
    assert.equal(source.accessClass,'PRODUCT_DEPENDENT');
    assert.ok(source.capabilities.includes('INDEX'));
    assert.ok(source.capabilities.includes('MARKET_BREADTH'));
    assert.equal(source.liveEligible,false);
    assert.equal(source.evidenceRole,'MARKET_CORE');
  }
});

test('CN_HK remains BLOCKED but replaces NOT_IMPLEMENTED direction gaps with external license/data-product blockers',()=>{
  const row=buildMarketCoverage({
    asOf:NOW,
    sourceCatalog:SOURCE_CATALOG,
    providerDiagnostics:diagnostics(),
    home:emptyHome(),
    cryptoExecution:null,
    researchPerformance:null
  }).markets.CN_HK;

  assert.equal(row.coverageStatus,'BLOCKED');
  assert.equal(row.directionReadiness,'NOT_READY');
  assert.equal(row.researchReadiness,'NOT_READY');
  assert.equal(row.rankingEligibility,'NOT_ELIGIBLE');
  assert.deepEqual(row.missingCapabilities,['HISTORICAL_PRICE','INDEX','MARKET_BREADTH']);

  assert.ok(row.blockers.some(x=>x.type==='DATA_PRODUCT_REQUIRED'&&x.capability==='HISTORICAL_PRICE'&&x.sourceId==='hkex-eod-summary'));
  assert.ok(row.blockers.some(x=>x.type==='LICENSE_REVIEW_REQUIRED'&&x.capability==='HISTORICAL_PRICE'&&x.sourceId==='hkex-eod-summary'));
  assert.ok(row.blockers.some(x=>x.type==='LICENSE_REQUIRED'&&x.capability==='INDEX'&&x.sourceId==='hkex-omd-index'));
  assert.ok(row.blockers.some(x=>x.type==='DATA_PRODUCT_REQUIRED'&&x.capability==='MARKET_BREADTH'&&x.sourceId==='sse-market-data'));
  assert.ok(row.blockers.some(x=>x.type==='DATA_PRODUCT_REQUIRED'&&x.capability==='MARKET_BREADTH'&&x.sourceId==='szse-ssic-market-data'));
  assert.equal(row.blockers.some(x=>x.type==='NOT_IMPLEMENTED'&&['HISTORICAL_PRICE','INDEX','MARKET_BREADTH'].includes(x.capability)),false);
  assert.equal(row.activationState,'BLOCKED');
});
