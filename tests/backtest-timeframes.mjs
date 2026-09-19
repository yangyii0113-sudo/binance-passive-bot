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

const { runLiteBacktest } = await import('../src/local_backtest.js');

for (const timeframe of ['15m','1h','4h','12h','1d','1w','1M']) {
  const snapshot = await runLiteBacktest({
    symbol:'BTCUSDT',
    range:'90D',
    strategy:'A',
    timeframe
  });
  assert.equal(snapshot.input.timeframe, timeframe, `timeframe ${timeframe} must be preserved`);
  assert.equal(snapshot.input.samples, 79, `timeframe ${timeframe} must exclude the still-open candle`);
}

console.log('BACKTEST_TIMEFRAMES_OK');
console.log('timeframes: 15m/1h/4h/12h/1d/1w/1M');
console.log('fully closed bar: enforced');
