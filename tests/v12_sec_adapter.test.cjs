const test=require('node:test');
const assert=require('node:assert/strict');
const SEC=require('../v12/providers/sec_edgar_adapter.js');

const instrument={instrumentId:'NASDAQ:NVDA',exchange:'NASDAQ',symbol:'NVDA',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'};
const receivedAt=Date.parse('2026-05-23T12:00:00Z');

test('SEC provider is server-only and cannot write execution',()=>{assert.equal(SEC.descriptor.executionWrite,false);assert.equal(SEC.descriptor.serverOnly,true);assert.equal(SEC.descriptor.transport,'PUBLIC_READ_ONLY');});

test('SEC submissions recent columnar data becomes filing events with acceptance time',()=>{
  const payload={cik:'1045810',name:'NVIDIA CORP',tickers:['NVDA'],exchanges:['Nasdaq'],filings:{recent:{accessionNumber:['0001045810-26-000123','0001045810-26-000124'],filingDate:['2026-05-22','2026-05-22'],reportDate:['2026-04-30',''],acceptanceDateTime:['20260522160500','20260522161000'],form:['10-Q','8-K'],primaryDocument:['nvda-20260430.htm','nvda-8k.htm']}}};
  const r=SEC.normalizeSubmissions(payload,{instrument,receivedAt});
  assert.equal(r.cik,'0001045810');assert.equal(r.filings.length,2);assert.equal(r.filings[0].form,'10-Q');assert.equal(r.filings[0].acceptedAt,Date.parse('2026-05-22T16:05:00Z'));assert.equal(r.filings[0].source,'SEC:submissions');assert.equal(r.filings[0].researchOnly,true);
});

test('SEC submissions reject misaligned recent columns',()=>{
  const bad={cik:'1045810',filings:{recent:{accessionNumber:['a'],filingDate:['2026-05-22','2026-05-23'],form:['10-Q'],acceptanceDateTime:['20260522160500'],reportDate:[''],primaryDocument:['a.htm']}}};
  assert.throws(()=>SEC.normalizeSubmissions(bad,{instrument,receivedAt}),/COLUMN_MISMATCH/);
});

test('SEC company fact becomes canonical observation but uses receive time as knowledge time',()=>{
  const payload={cik:1045810,facts:{'us-gaap':{Revenues:{label:'Revenue',units:{USD:[{start:'2026-01-27',end:'2026-04-30',val:44062000000,accn:'0001045810-26-000123',fy:2026,fp:'Q1',form:'10-Q',filed:'2026-05-22',frame:'CY2026Q1'}]}}}}};
  const r=SEC.normalizeCompanyFact(payload,{instrument,taxonomy:'us-gaap',concept:'Revenues',unit:'USD',receivedAt});
  assert.equal(r.concept,'Revenues');assert.equal(r.pointInTimeSafe,false);assert.equal(r.knowledgeTime,'RECEIVED_AT');assert.equal(r.observations.length,1);
  const x=r.observations[0];assert.equal(x.field,'fundamental.sec.us-gaap.Revenues');assert.equal(x.value,44062000000);assert.equal(x.unit,'USD');assert.equal(x.observedAt,receivedAt);assert.equal(x.source,'SEC:companyfacts');assert.equal(x.status,'SNAPSHOT');
});

test('SEC company fact preserves filing metadata separately from the canonical value',()=>{
  const payload={cik:1045810,facts:{'us-gaap':{EarningsPerShareDiluted:{label:'Diluted EPS',units:{'USD/shares':[{start:'2026-01-27',end:'2026-04-30',val:1.12,accn:'accn',fy:2026,fp:'Q1',form:'10-Q',filed:'2026-05-22'}]}}}}};
  const r=SEC.normalizeCompanyFact(payload,{instrument,taxonomy:'us-gaap',concept:'EarningsPerShareDiluted',unit:'USD/shares',receivedAt});
  assert.equal(r.rows[0].form,'10-Q');assert.equal(r.rows[0].filedDate,'2026-05-22');assert.equal(r.rows[0].reportEnd,'2026-04-30');assert.equal(r.observations[0].unit,'USD_PER_SHARE');
});

test('missing SEC XBRL concept is explicit UNAVAILABLE, never fabricated',()=>{
  const r=SEC.normalizeCompanyFact({cik:1045810,facts:{}},{instrument,taxonomy:'us-gaap',concept:'Revenues',unit:'USD',receivedAt});
  assert.equal(r.status,'UNAVAILABLE');assert.equal(r.observations.length,0);
});
