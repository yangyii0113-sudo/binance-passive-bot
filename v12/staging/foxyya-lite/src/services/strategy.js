import { emptyStrategySnapshot } from '../contracts.js';
import { STATUS } from '../status.js';
import { loadRuntimeSnapshot } from './runtime.js';

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCanonicalItem(raw) {
  if (!raw || typeof raw !== 'object' || !raw.symbol || !raw.strategy) return null;
  return {
    symbol: String(raw.symbol),
    strategy: String(raw.strategy),
    direction: String(raw.direction || '觀察中'),
    status: String(raw.status || 'WATCH'),
    statusLabel: String(raw.statusLabel || raw.status_label || raw.status || '觀察中'),
    entry: numberOrNull(raw.entry),
    stop: numberOrNull(raw.stop),
    tp1: numberOrNull(raw.tp1),
    tp2: numberOrNull(raw.tp2),
    rr: numberOrNull(raw.rr),
    confidence: raw.confidence == null ? null : String(raw.confidence),
    note: raw.note == null ? '' : String(raw.note),
    updatedAt: raw.updatedAt || raw.updated_at || null
  };
}

function directionLabel(side) {
  return String(side || '').toUpperCase() === 'SHORT' ? '偏空觀察' : '偏多觀察';
}

function runtimeStatusLabel(status) {
  const value = String(status || 'WATCH').toUpperCase();
  if (value === 'ARMED' || value === 'PENDING') return '等待進場';
  if (value === 'REJECTED' || value === 'CANCELLED') return '已失效';
  return '觀察中';
}

function runtimeItem(raw, statusOverride = null) {
  if (!raw || typeof raw !== 'object' || !raw.symbol) return null;
  const status = String(statusOverride || raw.status || 'WATCH').toUpperCase();
  return {
    symbol: String(raw.symbol),
    strategy: String(raw.family || raw.strategy || raw.setup_family || 'Runtime'),
    direction: directionLabel(raw.side),
    status,
    statusLabel: runtimeStatusLabel(status),
    entry: numberOrNull(raw.entry ?? raw.reference_price ?? raw.entry_price ?? raw.trigger_price),
    stop: numberOrNull(raw.stop ?? raw.initial_stop),
    tp1: numberOrNull(raw.tp1 ?? raw.target_1),
    tp2: numberOrNull(raw.tp2 ?? raw.target_2),
    rr: numberOrNull(raw.rr ?? raw.reward_risk),
    confidence: raw.confidence == null ? null : String(raw.confidence),
    note: raw.reason ? String(raw.reason) : raw.overdue ? 'Pending intent 已逾期，等待 runtime 重新驗證。' : '',
    updatedAt: raw.updatedAt || raw.updated_at || raw.decision_persist_ms || raw.scheduled_open_ms || null
  };
}

function normalizeRuntimeSnapshot(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const pending = Array.isArray(payload?.pending) ? payload.pending : [];
  const items = [
    ...candidates.map((item) => runtimeItem(item)).filter(Boolean),
    ...pending.map((item) => runtimeItem(item, 'PENDING')).filter(Boolean)
  ];
  return {
    status: STATUS.LIVE,
    updatedAt: payload?.served_at ? new Date(payload.served_at).toISOString() : new Date().toISOString(),
    items
  };
}

function normalizeSnapshot(payload) {
  if (payload?.schema === 'foxyya-runtime-snapshot/1' || payload?.candidates || payload?.pending) {
    return normalizeRuntimeSnapshot(payload);
  }
  const itemsSource = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(itemsSource)) throw new Error('Invalid Strategy Snapshot payload');
  return {
    status: STATUS.LIVE,
    updatedAt: payload?.updatedAt || payload?.updated_at || new Date().toISOString(),
    items: itemsSource.map(normalizeCanonicalItem).filter(Boolean)
  };
}

export async function loadStrategySnapshot() {
  try {
    const payload = await loadRuntimeSnapshot();
    if (payload === null) return emptyStrategySnapshot();
    return normalizeSnapshot(payload);
  } catch (error) {
    const empty = emptyStrategySnapshot();
    return { ...empty, status: STATUS.ERROR, error };
  }
}

export { normalizeCanonicalItem as normalizeItem, normalizeSnapshot, normalizeRuntimeSnapshot };
