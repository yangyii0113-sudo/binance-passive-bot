const test=require('node:test');
const assert=require('node:assert/strict');
const I=require('../v12/intelligence/contracts.js');

test('regional intelligence covers seven regions',()=>{
  assert.deepEqual(I.REGION_IDS,['US','TW','CN_HK','JP','KR','EU','CRYPTO']);
});

test('bias vocabulary is fixed',()=>{
  assert.deepEqual(I.BIAS_STATES,['STRONG_BULLISH','BULLISH','NEUTRAL','BEARISH','STRONG_BEARISH','UNAVAILABLE']);
});

test('regional snapshot requires provenance and cannot express execution',()=>{
  const r=I.validateRegionalSnapshot({
    region:'US',bias:'BULLISH',score:.45,confidence:.8,asOf:1000,
    evidence:[],contradictions:[],researchOnly:true
  });
  assert.equal(r.ok,true);
  assert.equal(I.validateRegionalSnapshot({...r.value,researchOnly:false}).ok,false);
});