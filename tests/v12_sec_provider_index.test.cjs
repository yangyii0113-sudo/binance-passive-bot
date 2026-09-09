const test=require('node:test');const assert=require('node:assert/strict');const P=require('../v12/providers/index.js');
test('provider foundation exposes SEC only as server-side read-only adapter',()=>{assert.equal(P.adapters.sec.descriptor.id,'sec-edgar-official');assert.equal(P.adapters.sec.descriptor.serverOnly,true);assert.equal(P.adapters.sec.descriptor.executionWrite,false);});
