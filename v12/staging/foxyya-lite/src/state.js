import { MARKET_SOURCE, MARKET_SYMBOLS } from './config.js';
import { STATUS } from './status.js';
import { createViewState } from './view.js';
import {
  emptyStrategySnapshot,
  emptyPaperSnapshot,
  emptyResultsSnapshot,
  emptyBacktestSnapshot
} from './contracts.js';

export const appState = {
  view: createViewState(),
  market: {
    status: STATUS.LOADING,
    source: MARKET_SOURCE,
    updatedAt: null,
    direction: '讀取中',
    sentiment: '讀取中',
    rows: MARKET_SYMBOLS.map(({ icon, display }) => [icon, display, '—', null])
  },
  strategy: emptyStrategySnapshot(),
  paper: emptyPaperSnapshot(),
  results: emptyResultsSnapshot(),
  backtest: emptyBacktestSnapshot()
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
