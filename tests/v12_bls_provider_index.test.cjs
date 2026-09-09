const test=require('node:test');const assert=require('node:assert/strict');const P=require('../v12/providers/index.js');
test('provider foundation exposes BLS only as server-side read-only adapter',()=>{assert.equal(P.adapters.bls.descriptor.id,'bls-official');assert.equal(P.adapters.bls.descriptor.serverOnly,true);assert.equal(P.adapters.bls.descriptor.executionWrite,false);});
