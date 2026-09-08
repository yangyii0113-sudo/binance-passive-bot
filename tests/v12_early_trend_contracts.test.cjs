const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../v12/early_trend/contracts.js');

test('early trend stage vocabulary is fixed',()=>{
  assert.deepEqual(E.STAGES,['DETECT','EARLY_WATCH','ACCUMULATION','CONFIRMING','READY']);
});

test('smart-money evidence families are explicit',()=>{
  for(const x of ['SMART_MONEY','INSTITUTIONAL','EXPECTATION','OPTIONS','BREADTH','ROTATION','LEAD_LAG','VOLATILITY','DIVERGENCE','ONCHAIN']) assert.ok(E.EVIDENCE_FAMILIES.includes(x));
});

test('fusion result must remain research-only',()=>{
  const value={stage:'EARLY_WATCH',direction:'POSITIVE',confidence:.4,evidenceFamilyCount:2,supportingEvidence:[],contradictions:[],invalidations:[],nextConfirmation:[],asOf:1,researchOnly:true};
  assert.equal(E.validateFusionResult(value).ok,true);
  assert.equal(E.validateFusionResult({...value,researchOnly:false}).ok,false);
});