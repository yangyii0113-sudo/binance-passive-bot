import { STRATEGY_ENDPOINT, SNAPSHOT_TIMEOUT_MS } from '../config.js';
import { emptyStrategySnapshot } from '../contracts.js';
import { STATUS } from '../status.js';

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.symbol || !raw.strategy) return null;

  const numberOrNull = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

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

function normalizeSnapshot(payload) {
  const itemsSource = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(itemsSource)) throw new Error('Invalid Strategy Snapshot payload');

  return {
    status: STATUS.LIVE,
    updatedAt: payload?.updatedAt || payload?.updated_at || new Date().toISOString(),
    items: itemsSource.map(normalizeItem).filter(Boolean)
  };
}

export async function loadStrategySnapshot() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);

  try {
    const response = await fetch(STRATEGY_ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });

    if (response.status === 404) return emptyStrategySnapshot();
    if (!response.ok) throw new Error(`Strategy snapshot HTTP ${response.status}`);

    return normalizeSnapshot(await response.json());
  } catch (error) {
    const empty = emptyStrategySnapshot();
    return { ...empty, status: STATUS.ERROR, error };
  } finally {
    clearTimeout(timeout);
  }
}

export { normalizeItem, normalizeSnapshot };
