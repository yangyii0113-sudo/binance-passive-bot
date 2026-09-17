import { STATUS } from './status.js';

export function emptyStrategySnapshot() {
  return { status: STATUS.EMPTY, updatedAt: null, items: [] };
}

export function emptyPaperSnapshot() {
  return {
    status: STATUS.EMPTY,
    updatedAt: null,
    summary: {
      nav: 100000,
      cash: 100000,
      openPositions: 0,
      pendingOrders: 0,
      unrealizedPnl: 0,
      portfolioRiskPct: 0
    },
    positions: [],
    pending: []
  };
}

export function emptyResultsSnapshot() {
  return {
    status: STATUS.EMPTY,
    updatedAt: null,
    summary: {
      trades: 0,
      winRatePct: null,
      expectancyR: null,
      profitFactor: null,
      netPnl: 0,
      maxDrawdownPct: 0
    },
    navCurve: [],
    recentTrades: []
  };
}

export function emptyBacktestSnapshot() {
  return {
    status: STATUS.EMPTY,
    updatedAt: null,
    input: null,
    result: null,
    equityCurve: []
  };
}
