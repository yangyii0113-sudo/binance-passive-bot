'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Vol=require('../v12/providers/twelve_data_volatility_adapter.js');

const receivedAt=Date.parse('2026-09-15T02:00:00Z');
const observedAt=receivedAt-5000;
const payload=Object.freeze({symbol:'VIX',name:'CBOE Volatility Index',exchange:'CBOE',timestamp:Math.floor(observedAt/1000),last_quote_at:Math.floor(observedAt/1000),open:'17.20',high:'18.10',low:'16.95',close:'17.84',previous_close:'17.30',change:'0.54',percent_change:'3.121'});

test('Twelve Data volatility index normalizes into US market context with provider time preserved',()=>{
  const result=Vol.normalizeVolatilityIndex(payload,{expectedSymbol:'VIX',receivedAt});
  assert.equal(result.schemaVersion,'foxyya-us-volatility-context/1');
  assert.equal(result.entityId,'INDEX:US:VOLATILITY:VIX');
  assert.equal(result.providerSymbol,'VIX');
  assert.equal(result.observedAt,observedAt);
  assert.equal(result.receivedAt,receivedAt);
  assert.equal(result.marketScope,'VIX_LIKE_INDEX_CONTEXT');
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
  const facts=Object.fromEntries(result.observations.map(x=>[x.field,x]));
  assert.equal(facts['volatility.index.level'].value,17.84);
  assert.equal(facts['volatility.index.level'].unit,'INDEX');
  assert.equal(facts['volatility.index.change_pct'].value,3.121);
  assert.equal(facts['volatility.index.change_pct'].unit,'PCT');
  assert.ok(result.observations.every(x=>x.scope==='US'&&x.entityId==='INDEX:US:VOLATILITY:VIX'&&x.observedAt===observedAt&&x.receivedAt===receivedAt&&x.source===Vol.SOURCE));
});

test('Twelve Data volatility adapter fails closed on symbol mismatch, future provider time, or missing level',()=>{
  assert.throws(()=>Vol.normalizeVolatilityIndex({...payload,symbol:'VIX1D'},{expectedSymbol:'VIX',receivedAt}),/VOLATILITY_SYMBOL_MISMATCH/);
  assert.throws(()=>Vol.normalizeVolatilityIndex({...payload,last_quote_at:Math.floor((receivedAt+60_000)/1000)},{expectedSymbol:'VIX',receivedAt}),/VOLATILITY_TIME_INVALID/);
  assert.throws(()=>Vol.normalizeVolatilityIndex({...payload,close:null},{expectedSymbol:'VIX',receivedAt}),/VOLATILITY_LEVEL_REQUIRED/);
});

test('volatility adapter is research-only context and does not expose execution semantics',()=>{
  assert.equal(Vol.descriptor.id,'twelve-data-us-volatility');
  assert.deepEqual(Vol.descriptor.capabilities,['VOLATILITY_INDEX']);
  assert.equal(Vol.descriptor.executionWrite,false);
  assert.equal(Vol.descriptor.serverOnly,true);
  assert.doesNotMatch(JSON.stringify(Vol.descriptor).toLowerCase(),/order|execute|fill|position/);
});
