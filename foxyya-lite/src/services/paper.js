import { emptyPaperSnapshot } from '../contracts.js';
import { STATUS } from '../status.js';
import { loadRuntimeSnapshot } from './runtime.js';

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCanonicalPaper(payload) {
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

function normalizeRuntimePaper(payload) {
  const book = payload?.books?.['5x'] || {};
  const positionsObject = book.positions && typeof book.positions === 'object' ? book.positions : {};
  const positions = Object.values(positionsObject);
  const pending = Array.isArray(payload?.pending) ? payload.pending : [];
  const initialNav = num(payload?.initial_nav_usdt, 1000);
  const cash = num(book.balance, initialNav);
  const nav = num(book.equity, cash);
  return {
    status: STATUS.LIVE,
    updatedAt: payload?.served_at ? new Date(payload.served_at).toISOString() : new Date().toISOString(),
    summary: {
      nav,
      cash,
      openPositions: positions.length,
      pendingOrders: pending.length,
      unrealizedPnl: nav - cash,
      portfolioRiskPct: num(payload?.reserved_risk_fraction, 0) * 100
    },
    positions,
    pending
  };
}

export function normalizePaperSnapshot(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Paper Snapshot payload');
  if (payload.schema === 'foxyya-runtime-snapshot/1' || payload.books) return normalizeRuntimePaper(payload);
  return normalizeCanonicalPaper(payload);
}

export async function loadPaperSnapshot() {
  try {
    const payload = await loadRuntimeSnapshot();
    if (payload === null) return emptyPaperSnapshot();
    return normalizePaperSnapshot(payload);
  } catch (error) {
    const empty = emptyPaperSnapshot();
    return { ...empty, status: STATUS.ERROR, error };
  }
}

export { normalizeRuntimePaper };
