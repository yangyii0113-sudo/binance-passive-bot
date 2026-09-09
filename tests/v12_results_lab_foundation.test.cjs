const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../v12/core/index.js');

test('foundation exports results and lab governance',()=>{
  assert.equal(typeof F.results.projectCryptoResults,'function');
  assert.equal(typeof F.results.createResearchTrack,'function');
  assert.equal(typeof F.lab.createVersionRegistry,'function');
  assert.equal(typeof F.lab.buildLabReport,'function');
});

test('results and lab surfaces cannot place orders or auto promote',()=>{
  for(const surface of [F.results,F.lab])for(const key of ['execute','placeOrder','openPosition'])assert.equal(key in surface,false);
});