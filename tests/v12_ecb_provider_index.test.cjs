const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../v12/providers/index.js');

test('provider foundation exports ECB adapter',()=>{
  assert.ok(P.adapters.ecb);
  assert.equal(P.adapters.ecb.descriptor.id,'ecb-official');
  assert.equal(P.adapters.ecb.descriptor.executionWrite,false);
});
