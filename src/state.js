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
    rows: MARKET_SYMBOLS.map(({ icon, display }) => [icon, display, '—', null])
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
  paper: emptyPaperSnapshot(),
  results: emptyResultsSnapshot(),
  backtest: emptyBacktestSnapshot(),
  ui: {
    search: '',
    assetClass: 'crypto',
    marketSort: 'popular',
    homeSection: 'market',
    strategyFilter: 'all',
    labTab: 'forward',
    calendarOpen: false,
    focusAnalysisIndex: null,
    selectedStrongSymbol: null,
    selectedSymbol: null,
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
