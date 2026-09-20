import { emptyResultsSnapshot } from '../contracts.js';
import { STATUS } from '../status.js';
import { loadRuntimeSnapshot } from './runtime.js';
import { localResultsSnapshot } from '../local_paper.js';

function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCanonicalResults(payload) {
  const rawSummary = payload.summary || {};
  return {
    status: STATUS.LIVE,
    local: false,
    updatedAt: payload.updatedAt || payload.updated_at || new Date().toISOString(),
    summary: {
      trades: num(rawSummary.trades, 0),
      winRatePct: numOrNull(rawSummary.winRatePct ?? rawSummary.win_rate_pct),
      expectancyR: numOrNull(rawSummary.expectancyR ?? rawSummary.expectancy_r),
      profitFactor: numOrNull(rawSummary.profitFactor ?? rawSummary.profit_factor),
      netPnl: num(rawSummary.netPnl ?? rawSummary.net_pnl, 0),
      maxDrawdownPct: numOrNull(rawSummary.maxDrawdownPct ?? rawSummary.max_drawdown_pct)
    },
    navCurve: Array.isArray(payload.navCurve) ? payload.navCurve : Array.isArray(payload.nav_curve) ? payload.nav_curve : [],
    recentTrades: Array.isArray(payload.recentTrades) ? payload.recentTrades : Array.isArray(payload.recent_trades) ? payload.recent_trades : []
  };
}

function profitFactor(values) {
  const wins = values.filter((v) => v > 0).reduce((sum, v) => sum + v, 0);
  const losses = Math.abs(values.filter((v) => v < 0).reduce((sum, v) => sum + v, 0));
  if (losses === 0) return null;
  return wins / losses;
}

function normalizeRuntimeResults(payload) {
  const trades = Array.isArray(payload?.trades) ? payload.trades : [];
  const closed = trades.filter((trade) => trade?.closed === true);
  const netValues = closed.map((trade) => num(trade.net_pnl_usdt, 0));
  const rValues = closed.map((trade) => numOrNull(trade.realized_r)).filter((value) => value !== null);
  const wins = netValues.filter((value) => value > 0).length;
  return {
    status: STATUS.LIVE,
    local: false,
    updatedAt: payload?.served_at ? new Date(payload.served_at).toISOString() : new Date().toISOString(),
    summary: {
      trades: closed.length,
      winRatePct: closed.length ? (wins / closed.length) * 100 : null,
      expectancyR: rValues.length ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length : null,
      profitFactor: profitFactor(netValues),
      netPnl: netValues.reduce((sum, value) => sum + value, 0),
      maxDrawdownPct: null
    },
    navCurve: [],
    recentTrades: closed.slice(-20).reverse()
  };
}

export function normalizeResultsSnapshot(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Results Snapshot payload');
  if (payload.schema === 'foxyya-runtime-snapshot/1' || payload.trades) return normalizeRuntimeResults(payload);
  return normalizeCanonicalResults(payload);
}

export async function loadResultsSnapshot({ allowLocal = false } = {}) {
  try {
    const payload = await loadRuntimeSnapshot();
    if (payload === null) return allowLocal ? localResultsSnapshot() : emptyResultsSnapshot();
    return normalizeResultsSnapshot(payload);
  } catch (error) {
    if (allowLocal) return { ...localResultsSnapshot(), upstreamError: error };
    const empty = emptyResultsSnapshot();
    return { ...empty, status: STATUS.ERROR, error };
  }
}

export { normalizeRuntimeResults };
