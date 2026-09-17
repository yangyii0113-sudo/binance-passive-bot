import { MARKET_SOURCE, MARKET_SYMBOLS } from './config.js';

export const STATUS = Object.freeze({
  LIVE: 'LIVE',
  STALE: 'STALE',
  ERROR: 'ERROR',
  LOADING: 'LOADING',
  EMPTY: 'EMPTY'
});

export const appState = {
  market: {
    status: STATUS.LOADING,
    source: MARKET_SOURCE,
    updatedAt: null,
    direction: '讀取中',
    sentiment: '讀取中',
    rows: MARKET_SYMBOLS.map(({ icon, display }) => [icon, display, '—', null])
  }
};

export function setMarketState(next) {
  Object.assign(appState.market, next);
}
