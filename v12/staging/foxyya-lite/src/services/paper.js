import { emptyPaperSnapshot } from '../contracts.js';
import { STATUS } from '../status.js';
import { loadRuntimeSnapshot } from './runtime.js';

function num(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCanonicalPaper(payload) {
  const rawSummary = payload.summary;
  if (!rawSummary || typeof rawSummary !== 'object' || Array.isArray(rawSummary)) {
    throw new Error('Missing Paper summary');
  }
  return {
    status: STATUS.LIVE,
    updatedAt: payload.updatedAt || payload.updated_at || null,
    summary: {
      nav: num(rawSummary.nav),
      cash: num(rawSummary.cash),
      openPositions: num(rawSummary.openPositions ?? rawSummary.open_positions),
      pendingOrders: num(rawSummary.pendingOrders ?? rawSummary.pending_orders),
      unrealizedPnl: num(rawSummary.unrealizedPnl ?? rawSummary.unrealized_pnl),
      portfolioRiskPct: num(rawSummary.portfolioRiskPct ?? rawSummary.portfolio_risk_pct)
    },
    positions: Array.isArray(payload.positions) ? payload.positions : [],
    pending: Array.isArray(payload.pending) ? payload.pending : Array.isArray(payload.pending_orders) ? payload.pending_orders : []
  };
}

function normalizeRuntimePaper(payload) {
  const book = payload?.books?.['5x'];
  if (!book || typeof book !== 'object' || Array.isArray(book)) throw new Error('Missing Paper book');
  const positionsKnown = book.positions !== null && typeof book.positions === 'object';
  const pendingKnown = Array.isArray(payload.pending);
  const positions = positionsKnown ? Object.values(book.positions) : [];
  const pending = pendingKnown ? payload.pending : [];
  const cash = num(book.balance);
  const nav = num(book.equity);
  const risk = num(payload.reserved_risk_fraction);
  return {
    status: STATUS.LIVE,
    updatedAt: payload?.served_at ? new Date(payload.served_at).toISOString() : null,
    summary: {
      nav,
      cash,
      openPositions: positionsKnown ? positions.length : null,
      pendingOrders: pendingKnown ? pending.length : null,
      unrealizedPnl: nav !== null && cash !== null ? nav - cash : null,
      portfolioRiskPct: risk === null ? null : risk * 100
    },
    positions,
    pending
  };
}

export function normalizePaperSnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid Paper Snapshot payload');
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
