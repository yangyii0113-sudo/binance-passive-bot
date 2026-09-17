import { emptyBacktestSnapshot } from '../contracts.js';
import { STATUS } from '../status.js';
import { loadLatestBacktestPayload } from './runtime.js';

function percentFromRatio(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n * 100 : null;
}

export function normalizeBacktestSnapshot(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Backtest Snapshot payload');

  if (payload.metrics?.performance) {
    const p = payload.metrics.performance;
    return {
      status: STATUS.LIVE,
      updatedAt: payload.run_config?.end_ms ? new Date(payload.run_config.end_ms).toISOString() : new Date().toISOString(),
      input: payload.run_config || null,
      result: {
        trades: Number(p.closed_trades || 0),
        winRatePct: percentFromRatio(p.win_rate),
        expectancyR: p.expectancy_r == null ? null : Number(p.expectancy_r),
        profitFactor: p.profit_factor == null ? null : Number(p.profit_factor),
        netReturnPct: percentFromRatio(p.net_return),
        maxDrawdownPct: percentFromRatio(p.max_drawdown)
      },
      equityCurve: Array.isArray(payload.metrics.equity_curve) ? payload.metrics.equity_curve : []
    };
  }

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
    const payload = await loadLatestBacktestPayload();
    if (payload === null) return emptyBacktestSnapshot();
    return normalizeBacktestSnapshot(payload);
  } catch (error) {
    const empty = emptyBacktestSnapshot();
    return { ...empty, status: STATUS.ERROR, error };
  }
}
