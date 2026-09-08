const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../v12/core/market_core.js');

test('primary markets and regional coverage are explicit', () => {
  assert.deepEqual(M.PRIMARY_MARKETS, ['CRYPTO','US','TW']);
  assert.deepEqual(M.REGION_IDS, ['US','TW','CN_HK','JP','KR','EU','CRYPTO']);
});

test('instrument ids are exchange scoped', () => {
  assert.equal(M.instrumentId('TWSE','2330'), 'TWSE:2330');
  assert.equal(M.instrumentId('NASDAQ','NVDA'), 'NASDAQ:NVDA');
  assert.equal(M.instrumentId('BINANCE','BTCUSDT'), 'BINANCE:BTCUSDT');
});

test('instrument validates market identity and currency', () => {
  const result = M.validateInstrument({
    instrumentId:'TWSE:2330', symbol:'2330', exchange:'TWSE', market:'TW',
    region:'TW', currency:'TWD', timezone:'Asia/Taipei', assetType:'EQUITY'
  });
  assert.equal(result.ok, true);
});

test('instrument rejects cross-market identity mismatch', () => {
  const result = M.validateInstrument({
    instrumentId:'NASDAQ:NVDA', symbol:'NVDA', exchange:'NASDAQ', market:'TW',
    region:'TW', currency:'TWD', timezone:'Asia/Taipei', assetType:'EQUITY'
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('MARKET_MISMATCH'));
});