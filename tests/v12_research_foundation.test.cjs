const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../v12/core/index.js');

test('foundation exports US TW research and scenario engines',()=>{
  assert.equal(typeof F.research.buildUSResearch,'function');
  assert.equal(typeof F.research.buildTWResearch,'function');
  assert.equal(typeof F.research.buildPriceScenarios,'function');
});

test('research surface has no execution or order methods',()=>{
  for(const key of ['execute','placeOrder','openPosition','createIntent'])assert.equal(key in F.research,false);
});