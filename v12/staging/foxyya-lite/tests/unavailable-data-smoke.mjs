import assert from 'node:assert/strict';
import { emptyPaperSnapshot, emptyResultsSnapshot } from '../src/contracts.js';
import { loadPaperSnapshot, normalizePaperSnapshot } from '../src/services/paper.js';
import { loadResultsSnapshot, normalizeResultsSnapshot } from '../src/services/results.js';
import { resetRuntimeBridgeForTests } from '../src/services/runtime.js';
import { ordersPage, resultsPage, backtestPage } from '../src/pages.js';

// Exercise the actual read-only HTTP -> adapter -> renderer path.
for (const failure of ['404', '503', 'offline', 'malformed-json', 'invalid-object']) {
  resetRuntimeBridgeForTests();
  globalThis.fetch = async () => {
    if (failure === 'offline') throw new Error('offline');
    return {
      status: Number(failure) || 200,
      ok: !['404', '503'].includes(failure),
      json: async () => {
        if (failure === 'malformed-json') throw new SyntaxError('Invalid JSON');
        return {};
      }
    };
  };
  const [paper, results] = await Promise.all([loadPaperSnapshot(), loadResultsSnapshot()]);
  assert.equal(paper.status, failure === '404' ? 'EMPTY' : 'ERROR', failure);
  assert.equal(results.status, paper.status, failure);
  for (const snapshot of [paper, results]) {
    assert.ok(Object.values(snapshot.summary).every((value) => value === null), failure);
    assert.equal(snapshot.updatedAt, null, 'No invented freshness timestamp');
  }
  const orders = ordersPage({ paper });
  const history = resultsPage({ results });
  assert.match(orders, /持倉狀態尚未驗證/);
  assert.match(history, /交易績效尚未完成帳本驗證/);
  for (const html of [orders, history]) {
    assert.doesNotMatch(html, /\$100,000|\$1,000|\$0|0\.00%|<strong>0<\/strong>|目前沒有模擬持倉/);
    assert.doesNotMatch(html, />null<|>undefined</);
  }
  for (const safety of ['PAPER_ONLY', 'REAL_ORDER_LOCK', 'No Backfill']) assert.ok(orders.includes(safety));
}

// Partial data cannot use initial NAV, empty collections or missing metrics as proof.
const partial = normalizePaperSnapshot({ schema: 'foxyya-runtime-snapshot/1', initial_nav_usdt: 1000, books: { '5x': {} } });
assert.ok(Object.values(partial.summary).every((value) => value === null));
assert.equal(partial.updatedAt, null);
assert.match(ordersPage({ paper: partial }), /正式交易帳本尚未驗證/);
assert.doesNotMatch(ordersPage({ paper: partial }), /\$1,000|\$100,000|快照回報零持倉/);

for (const missing of [null, undefined, '', ' ', false, {}, []]) {
  const paper = normalizePaperSnapshot({ summary: { nav: missing, cash: missing } });
  const results = normalizeResultsSnapshot({ summary: { netPnl: missing, trades: missing } });
  assert.equal(paper.summary.nav, null);
  assert.equal(paper.summary.cash, null);
  assert.equal(results.summary.netPnl, null);
  assert.equal(results.summary.trades, null);
}

const incompleteTrades = normalizeResultsSnapshot({ schema: 'foxyya-runtime-snapshot/1', trades: [
  { closed: true, net_pnl_usdt: 20, realized_r: 1 },
  { closed: true, net_pnl_usdt: null, realized_r: null }
] });
assert.equal(incompleteTrades.summary.trades, 2);
for (const key of ['netPnl', 'winRatePct', 'profitFactor', 'expectancyR']) assert.equal(incompleteTrades.summary[key], null);
assert.throws(() => normalizePaperSnapshot({ schema: 'foxyya-runtime-snapshot/1' }));
assert.throws(() => normalizeResultsSnapshot({ schema: 'foxyya-runtime-snapshot/1' }));

// Reported zero remains zero, explicitly labelled as an unaudited snapshot.
const zeroPaper = normalizePaperSnapshot({ summary: { nav: 0, cash: 0, openPositions: 0, pendingOrders: 0, unrealizedPnl: 0, portfolioRiskPct: 0 } });
assert.equal(zeroPaper.summary.nav, 0);
assert.match(ordersPage({ paper: zeroPaper }), /\$0/);
assert.match(ordersPage({ paper: zeroPaper }), /快照回報零持倉（尚未對帳）/);
const zeroResults = normalizeResultsSnapshot({ schema: 'foxyya-runtime-snapshot/1', trades: [] });
assert.equal(zeroResults.summary.trades, 0);
assert.equal(zeroResults.summary.netPnl, 0);
assert.equal(zeroResults.summary.winRatePct, null);
assert.doesNotMatch(resultsPage({ results: zeroResults }), /0\.00%/);

// Rendering must conceal stale/error values even if an older state survives.
for (const status of ['ERROR', 'STALE', 'EMPTY', 'LOADING']) {
  assert.doesNotMatch(ordersPage({ paper: { ...zeroPaper, status } }), /\$0|快照回報零持倉/);
  assert.doesNotMatch(resultsPage({ results: { ...zeroResults, status } }), /\$0|<strong>0<\/strong>/);
}
assert.ok(Object.values(emptyPaperSnapshot().summary).every((value) => value === null));
assert.ok(Object.values(emptyResultsSnapshot().summary).every((value) => value === null));
assert.match(backtestPage({ backtest: { result: null } }), /<button[^>]*disabled[^>]*>開始測試（尚未開放）/);
console.log('UNAVAILABLE_DATA_SMOKE_OK');
console.log('HTTP failures, missing fields, partial trades, real zero values, stale values, safety labels and unavailable backtest control verified');
