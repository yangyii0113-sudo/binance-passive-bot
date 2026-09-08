const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../v12/providers/provider_contract.js');

test('read-only market provider descriptor is valid', () => {
  const r = P.validateProviderDescriptor({
    id:'binance-public', sourceLabel:'Binance USD-M Public',
    markets:['CRYPTO'], capabilities:['QUOTE','KLINE','DERIVATIVES'],
    transport:'PUBLIC_READ_ONLY', executionWrite:false, priority:10
  });
  assert.equal(r.ok, true);
});

test('execution-write provider is forbidden', () => {
  const r = P.validateProviderDescriptor({
    id:'bad', sourceLabel:'Bad', markets:['CRYPTO'], capabilities:['QUOTE'],
    transport:'PUBLIC_READ_ONLY', executionWrite:true, priority:1
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('EXECUTION_WRITE_FORBIDDEN'));
});

test('unknown market and capability are rejected', () => {
  const r = P.validateProviderDescriptor({
    id:'bad2', sourceLabel:'Bad2', markets:['MARS'], capabilities:['TELEPATHY'],
    transport:'PUBLIC_READ_ONLY', executionWrite:false, priority:1
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('MARKET_INVALID'));
  assert.ok(r.errors.includes('CAPABILITY_INVALID'));
});