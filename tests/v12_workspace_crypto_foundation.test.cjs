const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../v12/core/index.js');

test('foundation exports workspace and crypto read adapter',()=>{
  assert.equal(typeof F.workspace.buildWorkspace,'function');
  assert.equal(typeof F.crypto.adaptRuntime,'function');
});

test('crypto v12 surface is read adapter only',()=>{
  for(const key of ['execute','fill','placeOrder','createIntent'])assert.equal(key in F.crypto,false);
});