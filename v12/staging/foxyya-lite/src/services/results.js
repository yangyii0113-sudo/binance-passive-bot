import { emptyResultsSnapshot } from '../contracts.js';
import { STATUS } from '../status.js';
import { loadRuntimeSnapshot } from './runtime.js';

function numOrNull(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCanonicalResults(payload) {
  const rawSummary = payload.summary;
  if (!rawSummary || typeof rawSummary !== 'object' || Array.isArray(rawSummary)) {
    throw new Error('Missing Results summary');
  }
  return {
    status: STATUS.LIVE,
    updatedAt: payload.updatedAt || payload.updated_at || null,
    summary: {
      trades: numOrNull(rawSummary.trades),
      winRatePct: numOrNull(rawSummary.winRatePct ?? rawSummary.win_rate_pct),
      expectancyR: numOrNull(rawSummary.expectancyR ?? rawSummary.expectancy_r),
      profitFactor: numOrNull(rawSummary.profitFactor ?? rawSummary.profit_factor),
      netPnl: numOrNull(rawSummary.netPnl ?? rawSummary.net_pnl),
      maxDrawdownPct: numOrNull(rawSummary.maxDrawdownPct ?? rawSummary.max_drawdown_pct)
    },
    navCurve: Array.isArray(payload.navCurve) ? payload.navCurve : Array.isArray(payload.nav_curve) ? payload.nav_curve : [],
    recentTrades: Array.isArray(payload.recentTrades) ? payload.recentTrades : Array.isArray(payload.recent_trades) ? payload.recent_trades : []
  };
}

function profitFactor(values) {
  const wins = values.filter((v) => v > 0).reduce((sum, v) => sum + v, 0);
  const losses = Math.abs(values.filter((v) => v < 0).reduce((sum, v) => sum + v, 0));
  if (losses === 0) return wins > 0 ? null : null;
  return wins / losses;
}

function normalizeRuntimeResults(payload) {
  if (!Array.isArray(payload.trades)) throw new Error('Missing Results trades');
  const trades = payload.trades;
  const closed = trades.filter((trade) => trade?.closed === true);
  const netValues = closed.map((trade) => numOrNull(trade.net_pnl_usdt));
  const netComplete = netValues.every((value) => value !== null);
  const rValues = closed.map((trade) => numOrNull(trade.realized_r));
  const rComplete = rValues.every((value) => value !== null);
  const wins = netValues.filter((value) => value > 0).length;
  const totalNet = netComplete ? netValues.reduce((sum, value) => sum + value, 0) : null;
  return {
    status: STATUS.LIVE,
    updatedAt: payload?.served_at ? new Date(payload.served_at).toISOString() : null,
    summary: {
      trades: closed.length,
      winRatePct: closed.length && netComplete ? (wins / closed.length) * 100 : null,
      expectancyR: rValues.length && rComplete ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length : null,
      profitFactor: netComplete ? profitFactor(netValues) : null,
      netPnl: totalNet,
      maxDrawdownPct: null
    },
    navCurve: [],
    recentTrades: closed.slice(-20).reverse()
  };
}

export function normalizeResultsSnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid Results Snapshot payload');
  if (payload.schema === 'foxyya-runtime-snapshot/1' || payload.trades) return normalizeRuntimeResults(payload);
  return normalizeCanonicalResults(payload);
}

export async function loadResultsSnapshot() {
  try {
    const payload = await loadRuntimeSnapshot();
    if (payload === null) return emptyResultsSnapshot();
    return normalizeResultsSnapshot(payload);
  } catch (error) {
    const empty = emptyResultsSnapshot();
    return { ...empty, status: STATUS.ERROR, error };
  }
}

export { normalizeRuntimeResults };
