const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../v12/early_trend/index.js');

test('Early Trend foundation exports centralized evidence builders',()=>{
  assert.equal(typeof E.buildInstitutionalFlowEvidence,'function');
  assert.equal(typeof E.buildGuidanceRevisionEvidence,'function');
});
