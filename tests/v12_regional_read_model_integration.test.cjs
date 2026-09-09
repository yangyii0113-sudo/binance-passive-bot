const test=require('node:test');
const assert=require('node:assert/strict');
const N=require('../v12/data/context_normalizer.js');
const E=require('../v12/data/context_event.js');
const R=require('../v12/read_model/regional_context_snapshot.js');

const nowMs=Date.parse('2026-09-09T04:00:00Z');
const cpi=N.makeContextObservation({
  entityId:'MACRO:US:CPI',scope:'US',field:'inflation.cpi_index',value:326.5,unit:'INDEX',
  observedAt:nowMs-60000,receivedAt:nowMs-60000,source:'BLS:CUSR0000SA0',status:'SNAPSHOT',confidence:1
});
const fed=E.makeContextEvent({
  eventId:'fed-1',scope:'US',category:'MONETARY_POLICY',title:'Federal Reserve statement',summary:'Official statement',
  publishedAt:nowMs-120000,receivedAt:nowMs-110000,source:'FED:MONETARY_POLICY',url:'https://www.federalreserve.gov/',status:'SNAPSHOT'
});

test('official macro facts and Fed events do not create regional direction without explicit evidence',()=>{
  const out=R.buildRegionalContextSnapshot({region:'US',observations:[cpi],events:[fed],evidence:[],nowMs});
  assert.equal(out.schemaVersion,'foxyya-regional-context-read-model/1');
  assert.equal(out.region,'US');
  assert.equal(out.regionalSnapshot.bias,'UNAVAILABLE');
  assert.equal(out.regionalSnapshot.score,null);
  assert.equal(out.observations.length,1);
  assert.equal(out.events.length,1);
  assert.equal(out.context.facts.length,1);
  assert.equal(out.context.facts[0].source,'BLS:CUSR0000SA0');
  assert.equal(out.researchOnly,true);
  assert.equal(out.executionWrite,false);
});

test('explicit audited evidence can set regional bias while facts remain separate',()=>{
  const evidence=[
    {family:'BREADTH',direction:.6,confidence:.9,status:'SNAPSHOT',asOf:nowMs-1000,source:'TWSE:BREADTH'},
    {family:'FLOW',direction:.5,confidence:.8,status:'SNAPSHOT',asOf:nowMs-2000,source:'TWSE:FLOW'},
    {family:'MOMENTUM',direction:.4,confidence:.7,status:'SNAPSHOT',asOf:nowMs-3000,source:'TWSE:MOMENTUM'}
  ];
  const twFact=N.makeContextObservation({entityId:'MACRO:TW:TURNOVER',scope:'TW',field:'market.turnover',value:4500,unit:'TWD_BILLION',observedAt:nowMs-5000,receivedAt:nowMs-5000,source:'TWSE:MARKET',status:'SNAPSHOT',confidence:1});
  const out=R.buildRegionalContextSnapshot({region:'TW',observations:[twFact],events:[],evidence,nowMs});
  assert.equal(out.regionalSnapshot.bias,'BULLISH');
  assert.ok(out.regionalSnapshot.score>0);
  assert.equal(out.context.facts.length,1);
  assert.equal(out.context.expectations.length,0);
});

test('regional read model rejects cross-region canonical context data',()=>{
  assert.throws(()=>R.buildRegionalContextSnapshot({region:'TW',observations:[cpi],events:[],evidence:[],nowMs}),/SCOPE_MISMATCH/);
  assert.throws(()=>R.buildRegionalContextSnapshot({region:'TW',observations:[],events:[fed],evidence:[],nowMs}),/SCOPE_MISMATCH/);
});
