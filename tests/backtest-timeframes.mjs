import assert from 'node:assert/strict';

const now = Date.now();

function fakeBatch(count = 80) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const openTime = now - (count - i) * 60_000;
    const closeTime = i === count - 1 ? now + 60_000 : openTime + 59_000;
    const close = 100 + i * 0.5;
    rows.push([openTime, close, close + 1, close - 1, close, 1000, closeTime]);
  }
  return rows;
}

globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  const interval = parsed.searchParams.get('interval');
  assert.ok(['15m','1h','4h','12h','1d','1w','1M'].includes(interval), `unexpected interval ${interval}`);
  return {
    ok: true,
    status: 200,
    json: async () => fakeBatch()
  };
};

const { runLiteBacktest, BACKTEST_RANGE_OPTIONS } = await import('../src/local_backtest.js');

const validRanges = {
  '15m':'30D',
  '1h':'90D',
  '4h':'180D',
  '12h':'1Y',
  '1d':'1Y',
  '1w':'3Y',
  '1M':'5Y'
};

for (const timeframe of ['15m','1h','4h','12h','1d','1w','1M']) {
  const snapshot = await runLiteBacktest({
    symbol:'BTCUSDT',
    range:validRanges[timeframe],
    strategy:'A',
    timeframe
  });
  assert.equal(snapshot.input.timeframe, timeframe, `timeframe ${timeframe} must be preserved`);
  assert.equal(snapshot.input.range, validRanges[timeframe], `timeframe ${timeframe} must retain a valid range`);
  assert.equal(snapshot.input.samples, 79, `timeframe ${timeframe} must exclude the still-open candle`);
  assert.equal(snapshot.result.expectancyR, null, 'EMA crossover must not fabricate R expectancy without a stop-risk definition');
  assert.ok(Number.isFinite(Number(snapshot.result.avgTradePct)), 'EMA crossover must expose average trade return percent');
  assert.equal(snapshot.result.validation.label, '交易樣本不足', '80 bars with one open bar removed should not be overstated');
}

assert.deepEqual(BACKTEST_RANGE_OPTIONS['1M'].map(([key])=>key), ['5Y','10Y']);
assert.equal(
  Object.values(BACKTEST_RANGE_OPTIONS).flat().some(([key])=>key === 'MAX'),
  false,
  'UI must not expose fake MAX range'
);
await assert.rejects(
  runLiteBacktest({symbol:'BTCUSDT',range:'90D',strategy:'A',timeframe:'1M'}),
  /1M 不支援 90D/,
  'monthly backtest must reject short ranges'
);

console.log('BACKTEST_TIMEFRAMES_OK');
console.log('timeframes: 15m/1h/4h/12h/1d/1w/1M');
console.log('timeframe-aware ranges: enforced');
console.log('fully closed bar: enforced');
console.log('validation tiers: enforced');


let futuresRequests = 0;
globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  if(parsed.hostname === 'fapi.binance.com'){
    futuresRequests++;
    return { ok:false, status:451, json: async () => ({}) };
  }
  assert.equal(parsed.hostname, 'data-api.binance.vision');
  return { ok:true, status:200, json: async () => fakeBatch() };
};
const fallbackSnapshot = await runLiteBacktest({
  symbol:'BTCUSDT',
  range:'90D',
  strategy:'A',
  timeframe:'1h'
});
assert.ok(futuresRequests >= 1, 'USD-M endpoint must be attempted first');
assert.equal(fallbackSnapshot.input.dataSource, 'Binance Spot public klines · fallback');
assert.equal(fallbackSnapshot.input.samples, 79, 'fallback must still enforce fully closed bars');
console.log('binance 451 fallback: enforced');


await assert.rejects(
  runLiteBacktest({symbol:'BTCUSDT',range:'MAX',strategy:'A',timeframe:'1M'}),
  /1M 不支援 MAX/,
  'engine must reject fake MAX range'
);
