const test=require('node:test');
const assert=require('node:assert/strict');
const providers=require('../v12/providers/index.js');

test('provider foundation exports the source catalog API',()=>{
  assert.ok(Array.isArray(providers.SOURCE_CATALOG));
  assert.equal(typeof providers.validateSourceCatalog,'function');
  assert.equal(typeof providers.findSources,'function');
});
