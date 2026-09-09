const test=require('node:test');const assert=require('node:assert/strict');const P=require('../v12/providers/index.js');
test('provider foundation exposes Fed only as server-side read-only adapter',()=>{assert.equal(P.adapters.fed.descriptor.id,'fed-official');assert.equal(P.adapters.fed.descriptor.serverOnly,true);assert.equal(P.adapters.fed.descriptor.executionWrite,false);});
