import { MARKET_SOURCE, MARKET_SYMBOLS } from './config.js';
import { STATUS } from './status.js';
import {
  emptyStrategySnapshot,
  emptyPaperSnapshot,
  emptyResultsSnapshot,
  emptyBacktestSnapshot
} from './contracts.js';

export const appState = {
  market: {
    status: STATUS.LOADING,
    source: MARKET_SOURCE,
    updatedAt: null,
    direction: '讀取中',
    sentiment: '讀取中',
    rows: MARKET_SYMBOLS.map(({ icon, display }) => [icon, display, '—', null]).slice(0,20),
    universeRows: MARKET_SYMBOLS.map(({ icon, display }) => [icon, display, '—', null, null, null]),
    universeSize: MARKET_SYMBOLS.length
  },
  stocks: {
    status: STATUS.EMPTY,
    source: '股票資料源待接',
    updatedAt: null,
    direction: '尚未接入',
    sentiment: '尚未接入',
    rows: []
  },
  strategy: emptyStrategySnapshot(),
  pullback: { loading: false, rows: [] },
  paper: emptyPaperSnapshot(),
  results: emptyResultsSnapshot(),
  backtest: emptyBacktestSnapshot(),
  candidates: {
    status: STATUS.EMPTY,
    updatedAt: null,
    items: []
  },
  agents: {
    technical: null,
    topFiveResearch: {
      status: STATUS.EMPTY,
      startedAt: null,
      updatedAt: null,
      progress: 0,
      total: 0,
      rows: [],
      error: null
    },
    researchHistory: {
      updatedAt: null,
      runs: []
    }
  },
  ui: {
    search: '',
    assetClass: 'crypto',
    marketSort: 'popular',
    homeSection: 'market',
    strategyFilter: 'all',
    strategyWorkspace: 'signals',
    strategyTimeframe: '1h',
    agentKey: 'market',
    agentFilter: 'strong',
    labTab: 'forward',
    calendarOpen: false,
    focusAnalysisIndex: null,
    selectedStrongSymbol: null,
    selectedSymbol: null,
    validatorTargetSymbol: null,
    researchHistoryId: null,
    message: ''
  }
};

export function setStateSlice(name, next) {
  if (!Object.prototype.hasOwnProperty.call(appState, name)) {
    throw new Error(`Unknown FOXYYA state slice: ${name}`);
  }
  Object.assign(appState[name], next);
}

export function setMarketState(next) {
  setStateSlice('market', next);
}
