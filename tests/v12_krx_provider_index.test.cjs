const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../v12/providers/index.js');

test('provider foundation exports KRX adapter only as read-only authenticated provider',()=>{
  assert.ok(P.adapters.krx);
  assert.equal(P.adapters.krx.descriptor.id,'krx-official');
  assert.equal(P.adapters.krx.descriptor.transport,'AUTHENTICATED_READ_ONLY');
  assert.equal(P.adapters.krx.descriptor.executionWrite,false);
  assert.equal(P.adapters.krx.descriptor.serverOnly,true);
});
