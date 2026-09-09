const test=require('node:test');
const assert=require('node:assert/strict');
const {buildTWResearch}=require('../v12/research/tw_engine.js');
const e=(dimension,score,extra={})=>({dimension,score,confidence:1,status:'LIVE',asOf:1000,source:'fixture-'+dimension,label:dimension,...extra});

test('TW research exposes Taiwan-specific dimensions',()=>{
  const dims=['TREND','MOMENTUM','REVENUE','FUNDAMENTAL','INSTITUTIONAL','MARGIN_SHORT','SECTOR','OVERSEAS_LINK','RISK'];
  const r=buildTWResearch({instrumentId:'TWSE:2330',evidence:dims.map(d=>e(d,.5)),nowMs:2000});
  assert.equal(r.market,'TW');
  assert.equal(Object.keys(r.dimensions).length,9);
  assert.equal(r.researchOnly,true);
});

test('institutional evidence preserves foreign investment trust and dealer separately',()=>{
  const metadata={foreign:12000,investmentTrust:1800,dealer:-450,unit:'SHARES'};
  const r=buildTWResearch({instrumentId:'TWSE:2330',evidence:[e('INSTITUTIONAL',.8,{metadata})],nowMs:2000});
  assert.equal(r.institutionalBreakdown.length,1);
  assert.deepEqual(r.institutionalBreakdown[0].metadata,metadata);
});

test('TW research has no execution state even when early trend is READY',()=>{
  const r=buildTWResearch({instrumentId:'TWSE:2330',evidence:[e('TREND',.7)],nowMs:2000,earlyTrend:{stage:'READY',researchOnly:true}});
  assert.equal(r.earlyTrend.stage,'READY');
  assert.equal('executionState' in r,false);
  assert.equal('executionAllowed' in r,false);
});