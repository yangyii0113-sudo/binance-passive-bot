import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(){ this.map = new Map(); }
  getItem(key){ return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value){ this.map.set(key, String(value)); }
  removeItem(key){ this.map.delete(key); }
  clear(){ this.map.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.location = { hash: '#/' };
globalThis.document = {
  querySelectorAll(){ return []; },
  getElementById(){ return { innerHTML: '' }; }
};

globalThis.window = {
  addEventListener(){},
  removeEventListener(){}
};

const { STATUS } = await import('../src/status.js');
const { loadMarketSnapshot } = await import('../src/market.js');
const { loadStrategySnapshot } = await import('../src/services/strategy.js');
const { loadPaperSnapshot } = await import('../src/services/paper.js');
const { loadResultsSnapshot } = await import('../src/services/results.js');
const { loadBacktestSnapshot } = await import('../src/services/backtest.js');
const { emptyStrategySnapshot, emptyPaperSnapshot, emptyResultsSnapshot, emptyBacktestSnapshot } = await import('../src/contracts.js');
const { pages } = await import('../src/pages.js');
const { currentRoute } = await import('../src/router.js');

const marketPayloads = {
  BTCUSDT: { lastPrice: '76419.40', priceChangePercent: '0.880' },
  ETHUSDT: { lastPrice: '2442.26', priceChangePercent: '1.894' },
  SOLUSDT: { lastPrice: '99.9600', priceChangePercent: '3.137' }
};

globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  const symbol = parsed.searchParams.get('symbol');
  const payload = marketPayloads[symbol];
  if (!payload) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => payload };
};

const live = await loadMarketSnapshot();
assert.equal(live.status, STATUS.LIVE, 'Market must enter LIVE on valid Binance payloads');
assert.equal(live.rows.length, 3, 'Market must expose BTC/ETH/SOL only');
assert.equal(live.rows[0][1], 'BTC / USDT');
assert.equal(live.rows[1][1], 'ETH / USDT');
assert.equal(live.rows[2][1], 'SOL / USDT');

globalThis.fetch = async () => { throw new Error('offline'); };
const stale = await loadMarketSnapshot();
assert.equal(stale.status, STATUS.STALE, 'Market must degrade to STALE when Last Known Good exists');
assert.deepEqual(stale.rows, live.rows, 'STALE must retain Last Known Good rows');

localStorage.clear();
const error = await loadMarketSnapshot();
assert.equal(error.status, STATUS.ERROR, 'Market must enter ERROR when no cache exists');
assert.equal(error.rows.length, 3);
assert.equal(error.rows.every((row) => row[2] === '—'), true, 'ERROR must not fabricate prices');

globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const [strategy, paper, results, backtest] = await Promise.all([
  loadStrategySnapshot(), loadPaperSnapshot(), loadResultsSnapshot(), loadBacktestSnapshot()
]);
assert.equal(strategy.status, STATUS.EMPTY, 'Missing Strategy endpoint must be EMPTY');
assert.equal(paper.status, STATUS.EMPTY, 'Missing Paper endpoint must be EMPTY');
assert.equal(results.status, STATUS.EMPTY, 'Missing Results endpoint must be EMPTY');
assert.equal(backtest.status, STATUS.EMPTY, 'Missing Backtest endpoint must be EMPTY');

const renderState = {
  market: live,
  strategy: emptyStrategySnapshot(),
  paper: emptyPaperSnapshot(),
  results: emptyResultsSnapshot(),
  backtest: emptyBacktestSnapshot()
};

for (const [name, renderer] of Object.entries(pages)) {
  const html = renderer(renderState);
  assert.equal(typeof html, 'string', `${name} renderer must return HTML`);
  assert.ok(html.length > 20, `${name} renderer must return non-empty content`);
}

for (const [hash, route] of [
  ['#/', 'home'],
  ['#/strategies', 'strategies'],
  ['#/orders', 'orders'],
  ['#/results', 'results'],
  ['#/backtest', 'backtest']
]) {
  globalThis.location.hash = hash;
  assert.equal(currentRoute(), route, `Route ${hash} must resolve to ${route}`);
}

console.log('GATE_A_SMOKE_OK');
console.log('market: LIVE -> STALE -> ERROR');
console.log('snapshot endpoints: 404 -> EMPTY');
console.log('routes: 5/5');
console.log('page renderers: 5/5');
