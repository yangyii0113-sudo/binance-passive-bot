export const CORE_MARKET_SYMBOLS = Object.freeze([
  { symbol: 'BTCUSDT', icon: '₿', display: 'BTC / USDT' },
  { symbol: 'ETHUSDT', icon: '◆', display: 'ETH / USDT' },
  { symbol: 'SOLUSDT', icon: 'S', display: 'SOL / USDT' }
]);

// Static fallback only. LIVE mode discovers a broader liquid USD-M universe
// directly from Binance 24h tickers and is not limited to this list.
export const MARKET_SYMBOLS = Object.freeze([
  ...CORE_MARKET_SYMBOLS,
  { symbol: 'BNBUSDT', icon: 'B', display: 'BNB / USDT' },
  { symbol: 'XRPUSDT', icon: 'X', display: 'XRP / USDT' },
  { symbol: 'DOGEUSDT', icon: 'D', display: 'DOGE / USDT' },
  { symbol: 'ADAUSDT', icon: 'A', display: 'ADA / USDT' },
  { symbol: 'LINKUSDT', icon: 'L', display: 'LINK / USDT' },
  { symbol: 'AVAXUSDT', icon: 'A', display: 'AVAX / USDT' },
  { symbol: 'SUIUSDT', icon: 'S', display: 'SUI / USDT' },
  { symbol: 'LTCUSDT', icon: 'L', display: 'LTC / USDT' },
  { symbol: 'BCHUSDT', icon: 'B', display: 'BCH / USDT' },
  { symbol: 'NEARUSDT', icon: 'N', display: 'NEAR / USDT' },
  { symbol: 'DOTUSDT', icon: 'D', display: 'DOT / USDT' },
  { symbol: 'APTUSDT', icon: 'A', display: 'APT / USDT' },
  { symbol: 'UNIUSDT', icon: 'U', display: 'UNI / USDT' },
  { symbol: 'TRXUSDT', icon: 'T', display: 'TRX / USDT' },
  { symbol: 'ARBUSDT', icon: 'A', display: 'ARB / USDT' },
  { symbol: 'OPUSDT', icon: 'O', display: 'OP / USDT' },
  { symbol: '1000PEPEUSDT', icon: 'P', display: '1000PEPE / USDT' }
]);

export const MARKET_MAX_ROWS = 20;
export const MARKET_LIQUIDITY_POOL = 40;
export const MARKET_CACHE_KEY = 'foxyya.market.v2';
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
