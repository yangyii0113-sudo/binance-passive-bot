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
const { loadStrategySnapshot, normalizeSnapshot: normalizeStrategySnapshot } = await import('../src/services/strategy.js');
const { loadPaperSnapshot, normalizePaperSnapshot } = await import('../src/services/paper.js');
const { loadResultsSnapshot, normalizeResultsSnapshot } = await import('../src/services/results.js');
const { loadBacktestSnapshot, normalizeBacktestSnapshot } = await import('../src/services/backtest.js');
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
assert.equal(strategy.status, STATUS.EMPTY, 'Missing Strategy source must be EMPTY');
assert.equal(paper.status, STATUS.EMPTY, 'Missing Paper source must be EMPTY');
assert.equal(results.status, STATUS.EMPTY, 'Missing Results source must be EMPTY');
assert.equal(backtest.status, STATUS.EMPTY, 'Missing Backtest source must be EMPTY');

const runtimePayload = {
  schema: 'foxyya-runtime-snapshot/1',
  status: 'PAPER_ONLY',
  real_orders: false,
  served_at: 1789631700000,
  initial_nav_usdt: 1000,
  books: {
    '5x': {
      balance: 1010,
      equity: 1012,
      positions: {
        p1: { position_id: 'p1', symbol: 'BTCUSDT', side: 'LONG', entry_fill: 76000, qty: 0.01, stop: 75000 }
      },
      fees_usdt: 2,
      funding_usdt: 0,
      realized_pnl_usdt: 12,
      margin_usage_usdt: 150
    }
  },
  candidates: [
    { symbol: 'BTCUSDT', side: 'LONG', family: 'A', status: 'ARMED', reason: null }
  ],
  pending: [
    { intent_id: 'i1', symbol: 'ETHUSDT', side: 'SHORT', family: 'B', reference_price: 2450, stop: 2490, scheduled_open_ms: 1789632000000, overdue: false }
  ],
  trades: [
    { position_id: 't1', symbol: 'BTCUSDT', side: 'LONG', closed: true, net_pnl_usdt: 20, realized_r: 1.0 },
    { position_id: 't2', symbol: 'ETHUSDT', side: 'SHORT', closed: true, net_pnl_usdt: -10, realized_r: -0.5 },
    { position_id: 't3', symbol: 'SOLUSDT', side: 'LONG', closed: false, net_pnl_usdt: 3, realized_r: null }
  ],
  reserved_risk_fraction: 0.012
};

let runtimeStrategy = null;
try { runtimeStrategy = normalizeStrategySnapshot(runtimePayload); } catch (_) {}
assert.equal(runtimeStrategy?.items?.length, 2, 'Runtime candidates + pending intents must become Strategy items');
assert.equal(runtimeStrategy?.items?.[0]?.symbol, 'BTCUSDT');
assert.equal(runtimeStrategy?.items?.[1]?.statusLabel, '等待進場');

const runtimePaper = normalizePaperSnapshot(runtimePayload);
assert.equal(runtimePaper.summary.nav, 1012, 'Paper NAV must come from 5x equity');
assert.equal(runtimePaper.summary.cash, 1010, 'Paper cash must come from 5x balance');
assert.equal(runtimePaper.summary.openPositions, 1);
assert.equal(runtimePaper.summary.pendingOrders, 1);
assert.equal(runtimePaper.summary.unrealizedPnl, 2);
assert.equal(runtimePaper.summary.portfolioRiskPct, 1.2);

const runtimeResults = normalizeResultsSnapshot(runtimePayload);
assert.equal(runtimeResults.summary.trades, 2, 'Only closed trades count in Forward Results');
assert.equal(runtimeResults.summary.winRatePct, 50);
assert.equal(runtimeResults.summary.expectancyR, 0.25);
assert.equal(runtimeResults.summary.profitFactor, 2);
assert.equal(runtimeResults.summary.netPnl, 10);
assert.equal(runtimeResults.summary.maxDrawdownPct, null, 'Do not fabricate drawdown when runtime snapshot has no equity history');

const backtestPayload = {
  status: 'OK',
  mode: 'HISTORICAL BACKTEST',
  run_config: { symbol: 'ETHUSDT', strategy_version: 'PB-1.0.0' },
  metrics: {
    performance: {
      closed_trades: 12,
      win_rate: 0.5,
      net_return: 0.08,
      expectancy_r: 0.1,
      profit_factor: 1.2,
      max_drawdown: 0.04
    },
    equity_curve: [{ time_ms: 1, balance: 1000 }, { time_ms: 2, balance: 1080 }]
  },
  report: {}
};
const normalizedBacktest = normalizeBacktestSnapshot(backtestPayload);
assert.equal(normalizedBacktest.input.symbol, 'ETHUSDT');
assert.equal(normalizedBacktest.result.trades, 12);
assert.equal(normalizedBacktest.result.winRatePct, 50);
assert.equal(normalizedBacktest.result.netReturnPct, 8);
assert.equal(normalizedBacktest.result.maxDrawdownPct, 4);
assert.equal(normalizedBacktest.equityCurve.length, 2);

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
console.log('snapshot sources: missing -> EMPTY');
console.log('runtime bridge: strategy/paper/results/backtest canonicalization');
console.log('routes: 5/5');
console.log('page renderers: 5/5');
