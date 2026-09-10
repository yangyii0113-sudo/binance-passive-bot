'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Catalog=require('../v12/providers/source_catalog.js');
const Gate=require('../v12/providers/activation_gate.js');
const Nasdaq=require('../v12/providers/nasdaq_daily_market_adapter.js');
const Core=require('../v12/read_model/us_market_core.js');

const receivedAt=Date.parse('2026-09-10T01:00:00Z');
const text=[
  '"Date","N100","Financial100","Composite","Composite_Hi","Composite_Low","N100_Hi","N100_Low","Industrial","Bank","Insurance","Financial","Transportation","Telecom","Biotech","Computer","NasdaqTrades","Volume","DolVol","MktVal","Advances","Declines","Unchanged"',
  '9/8/2026 0:00:00,25000.00,7300.00,23000.00,23100.00,22800.00,25100.00,24800.00,12000.00,4600.00,15000.00,13000.00,7800.00,500.00,5800.00,22000.00,60000000.00,7800000000.00,487000000000.00,43000000000.00,2000.00,2800.00,200.00',
  '9/9/2026 0:00:00,25500.00,7350.00,23575.00,23600.00,23150.00,25600.00,25150.00,12240.00,4646.00,15150.00,13130.00,7878.00,505.00,5858.00,22220.00,64000000.00,8000000000.00,500000000000.00,43500000000.00,3300.00,1500.00,220.00'
].join('\n');

test('Nasdaq Trader daily market source is discoverable but license-gated and cannot activate live',()=>{
  const source=Catalog.SOURCE_CATALOG.find(x=>x.id==='nasdaq-trader-daily');
  assert.ok(source);
  assert.equal(source.authority,'OFFICIAL');
  assert.equal(source.status,Catalog.SOURCE_STATUS.REVIEW_REQUIRED);
  assert.equal(source.liveEligible,false);
  assert.equal(source.secretRequired,false);
  assert.equal(source.latencyClass,'EOD');
  assert.ok(source.capabilities.includes('INDEX'));
  assert.ok(source.capabilities.includes('MARKET_BREADTH'));
  const readiness=Gate.evaluateSource('nasdaq-trader-daily');
  assert.equal(readiness.readiness,Gate.READINESS.REVIEW_REQUIRED);
  assert.equal(readiness.canActivate,false);
});

test('Nasdaq official YTD text normalizes latest completed row with prior-day returns and breadth',()=>{
  const result=Nasdaq.normalizeYearToDateText(text,{receivedAt});
  assert.equal(result.schemaVersion,'foxyya-us-nasdaq-market-snapshot/1');
  assert.equal(result.market,'US');
  assert.equal(result.scope,'NASDAQ_LISTED_US');
  assert.equal(result.venue,'NASDAQ');
  assert.equal(result.tradeDate,'2026-09-09');
  assert.equal(result.latency,'EOD');
  assert.equal(result.realtime,false);
  assert.equal(result.fullMarketBreadthAvailable,false);
  assert.equal(result.licenseStatus,'REVIEW_REQUIRED');
  assert.equal(result.redistributionStatus,'NOT_CLEARED');
  assert.equal(result.indices.composite.close,23575);
  assert.ok(Math.abs(result.indices.composite.changePct-2.5)<1e-12);
  assert.equal(result.indices.nasdaq100.close,25500);
  assert.ok(Math.abs(result.indices.nasdaq100.changePct-2)<1e-12);
  assert.deepEqual(result.breadth,{advancers:3300,decliners:1500,unchanged:220,advanceDeclineRatio:2.2,issueCount:5020});
  assert.equal(result.sectors.find(x=>x.id==='INDUSTRIAL').close,12240);
  assert.ok(Math.abs(result.sectors.find(x=>x.id==='INDUSTRIAL').changePct-2)<1e-12);
  assert.ok(result.observations.some(x=>x.field==='market.breadth.advancers'&&x.value===3300));
  assert.ok(result.observations.every(x=>x.scope==='US'&&x.observedAt<=x.receivedAt));
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('Nasdaq parser fails closed on missing breadth fields and never fabricates zero counts',()=>{
  const broken=text.replace(',"Advances","Declines","Unchanged"',',"Advances","Unchanged"');
  assert.throws(()=>Nasdaq.normalizeYearToDateText(broken,{receivedAt}),/NASDAQ_SCHEMA_REQUIRED:Declines/);
});

test('US Market Core produces a Nasdaq-scoped EOD direction but refuses to claim full-US market coverage',()=>{
  const nasdaq=Nasdaq.normalizeYearToDateText(text,{receivedAt});
  const core=Core.buildUSMarketCore({nowMs:receivedAt,nasdaq});
  assert.equal(core.schemaVersion,'foxyya-us-market-core/1');
  assert.equal(core.market,'US');
  assert.equal(core.status,'AVAILABLE');
  assert.equal(core.state,'NASDAQ_BROAD_ADVANCE');
  assert.ok(core.confidence>0);
  assert.equal(core.marketScope,'NASDAQ_LISTED_US');
  assert.equal(core.latency,'EOD');
  assert.equal(core.realtime,false);
  assert.equal(core.directionCoverage,'PARTIAL');
  assert.equal(core.fullMarketState,'UNAVAILABLE');
  assert.equal(core.fullMarketBreadthAvailable,false);
  assert.deepEqual(core.missingSources,['US_FULL_MARKET_BREADTH','LICENSE_CLEARANCE']);
  assert.equal(core.publicDisplayAllowed,false);
  assert.equal(core.data.indices.composite.close,23575);
  assert.equal(core.data.breadth.advanceDeclineRatio,2.2);
  assert.equal(core.researchOnly,true);
  assert.equal(core.executionWrite,false);
});

test('US Market Core cannot silently upgrade Nasdaq-listed breadth into a full-market state',()=>{
  const nasdaq=Nasdaq.normalizeYearToDateText(text,{receivedAt});
  const core=Core.buildUSMarketCore({nowMs:receivedAt,nasdaq});
  assert.notEqual(core.marketScope,'US_FULL_MARKET');
  assert.notEqual(core.directionCoverage,'COMPLETE');
  assert.notEqual(core.fullMarketState,core.state);
});
