import { SNAPSHOT_ENDPOINTS } from '../config.js';
import { emptyResultsSnapshot } from '../contracts.js';
import { STATUS } from '../status.js';
import { fetchSnapshotJson } from './http.js';

function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeResultsSnapshot(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Results Snapshot payload');
  const rawSummary = payload.summary || {};

  return {
    status: STATUS.LIVE,
    updatedAt: payload.updatedAt || payload.updated_at || new Date().toISOString(),
    summary: {
      trades: num(rawSummary.trades, 0),
      winRatePct: numOrNull(rawSummary.winRatePct ?? rawSummary.win_rate_pct),
      expectancyR: numOrNull(rawSummary.expectancyR ?? rawSummary.expectancy_r),
      profitFactor: numOrNull(rawSummary.profitFactor ?? rawSummary.profit_factor),
      netPnl: num(rawSummary.netPnl ?? rawSummary.net_pnl, 0),
      maxDrawdownPct: num(rawSummary.maxDrawdownPct ?? rawSummary.max_drawdown_pct, 0)
    },
    navCurve: Array.isArray(payload.navCurve) ? payload.navCurve : Array.isArray(payload.nav_curve) ? payload.nav_curve : [],
    recentTrades: Array.isArray(payload.recentTrades) ? payload.recentTrades : Array.isArray(payload.recent_trades) ? payload.recent_trades : []
  };
}

export async function loadResultsSnapshot() {
  try {
    const payload = await fetchSnapshotJson(SNAPSHOT_ENDPOINTS.results);
    if (payload === null) return emptyResultsSnapshot();
    return normalizeResultsSnapshot(payload);
  } catch (error) {
    const empty = emptyResultsSnapshot();
    return { ...empty, status: STATUS.ERROR, error };
  }
}
