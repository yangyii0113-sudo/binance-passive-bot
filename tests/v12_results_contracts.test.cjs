const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../v12/results/contracts.js');

test('result domains are explicitly separated',()=>{
  assert.deepEqual(R.RESULT_TYPES,['TRADING_RESULTS','RESEARCH_RESULTS']);
});

test('trading results require Crypto and completed trade semantics',()=>{
  const v={type:'TRADING_RESULTS',market:'CRYPTO',sampleCount:3,asOf:1,source:'canonical-ledger',researchOnly:false};
  assert.equal(R.validateResultEnvelope(v).ok,true);
  assert.equal(R.validateResultEnvelope({...v,market:'US'}).ok,false);
});

test('research results cannot pretend to be trading results',()=>{
  const v={type:'RESEARCH_RESULTS',market:'US',sampleCount:5,asOf:1,source:'research-tracking',researchOnly:true};
  assert.equal(R.validateResultEnvelope(v).ok,true);
  assert.equal(R.validateResultEnvelope({...v,researchOnly:false}).ok,false);
});