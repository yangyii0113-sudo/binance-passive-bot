export const MARKET_SYMBOLS = Object.freeze([
  { symbol: 'BTCUSDT', icon: '₿', display: 'BTC / USDT' },
  { symbol: 'ETHUSDT', icon: '◆', display: 'ETH / USDT' },
  { symbol: 'SOLUSDT', icon: 'S', display: 'SOL / USDT' }
]);

export const MARKET_CACHE_KEY = 'foxyya.market.v1';
export const MARKET_REFRESH_MS = 30_000;
export const MARKET_TIMEOUT_MS = 7_000;
export const MARKET_SOURCE = 'BINANCE USD-M';

export const SNAPSHOT_TIMEOUT_MS = 5_000;
export const RUNTIME_BRIDGE_CACHE_MS = 2_000;
export const RUNTIME_ENDPOINTS = Object.freeze({
  snapshot: '/api/runtime/snapshot',
  backtestLatest: '/api/backtest/latest'
});

// Reserved for a future canonical backend. Lite currently bridges the existing
// read-only runtime endpoints into these canonical client-side snapshots.
export const SNAPSHOT_ENDPOINTS = Object.freeze({
  strategy: '/api/strategy',
  paper: '/api/paper',
  results: '/api/results',
  backtest: '/api/backtest'
});
