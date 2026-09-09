const test=require('node:test');
const assert=require('node:assert/strict');
const {surprise,revision}=require('../v12/research/earnings.js');
const {buildUSResearch}=require('../v12/research/us_engine.js');
const e=(dimension,score)=>({dimension,score,confidence:1,status:'LIVE',asOf:1000,source:'fixture',label:dimension});

test('earnings surprise and estimate revision are distinct calculations',()=>{
  const s=surprise(6.30,6.07);
  const r=revision(6.41,6.10);
  assert.ok(s.pct>0);
  assert.ok(r.pct>0);
  assert.notEqual(s.delta,r.delta);
});

test('US research exposes six dimensions and remains research only',()=>{
  const evidence=['TREND','MOMENTUM','FUNDAMENTAL','EXPECTATION','FLOW','RISK'].map((d,i)=>e(d,[.7,.6,.4,.8,.5,-.2][i]));
  const r=buildUSResearch({instrumentId:'NASDAQ:NVDA',evidence,nowMs:2000,earnings:{actualEPS:6.3,consensusEPS:6.07}});
  assert.equal(r.market,'US');
  assert.equal(Object.keys(r.dimensions).length,6);
  assert.equal(r.researchOnly,true);
  assert.equal('executionState' in r,false);
});

test('positive earnings actual does not overwrite expectation evidence',()=>{
  const evidence=[e('FUNDAMENTAL',.8),e('EXPECTATION',-.6)];
  const r=buildUSResearch({instrumentId:'NASDAQ:NVDA',evidence,nowMs:2000,earnings:{actualEPS:6.3,consensusEPS:6.5}});
  assert.equal(r.dimensions.FUNDAMENTAL.direction,'POSITIVE');
  assert.equal(r.dimensions.EXPECTATION.direction,'NEGATIVE');
  assert.ok(r.earnings.epsSurprise.delta<0);
});