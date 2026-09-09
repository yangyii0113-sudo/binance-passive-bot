const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../v12/read_model/index.js');

test('read model foundation exposes stable read-only builders',()=>{
  assert.equal(typeof R.buildTWAssetResearchSnapshot,'function');
  assert.equal(typeof R.buildUSAssetResearchSnapshot,'function');
  assert.equal(typeof R.buildRegionalContextSnapshot,'function');
  assert.equal(typeof R.buildHomeReadModel,'function');
});

test('read model foundation has no execution write surface',()=>{
  for(const forbidden of ['execute','placeOrder','submitOrder','setLeverage','authorizeExecution']){
    assert.equal(Object.hasOwn(R,forbidden),false);
  }
});
