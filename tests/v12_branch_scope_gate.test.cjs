const test=require('node:test');
const assert=require('node:assert/strict');
const {auditChangedPaths}=require('../v12/staging/branch_scope_gate.js');

test('v12 branch scope accepts only isolated implementation paths',()=>{
  const audit=auditChangedPaths([
    '.github/workflows/v12-integration.yml',
    'docs/architecture/FOXYYA_v12_multimarket_product_spec.md',
    'docs/superpowers/plans/example.md',
    'tests/v12_example.test.cjs',
    'v12/staging/server.js',
    'v12/ui/index.html'
  ]);
  assert.equal(audit.safe,true);
  assert.deepEqual(audit.forbidden,[]);
  assert.equal(audit.productionReleaseAuthorized,false);
});

test('production runtime, UI, build and ledger files are rejected',()=>{
  for(const file of ['service.py','runtime_view.py','live_ui.html','Dockerfile','ledger.py','paper_engine.py','railway.json']){
    const audit=auditChangedPaths([file]);
    assert.equal(audit.safe,false,file);
    assert.deepEqual(audit.forbidden,[file]);
  }
});

test('unknown root paths fail closed instead of being silently allowed',()=>{
  const audit=auditChangedPaths(['README.md','scripts/deploy.sh','tests/runtime_bridge.test.cjs']);
  assert.equal(audit.safe,false);
  assert.deepEqual(audit.forbidden,['README.md','scripts/deploy.sh','tests/runtime_bridge.test.cjs']);
});

test('path normalization rejects traversal and invalid input',()=>{
  assert.throws(()=>auditChangedPaths(['v12/../service.py']),/PATH_INVALID/);
  assert.throws(()=>auditChangedPaths([123]),/PATH_INVALID/);
});
