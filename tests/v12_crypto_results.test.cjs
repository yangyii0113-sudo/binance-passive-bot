const test=require('node:test');
const assert=require('node:assert/strict');
const {projectCryptoResults}=require('../v12/results/crypto_results.js');

const execution={paperOnly:true,realOrderLock:true,readOnly:true,asOf:1000,closedTrades:[
  {position_id:'p1',closed:true,net_pnl_usdt:10,realized_r:1.2,fees_usdt:1,funding_usdt:-.2},
  {position_id:'p2',closed:true,net_pnl_usdt:-5,realized_r:-.6,fees_usdt:.8,funding_usdt:.1},
  {position_id:'p3',closed:true,net_pnl_usdt:4,realized_r:.5,fees_usdt:.7,funding_usdt:0}
]};

test('crypto results use completed paper trades only',()=>{
  const r=projectCryptoResults(execution);
  assert.equal(r.type,'TRADING_RESULTS');
  assert.equal(r.sampleCount,3);
  assert.equal(r.metrics.winRate,2/3);
  assert.equal(r.metrics.netPnl,9);
  assert.equal(r.metrics.netR,1.1);
});

test('profit factor and expectancy are derived from closed samples',()=>{
  const r=projectCryptoResults(execution);
  assert.equal(r.metrics.profitFactor,14/5);
  assert.ok(Math.abs(r.metrics.expectancyR-(1.1/3))<1e-12);
});

test('sample under twenty is marked insufficient and max drawdown stays unavailable without history',()=>{
  const r=projectCryptoResults(execution);
  assert.equal(r.sampleStatus,'SAMPLE_INSUFFICIENT');
  assert.equal(r.metrics.maxDrawdown,null);
  assert.equal(r.unavailable.includes('MAX_DRAWDOWN_HISTORY'),true);
});

test('unsafe or writable execution view is rejected',()=>{
  assert.throws(()=>projectCryptoResults({...execution,realOrderLock:false}),/REAL_ORDER_LOCK_REQUIRED/);
});