'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {SOURCE_STATUS,SOURCE_CATALOG}=require('../v12/providers/source_catalog.js');
const {buildMarketCoverage}=require('../v12/read_model/market_coverage.js');

const NOW=Date.parse('2026-09-15T04:00:00Z');

function homeWithEuMacro(){
  return Object.freeze({
    schema:'foxyya-home-model/1',asOf:NOW,
    regions:Object.freeze(['US','TW','CN_HK','JP','KR','EU','CRYPTO'].map(region=>Object.freeze({
      region,
      status:region==='EU'?'AVAILABLE':'UNAVAILABLE',
      bias:region==='EU'?'NEUTRAL':'UNAVAILABLE',
      asOf:NOW-1000,
      facts:region==='EU'?Object.freeze([{field:'inflation.hicp_yoy',value:1.9}]):Object.freeze([])
    }))),
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
  return Object.freeze({
    schemaVersion:'foxyya-provider-diagnostics/1',
    asOf:NOW,status:'AVAILABLE',providers:Object.freeze([]),
    datasets:Object.freeze([
      Object.freeze({sourceId:'ecb-data',datasetId:'ECB:ICP.M.U2.N.000000.4.ANR',status:'AVAILABLE',reason:null,observedAt:NOW-60_000,receivedAt:NOW-30_000})
    ]),
    researchOnly:true,executionWrite:false
  });
}

test('EU provider catalog splits pan-European index licensing from credentialed breadth entitlement',()=>{
  assert.equal(SOURCE_CATALOG.some(x=>x.id==='eu-equity-realtime'),false,'generic unresolved EU equity source must be retired after provider selection');

  const index=SOURCE_CATALOG.find(x=>x.id==='cboe-europe-index');
  assert.ok(index);
  assert.equal(index.provider,'Cboe Europe Indices / Cboe Global Indices Feed');
  assert.equal(index.status,SOURCE_STATUS.LICENSE_REQUIRED);
  assert.deepEqual(index.markets,['EU']);
  assert.ok(index.capabilities.includes('INDEX'));
  assert.equal(index.secretRequired,false);
  assert.equal(index.entitlementRequired,false);
  assert.equal(index.liveEligible,false);
  assert.equal(index.evidenceRole,'MARKET_CORE');

  const breadth=SOURCE_CATALOG.find(x=>x.id==='twelve-data-eu-breadth');
  assert.ok(breadth);
  assert.equal(breadth.provider,'Twelve Data × Cboe Europe Equities');
  assert.equal(breadth.status,SOURCE_STATUS.KEY_REQUIRED);
  assert.deepEqual(breadth.markets,['EU']);
  assert.ok(breadth.capabilities.includes('MARKET_BREADTH'));
  assert.equal(breadth.secretRequired,true);
  assert.equal(breadth.entitlementRequired,true);
  assert.equal(breadth.serverOnly,true);
  assert.equal(breadth.liveEligible,false);
  assert.equal(breadth.marketScope,'PAN_EUROPE_CBOE_EQUITIES');
});

test('EU macro remains PARTIAL/BLOCKED with actionable index license and breadth credential blockers',()=>{
  const row=buildMarketCoverage({
    asOf:NOW,
    sourceCatalog:SOURCE_CATALOG,
    providerDiagnostics:diagnostics(),
    home:homeWithEuMacro(),
    cryptoExecution:null,
    researchPerformance:null
  }).markets.EU;

  assert.equal(row.coverageStatus,'BLOCKED');
  assert.equal(row.directionReadiness,'PARTIAL');
  assert.equal(row.researchReadiness,'NOT_READY');
  assert.equal(row.rankingEligibility,'NOT_ELIGIBLE');
  assert.ok(row.availableCapabilities.includes('MACRO'));
  assert.deepEqual(row.missingCapabilities,['INDEX','MARKET_BREADTH']);

  const indexBlocker=row.blockers.find(x=>x.type==='LICENSE_REQUIRED'&&x.capability==='INDEX'&&x.sourceId==='cboe-europe-index');
  assert.ok(indexBlocker,'EU index must remain fail-closed until a Cboe index-data license is obtained');
  assert.equal(indexBlocker.externalActionRequired,true);

  const keyBlocker=row.blockers.find(x=>x.type==='API_KEY_REQUIRED'&&x.capability==='MARKET_BREADTH'&&x.sourceId==='twelve-data-eu-breadth');
  const entitlementBlocker=row.blockers.find(x=>x.type==='ENTITLEMENT_REQUIRED'&&x.capability==='MARKET_BREADTH'&&x.sourceId==='twelve-data-eu-breadth');
  assert.ok(keyBlocker,'EU breadth must require a server-side Twelve Data API key');
  assert.ok(entitlementBlocker,'EU breadth must require the Cboe Europe entitlement');
  assert.equal(keyBlocker.externalActionRequired,true);
  assert.equal(entitlementBlocker.externalActionRequired,true);

  assert.equal(row.blockers.some(x=>x.type==='PROVIDER_DECISION_REQUIRED'&&x.capability==='MARKET_BREADTH'),false);
  assert.equal(row.directionReadiness==='READY',false);
});
