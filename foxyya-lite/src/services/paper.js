import { SNAPSHOT_ENDPOINTS } from '../config.js';
import { emptyPaperSnapshot } from '../contracts.js';
import { STATUS } from '../status.js';
import { fetchSnapshotJson } from './http.js';

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizePaperSnapshot(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Paper Snapshot payload');
  const rawSummary = payload.summary || {};

  return {
    status: STATUS.LIVE,
    updatedAt: payload.updatedAt || payload.updated_at || new Date().toISOString(),
    summary: {
      nav: num(rawSummary.nav, 100000),
      cash: num(rawSummary.cash, 100000),
      openPositions: num(rawSummary.openPositions ?? rawSummary.open_positions, 0),
      pendingOrders: num(rawSummary.pendingOrders ?? rawSummary.pending_orders, 0),
      unrealizedPnl: num(rawSummary.unrealizedPnl ?? rawSummary.unrealized_pnl, 0),
      portfolioRiskPct: num(rawSummary.portfolioRiskPct ?? rawSummary.portfolio_risk_pct, 0)
    },
    positions: Array.isArray(payload.positions) ? payload.positions : [],
    pending: Array.isArray(payload.pending) ? payload.pending : Array.isArray(payload.pending_orders) ? payload.pending_orders : []
  };
}

export async function loadPaperSnapshot() {
  try {
    const payload = await fetchSnapshotJson(SNAPSHOT_ENDPOINTS.paper);
    if (payload === null) return emptyPaperSnapshot();
    return normalizePaperSnapshot(payload);
  } catch (error) {
    const empty = emptyPaperSnapshot();
    return { ...empty, status: STATUS.ERROR, error };
  }
}
