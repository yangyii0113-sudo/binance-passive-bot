const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluateRegion}=require('../v12/intelligence/regional_engine.js');

const e=(family,direction,confidence=1,status='LIVE',asOf=1000)=>({family,direction,confidence,status,asOf,source:'fixture'});

test('regional engine returns bullish bias from aligned evidence',()=>{
  const r=evaluateRegion('US',[e('TREND',.8),e('BREADTH',.6),e('FLOW',.7)],2000);
  assert.equal(r.bias,'STRONG_BULLISH');
  assert.ok(r.confidence>.9);
  assert.equal(r.researchOnly,true);
});

test('stale evidence cannot increase confidence or alter score',()=>{
  const clean=evaluateRegion('TW',[e('TREND',.5),e('FLOW',.5),e('BREADTH',.5)],2000);
  const withStale=evaluateRegion('TW',[e('TREND',.5),e('FLOW',.5),e('BREADTH',.5),e('OLD',-1,1,'STALE')],2000);
  assert.equal(withStale.score,clean.score);
  assert.equal(withStale.confidence,clean.confidence);
});

test('no usable evidence is unavailable rather than guessed neutral',()=>{
  const r=evaluateRegion('KR',[e('OLD',1,1,'STALE')],2000);
  assert.equal(r.bias,'UNAVAILABLE');
  assert.equal(r.confidence,0);
});

test('contradicting evidence is preserved separately',()=>{
  const r=evaluateRegion('CRYPTO',[e('TREND',.8),e('BREADTH',.7),e('FLOW',-.5)],2000);
  assert.equal(r.contradictions.length,1);
  assert.equal(r.contradictions[0].family,'FLOW');
});