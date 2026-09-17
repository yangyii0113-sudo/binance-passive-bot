export const MARKET_SYMBOLS = Object.freeze([
  { symbol: 'BTCUSDT', icon: '₿', display: 'BTC / USDT' },
  { symbol: 'ETHUSDT', icon: '◆', display: 'ETH / USDT' },
  { symbol: 'SOLUSDT', icon: 'S', display: 'SOL / USDT' }
]);

export const MARKET_CACHE_KEY = 'foxyya.market.v1';
export const MARKET_REFRESH_MS = 30_000;
export const MARKET_TIMEOUT_MS = 7_000;
export const MARKET_SOURCE = 'BINANCE USD-M';

export const STRATEGY_ENDPOINT = '/api/strategy';
export const SNAPSHOT_TIMEOUT_MS = 5_000;
