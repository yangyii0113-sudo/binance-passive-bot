const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../v12/core/index.js');

test('foundation exports global intelligence and early trend engines',()=>{
  assert.equal(typeof F.intelligence.evaluateRegion,'function');
  assert.equal(typeof F.intelligence.buildContext,'function');
  assert.equal(typeof F.earlyTrend.fuseEvidence,'function');
});

test('early trend surface has no execution authorizer',()=>{
  assert.equal('execute' in F.earlyTrend,false);
  assert.equal('placeOrder' in F.earlyTrend,false);
});