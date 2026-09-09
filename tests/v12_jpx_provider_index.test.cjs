const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../v12/providers/index.js');

test('provider foundation exports JPX J-Quants only as authenticated read-only adapter',()=>{
  assert.ok(P.adapters.jpx);
  assert.equal(P.adapters.jpx.descriptor.id,'jpx-jquants-v2');
  assert.equal(P.adapters.jpx.descriptor.transport,'AUTHENTICATED_READ_ONLY');
  assert.equal(P.adapters.jpx.descriptor.executionWrite,false);
  assert.equal(P.adapters.jpx.descriptor.serverOnly,true);
});
