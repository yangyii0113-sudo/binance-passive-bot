import { STATUS } from './status.js';

export function emptyStrategySnapshot() {
  return { status: STATUS.EMPTY, updatedAt: null, items: [] };
}

export function emptyPaperSnapshot() {
  return {
    status: STATUS.EMPTY,
    updatedAt: null,
    summary: {
      nav: null,
      cash: null,
      openPositions: null,
      pendingOrders: null,
      unrealizedPnl: null,
      portfolioRiskPct: null
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
      trades: null,
      winRatePct: null,
      expectancyR: null,
      profitFactor: null,
      netPnl: null,
      maxDrawdownPct: null
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
