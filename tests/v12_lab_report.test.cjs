const test=require('node:test');
const assert=require('node:assert/strict');
const {buildLabReport,compareReports}=require('../v12/lab/report.js');
const version=(id,mode)=>({id,modelId:'crypto-A',market:'CRYPTO',mode,version:id,createdAt:1,rulesHash:'a'.repeat(64)});

test('lab report marks fewer than twenty samples insufficient',()=>{
  const r=buildLabReport({version:version('A-1','CONTROL'),sampleCount:19,metrics:{winRate:.6,expectancy:.2,profitFactor:1.3,maxDrawdown:.05,capture:.4},asOf:100});
  assert.equal(r.sampleStatus,'SAMPLE_INSUFFICIENT');
});

test('lab report with twenty samples remains descriptive not validated',()=>{
  const r=buildLabReport({version:version('A-1','CONTROL'),sampleCount:20,metrics:{winRate:.6,expectancy:.2},asOf:100});
  assert.equal(r.sampleStatus,'DESCRIPTIVE_ONLY');
  assert.equal(r.autoPromote,false);
});

test('control shadow comparison reports deltas but never promotes',()=>{
  const c=buildLabReport({version:version('A-1','CONTROL'),sampleCount:30,metrics:{winRate:.5,expectancy:.1,profitFactor:1.2},asOf:100});
  const s=buildLabReport({version:version('A-s','SHADOW'),sampleCount:30,metrics:{winRate:.6,expectancy:.2,profitFactor:1.5},asOf:100});
  const x=compareReports(c,s);
  assert.ok(x.deltas.expectancy>0);
  assert.equal(x.autoPromote,false);
  assert.equal(x.requiresVersionReview,true);
});

test('missing metric stays null rather than invented',()=>{
  const r=buildLabReport({version:version('A-1','CONTROL'),sampleCount:10,metrics:{winRate:.5,maxDrawdown:null},asOf:100});
  assert.equal(r.metrics.maxDrawdown,null);
});