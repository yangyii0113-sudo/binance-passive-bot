const test=require('node:test');
const assert=require('node:assert/strict');
const W=require('../v12/workspace/contracts.js');

test('workspace tabs are fixed across markets',()=>{
  assert.deepEqual(W.WORKSPACE_TABS,['OVERVIEW','CHART','ANALYSIS','MARKET_DATA','NEWS','HISTORY']);
});

test('equity workspace contract rejects execution module',()=>{
  const value={market:'US',instrumentId:'NASDAQ:NVDA',tabs:W.WORKSPACE_TABS,sections:{},asOf:1,researchOnly:true,execution:{state:'OPEN'}};
  assert.equal(W.validateWorkspace(value).ok,false);
});

test('crypto workspace may contain read-only paper execution',()=>{
  const value={market:'CRYPTO',instrumentId:'BINANCE:BTCUSDT',tabs:W.WORKSPACE_TABS,sections:{},asOf:1,researchOnly:false,execution:{paperOnly:true,realOrderLock:true,readOnly:true}};
  assert.equal(W.validateWorkspace(value).ok,true);
});