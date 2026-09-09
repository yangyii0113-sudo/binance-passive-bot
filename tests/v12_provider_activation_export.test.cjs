const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../v12/providers/index.js');

test('provider foundation exports centralized activation evaluator',()=>{
  assert.equal(typeof P.evaluateSource,'function');
  assert.equal(P.evaluateSource('us-equity-realtime').canActivate,false);
});
