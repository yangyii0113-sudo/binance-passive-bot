const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../v12/research/contracts.js');

test('US and TW research dimensions are market specific',()=>{
  assert.deepEqual(R.US_DIMENSIONS,['TREND','MOMENTUM','FUNDAMENTAL','EXPECTATION','FLOW','RISK']);
  assert.deepEqual(R.TW_DIMENSIONS,['TREND','MOMENTUM','REVENUE','FUNDAMENTAL','INSTITUTIONAL','MARGIN_SHORT','SECTOR','OVERSEAS_LINK','RISK']);
});

test('research read must remain research only and cannot carry execution state',()=>{
  const value={market:'US',instrumentId:'NASDAQ:NVDA',direction:'POSITIVE',confidence:.7,dimensions:{},evidence:[],contradictions:[],missingDimensions:[...R.US_DIMENSIONS],asOf:1,researchOnly:true};
  assert.equal(R.validateResearchRead(value).ok,true);
  assert.equal(R.validateResearchRead({...value,researchOnly:false}).ok,false);
  assert.equal(R.validateResearchRead({...value,executionState:'OPEN'}).ok,false);
});