const test=require('node:test');
const assert=require('node:assert/strict');
const {buildWorkspace}=require('../v12/workspace/assembler.js');
const btc={instrumentId:'BINANCE:BTCUSDT',symbol:'BTCUSDT',exchange:'BINANCE',market:'CRYPTO',region:'CRYPTO',currency:'USDT',timezone:'UTC',assetType:'CRYPTO'};
const nvda={instrumentId:'NASDAQ:NVDA',symbol:'NVDA',exchange:'NASDAQ',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'};
const tsmc={instrumentId:'TWSE:2330',symbol:'2330',exchange:'TWSE',market:'TW',region:'TW',currency:'TWD',timezone:'Asia/Taipei',assetType:'EQUITY'};

test('BTC NVDA and 2330 use the same workspace tabs',()=>{
  const values=[btc,nvda,tsmc].map(instrument=>buildWorkspace({instrument,asOf:1000}));
  assert.deepEqual(values[0].tabs,values[1].tabs);
  assert.deepEqual(values[1].tabs,values[2].tabs);
});

test('missing chart remains explicitly unavailable',()=>{
  const w=buildWorkspace({instrument:nvda,asOf:1000,snapshot:{price:100}});
  assert.equal(w.sections.CHART.state,'UNAVAILABLE');
  assert.equal(w.sections.CHART.data,null);
});

test('equity workspace refuses execution module',()=>{
  assert.throws(()=>buildWorkspace({instrument:nvda,asOf:1000,execution:{paperOnly:true,realOrderLock:true,readOnly:true}}),/EQUITY_EXECUTION_FORBIDDEN/);
});

test('crypto workspace can expose read-only execution beside research context',()=>{
  const execution={paperOnly:true,realOrderLock:true,readOnly:true,state:'PAPER_ONLY'};
  const w=buildWorkspace({instrument:btc,asOf:1000,execution,analysis:{strategy:'A'}});
  assert.equal(w.execution,execution);
  assert.equal(w.sections.ANALYSIS.state,'AVAILABLE');
});