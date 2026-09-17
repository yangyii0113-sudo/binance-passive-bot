import { SNAPSHOT_ENDPOINTS } from '../config.js';
import { emptyBacktestSnapshot } from '../contracts.js';
import { STATUS } from '../status.js';
import { fetchSnapshotJson } from './http.js';

export function normalizeBacktestSnapshot(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Backtest Snapshot payload');

  return {
    status: STATUS.LIVE,
    updatedAt: payload.updatedAt || payload.updated_at || new Date().toISOString(),
    input: payload.input || null,
    result: payload.result || null,
    equityCurve: Array.isArray(payload.equityCurve) ? payload.equityCurve : Array.isArray(payload.equity_curve) ? payload.equity_curve : []
  };
}

export async function loadBacktestSnapshot() {
  try {
    const payload = await fetchSnapshotJson(SNAPSHOT_ENDPOINTS.backtest);
    if (payload === null) return emptyBacktestSnapshot();
    return normalizeBacktestSnapshot(payload);
  } catch (error) {
    const empty = emptyBacktestSnapshot();
    return { ...empty, status: STATUS.ERROR, error };
  }
}
