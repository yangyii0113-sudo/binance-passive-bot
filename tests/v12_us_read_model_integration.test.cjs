const test=require('node:test');
const assert=require('node:assert/strict');
const SEC=require('../v12/providers/sec_edgar_adapter.js');
const R=require('../v12/read_model/us_asset_snapshot.js');

const instrument=Object.freeze({instrumentId:'NASDAQ:NVDA',exchange:'NASDAQ',symbol:'NVDA',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'});
const other=Object.freeze({instrumentId:'NASDAQ:MSFT',exchange:'NASDAQ',symbol:'MSFT',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'});
const receivedAt=Date.parse('2026-09-09T03:00:00Z');

function fact(inst,concept,val){
  return SEC.normalizeCompanyFact({
    cik:'1045810',facts:{'us-gaap':{[concept]:{label:concept,description:'fixture',units:{USD:[{val,accn:'0001045810-26-000001',form:'10-Q',filed:'2026-08-25',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}
  },{instrument:inst,taxonomy:'us-gaap',concept,unit:'USD',receivedAt});
}

test('SEC actual facts enter US read model without becoming directional research by themselves',()=>{
  const revenue=fact(instrument,'RevenueFromContractWithCustomerExcludingAssessedTax',46700000000);
  const income=fact(instrument,'NetIncomeLoss',26400000000);
  const out=R.buildUSAssetResearchSnapshot({instrument,fundamentalFacts:[revenue,income],researchEvidence:[],nowMs:receivedAt});
  assert.equal(out.schemaVersion,'foxyya-us-asset-read-model/1');
  assert.equal(out.instrumentId,'NASDAQ:NVDA');
  assert.equal(out.researchOnly,true);
  assert.equal(out.executionWrite,false);
  assert.equal(out.earlyTrend.stage,'DETECT');
  assert.equal(out.earlyTrend.direction,'UNAVAILABLE');
  assert.equal(out.research.market,'US');
  assert.equal(out.research.direction,'UNAVAILABLE');
  assert.ok(out.research.missingDimensions.includes('FUNDAMENTAL'));
  assert.equal(out.fundamentals.length,2);
  assert.ok(out.fundamentals.every(x=>x.pointInTimeSafe===false));
  assert.ok(out.sourceLineage.includes('SEC:companyfacts'));
  assert.equal(out.dataGaps.realtimeQuote,'UNAVAILABLE');
  assert.equal(out.dataGaps.consensus,'UNAVAILABLE');
  assert.equal(out.dataGaps.options,'UNAVAILABLE');
  for(const forbidden of ['order','placeOrder','execute','executionState','executionAllowed'])assert.equal(Object.hasOwn(out,forbidden),false);
});

test('US read model accepts explicit research evidence separately from raw SEC facts',()=>{
  const out=R.buildUSAssetResearchSnapshot({
    instrument,
    fundamentalFacts:[fact(instrument,'NetIncomeLoss',26400000000)],
    researchEvidence:[{dimension:'TREND',score:.4,confidence:.8,status:'SNAPSHOT',asOf:receivedAt-1000,source:'licensed-quote-derived',label:'price trend'}],
    nowMs:receivedAt
  });
  assert.equal(out.research.dimensions.TREND.direction,'POSITIVE');
  assert.ok(out.research.missingDimensions.includes('FUNDAMENTAL'));
  assert.equal(out.fundamentals[0].concept,'NetIncomeLoss');
});

test('US read model rejects SEC facts belonging to another instrument',()=>{
  assert.throws(()=>R.buildUSAssetResearchSnapshot({instrument,fundamentalFacts:[fact(other,'NetIncomeLoss',1)],researchEvidence:[],nowMs:receivedAt}),/INSTRUMENT_MISMATCH/);
});
