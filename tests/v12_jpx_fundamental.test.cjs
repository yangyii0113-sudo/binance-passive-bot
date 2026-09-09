const test=require('node:test');
const assert=require('node:assert/strict');
const JPX=require('../v12/providers/jpx_adapter.js');

test('J-Quants provider advertises fundamentals separately from quotes',()=>{
  assert.ok(JPX.descriptor.capabilities.includes('FUNDAMENTAL'));
});

test('financial summary uses exact disclosure timestamp and keeps actuals separate from company guidance',()=>{
  const receivedAt=Date.parse('2026-08-05T07:10:00Z');
  const out=JPX.normalizeFinancialSummary({
    DiscDate:'2026-08-05',DiscTime:'15:00:00',Code:'72030',DiscNo:'20260805ABC',DocType:'1QFinancialStatements_Consolidated_IFRS',CurPerType:'1Q',CurPerSt:'2026-04-01',CurPerEn:'2026-06-30',
    Sales:'12000000000000',OP:'1500000000000',OdP:'1600000000000',NP:'1100000000000',EPS:'340.5',TA:'80000000000000',Eq:'30000000000000',CFO:'2000000000000',CFI:'-1500000000000',CFF:'-300000000000',CashEq:'7000000000000',
    FSales:'50000000000000',FOP:'6500000000000',FOdP:'6800000000000',FNP:'4700000000000',FEPS:'1450.0'
  },{receivedAt,name:'Toyota Motor'});
  assert.equal(out.disclosedAt,Date.parse('2026-08-05T15:00:00+09:00'));
  assert.equal(out.knowledgeTime,'DISCLOSURE_TIMESTAMP');
  assert.equal(out.pointInTimeSafe,true);
  assert.equal(out.docType,'1QFinancialStatements_Consolidated_IFRS');
  const byField=Object.fromEntries(out.observations.map(x=>[x.field,x]));
  assert.equal(byField['fundamental.sales'].value,12000000000000);
  assert.equal(byField['fundamental.eps'].value,340.5);
  assert.equal(byField['guidance.sales_fy'].value,50000000000000);
  assert.equal(byField['guidance.eps_fy'].value,1450);
  assert.equal(byField['expectation.consensus_sales'],undefined);
});

test('financial summary without disclosure time falls back to receivedAt and is not PIT-safe',()=>{
  const receivedAt=Date.parse('2026-08-05T08:00:00Z');
  const out=JPX.normalizeFinancialSummary({DiscDate:'2026-08-05',DiscTime:'',Code:'72030',Sales:'100'},{receivedAt});
  assert.equal(out.disclosedAt,null);
  assert.equal(out.knowledgeTime,'RECEIVED_AT');
  assert.equal(out.pointInTimeSafe,false);
  assert.equal(out.observations[0].observedAt,receivedAt);
});

test('financial summary missing numeric values become UNAVAILABLE',()=>{
  const receivedAt=Date.parse('2026-08-05T07:00:00Z');
  const out=JPX.normalizeFinancialSummary({DiscDate:'2026-08-05',DiscTime:'15:00:00',Code:'72030',Sales:'-'},{receivedAt});
  const sales=out.observations.find(x=>x.field==='fundamental.sales');
  assert.equal(sales.value,null);
  assert.equal(sales.status,'UNAVAILABLE');
});

test('financial summary rejects impossible future receipt ordering',()=>{
  assert.throws(()=>JPX.normalizeFinancialSummary({DiscDate:'2026-08-05',DiscTime:'15:00:00',Code:'72030',Sales:'100'},{receivedAt:Date.parse('2026-08-05T05:00:00Z')}),/RECEIVED_AT_INVALID/);
});
