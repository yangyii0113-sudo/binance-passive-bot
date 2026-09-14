'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {SOURCE_CATALOG}=require('../v12/providers/source_catalog.js');
const {buildMarketCoverage}=require('../v12/read_model/market_coverage.js');

const NOW=Date.parse('2026-09-14T09:30:00Z');

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
function diagnostics(datasets=[]){
  return Object.freeze({schemaVersion:'foxyya-provider-diagnostics/1',asOf:NOW,status:datasets.length?'AVAILABLE':'UNAVAILABLE',providers:Object.freeze([]),datasets:Object.freeze(datasets),researchOnly:true,executionWrite:false});
}
function availableDataset(sourceId,datasetId,observedAt=NOW-60_000){return Object.freeze({sourceId,datasetId,status:'AVAILABLE',reason:null,observedAt,receivedAt:NOW-30_000});}
function unavailableDataset(sourceId,datasetId,reason='SOURCE_UNAVAILABLE'){return Object.freeze({sourceId,datasetId,status:'UNAVAILABLE',reason,observedAt:null,receivedAt:NOW-30_000});}
function baseInput(overrides={}){return {asOf:NOW,sourceCatalog:SOURCE_CATALOG,providerDiagnostics:diagnostics(),home:emptyHome(),cryptoExecution:null,researchPerformance:null,...overrides};}
function pulse(home,market,value){return Object.freeze({...home,marketPulse:Object.freeze(home.marketPulse.map(row=>row.market===market?Object.freeze({market,...value}):row))});}
function opportunities(home,market,rows){return Object.freeze({...home,opportunities:Object.freeze({...home.opportunities,[market]:Object.freeze(rows)})});}
function region(home,market,value){return Object.freeze({...home,regions:Object.freeze(home.regions.map(row=>row.region===market?Object.freeze({region:market,...value}):row))});}

function cryptoExecution(){return Object.freeze({schema:'foxyya-v12-crypto-execution-read/1',asOf:NOW-10_000,readOnly:true,paperOnly:true,realOrderLock:true,candidates:Object.freeze([{symbol:'BTCUSDT'}]),pending:Object.freeze([]),openPositions:Object.freeze([]),closedTrades:Object.freeze([])});}

test('coverage always returns exactly seven immutable research-only market records',()=>{
  const result=buildMarketCoverage(baseInput());
  assert.equal(result.schemaVersion,'foxyya-market-coverage/1');
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
  assert.deepEqual(Object.keys(result.markets),['CRYPTO','US','TW','CN_HK','JP','KR','EU']);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.markets));
  for(const [market,row] of Object.entries(result.markets)){
    assert.equal(row.market,market);
    assert.equal(row.researchOnly,true);
    assert.equal(row.executionWrite,false);
    assert.ok(['READY','PARTIAL','BLOCKED','UNAVAILABLE'].includes(row.coverageStatus));
    assert.ok(Object.isFrozen(row));
    assert.ok(Object.isFrozen(row.availableCapabilities));
    assert.ok(Object.isFrozen(row.missingCapabilities));
    assert.ok(Object.isFrozen(row.blockers));
  }
});

test('Crypto is READY only from live read-only execution, candidate universe and available regime; equity ranking stays ineligible',()=>{
  let home=emptyHome();
  home=pulse(home,'CRYPTO',{status:'AVAILABLE',state:'RISK_ON',asOf:NOW-10_000,data:Object.freeze({candidateCount:1,regimeStatus:'AVAILABLE',regimeState:'RISK_ON'})});
  home=opportunities(home,'CRYPTO',[Object.freeze({market:'CRYPTO',symbol:'BTCUSDT'})]);
  const row=buildMarketCoverage(baseInput({home,cryptoExecution:cryptoExecution()})).markets.CRYPTO;
  assert.equal(row.coverageStatus,'READY');
  assert.equal(row.directionReadiness,'READY');
  assert.equal(row.rankingEligibility,'NOT_ELIGIBLE');
  for(const cap of ['REGIME_CLASSIFICATION','EXECUTION_RUNTIME_READ','CANDIDATE_UNIVERSE'])assert.ok(row.availableCapabilities.includes(cap));
  assert.equal(row.executionWrite,false);
});

test('TW individual research cannot substitute for market breadth or sector rotation',()=>{
  let home=emptyHome();
  home=opportunities(home,'TW',[Object.freeze({market:'TW',instrumentId:'TWSE:2330',researchOnly:true,executionWrite:false})]);
  const row=buildMarketCoverage(baseInput({home,providerDiagnostics:diagnostics([
    availableDataset('twse-openapi','TWSE:STOCK_DAY_ALL'),
    availableDataset('twse-t86','TWSE:T86')
  ])})).markets.TW;
  assert.equal(row.coverageStatus,'PARTIAL');
  assert.equal(row.directionReadiness,'NOT_READY');
  assert.equal(row.researchReadiness,'READY');
  assert.equal(row.rankingEligibility,'ELIGIBLE');
  assert.ok(row.availableCapabilities.includes('QUOTE'));
  assert.ok(row.availableCapabilities.includes('INSTITUTIONAL_FLOW'));
  for(const cap of ['INDEX','MARKET_BREADTH','SECTOR_ROTATION'])assert.ok(row.missingCapabilities.includes(cap));
});

test('TW becomes READY only when backend market pulse proves complete direction and industry coverage in addition to research',()=>{
  let home=emptyHome();
  home=opportunities(home,'TW',[Object.freeze({market:'TW',instrumentId:'TWSE:2330',researchOnly:true,executionWrite:false})]);
  home=pulse(home,'TW',{status:'AVAILABLE',state:'BROAD_ADVANCE',asOf:NOW-1000,data:Object.freeze({directionCoverage:'COMPLETE',industryCoverage:'COMPLETE',breadth:Object.freeze({combined:Object.freeze({advancers:700,decliners:300})}),industries:Object.freeze({twseLeaders:Object.freeze([{name:'半導體',changePct:2}]),tpexTurnoverLeaders:Object.freeze([{name:'電子',tradeWeightPct:40}])})})});
  const row=buildMarketCoverage(baseInput({home,providerDiagnostics:diagnostics([
    availableDataset('twse-openapi','TWSE:STOCK_DAY_ALL'),availableDataset('twse-t86','TWSE:T86')
  ])})).markets.TW;
  assert.equal(row.coverageStatus,'READY');
  assert.equal(row.directionReadiness,'READY');
  assert.equal(row.researchReadiness,'READY');
  for(const cap of ['INDEX','MARKET_BREADTH','SECTOR_ROTATION','QUOTE','INSTITUTIONAL_FLOW'])assert.ok(row.availableCapabilities.includes(cap));
});

test('US SEC and BLS evidence remains BLOCKED for broad direction while licensed/reviewed breadth and volatility inputs are missing',()=>{
  let home=emptyHome();
  home=opportunities(home,'US',[Object.freeze({market:'US',instrumentId:'NASDAQ:NVDA',researchOnly:true,executionWrite:false})]);
  home=region(home,'US',{status:'AVAILABLE',bias:'NEUTRAL',asOf:NOW-1000,facts:Object.freeze([{field:'inflation.cpi_index',value:1}])});
  const row=buildMarketCoverage(baseInput({home,providerDiagnostics:diagnostics([
    availableDataset('sec-edgar','SEC:companyfacts'),availableDataset('bls-public','BLS:CUUR0000SA0')
  ])})).markets.US;
  assert.equal(row.coverageStatus,'BLOCKED');
  assert.notEqual(row.directionReadiness,'READY');
  assert.equal(row.researchReadiness,'PARTIAL');
  assert.equal(row.rankingEligibility,'LIMITED');
  assert.ok(row.availableCapabilities.includes('FUNDAMENTAL'));
  assert.ok(row.availableCapabilities.includes('MACRO'));
  for(const cap of ['INDEX','MARKET_BREADTH','VOLATILITY_CONTEXT'])assert.ok(row.missingCapabilities.includes(cap));
  assert.ok(row.blockers.some(x=>['LICENSE_REVIEW_REQUIRED','PROVIDER_DECISION_REQUIRED'].includes(x.type)));
});

test('EU macro-only evidence cannot become direction READY and external equity source decision keeps coverage BLOCKED',()=>{
  let home=region(emptyHome(),'EU',{status:'AVAILABLE',bias:'NEUTRAL',asOf:NOW-1000,facts:Object.freeze([{field:'inflation.hicp_yoy',value:1.9}])});
  const row=buildMarketCoverage(baseInput({home,providerDiagnostics:diagnostics([availableDataset('ecb-data','ECB:ICP.M.U2.N.000000.4.ANR')])})).markets.EU;
  assert.equal(row.coverageStatus,'BLOCKED');
  assert.equal(row.directionReadiness,'PARTIAL');
  assert.ok(row.availableCapabilities.includes('MACRO'));
  assert.ok(row.missingCapabilities.includes('INDEX'));
  assert.ok(row.missingCapabilities.includes('MARKET_BREADTH'));
  assert.equal(row.rankingEligibility,'NOT_ELIGIBLE');
});

test('JP and KR credential/entitlement requirements are BLOCKED rather than provider unavailable',()=>{
  const coverage=buildMarketCoverage(baseInput()).markets;
  for(const market of ['JP','KR']){
    const row=coverage[market];
    assert.equal(row.coverageStatus,'BLOCKED');
    assert.equal(row.activationState,'BLOCKED');
    assert.equal(row.directionReadiness,'NOT_READY');
    assert.equal(row.rankingEligibility,'NOT_ELIGIBLE');
    assert.ok(row.blockers.some(x=>x.type==='API_KEY_REQUIRED'||x.type==='ENTITLEMENT_REQUIRED'));
    assert.ok(row.blockers.some(x=>x.externalActionRequired===true));
  }
});

test('CN-HK commercial data product/licensing requirement is explicit BLOCKED and never replaced by scraping',()=>{
  const row=buildMarketCoverage(baseInput()).markets.CN_HK;
  assert.equal(row.coverageStatus,'BLOCKED');
  assert.equal(row.activationState,'BLOCKED');
  assert.ok(row.blockers.some(x=>x.type==='DATA_PRODUCT_REQUIRED'||x.type==='LICENSE_REVIEW_REQUIRED'));
  assert.ok(row.sources.every(x=>x.authority!=='SCRAPED'));
  assert.equal(row.rankingEligibility,'NOT_ELIGIBLE');
});

test('unknown available dataset cannot grant a normalized capability',()=>{
  const row=buildMarketCoverage(baseInput({providerDiagnostics:diagnostics([availableDataset('mystery-provider','MYSTERY:anything')])})).markets.US;
  assert.equal(row.availableCapabilities.includes('INDEX'),false);
  assert.equal(row.availableCapabilities.includes('MARKET_BREADTH'),false);
  assert.notEqual(row.directionReadiness,'READY');
});

test('one provider runtime failure degrades only its mapped capability and exposes a normalized Chinese blocker',()=>{
  let home=emptyHome();
  home=opportunities(home,'TW',[Object.freeze({market:'TW',instrumentId:'TWSE:2330',researchOnly:true,executionWrite:false})]);
  const row=buildMarketCoverage(baseInput({home,providerDiagnostics:diagnostics([
    availableDataset('twse-openapi','TWSE:STOCK_DAY_ALL'),
    unavailableDataset('twse-t86','TWSE:T86','HTTP_ERROR')
  ])})).markets.TW;
  assert.ok(row.availableCapabilities.includes('QUOTE'));
  assert.equal(row.availableCapabilities.includes('INSTITUTIONAL_FLOW'),false);
  assert.ok(row.blockers.some(x=>x.type==='PROVIDER_UNAVAILABLE'&&x.capability==='INSTITUTIONAL_FLOW'));
  assert.ok(row.blockers.some(x=>typeof x.userFacingLabel==='string'&&x.userFacingLabel.length>0));
  assert.equal(row.researchReadiness,'PARTIAL');
  assert.equal(row.rankingEligibility,'LIMITED');
});
