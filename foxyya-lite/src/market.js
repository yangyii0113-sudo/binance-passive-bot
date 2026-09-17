import { MARKET_SYMBOLS, MARKET_TIMEOUT_MS } from './config.js';
import { readMarketCache, writeMarketCache } from './cache.js';
import { STATUS } from './status.js';

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = n >= 1000 ? 2 : n >= 1 ? 3 : 5;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function deriveMarketSummary(rows) {
  const changes = rows.map((row) => row[3]).filter(Number.isFinite);
  if (!changes.length) return { direction: '無資料', sentiment: '無資料' };
  const avg = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  return {
    direction: avg > 1.5 ? '偏多' : avg < -1.5 ? '偏空' : '震盪',
    sentiment: avg > 1 ? '積極' : avg < -1 ? '謹慎' : '中性'
  };
}

async function fetchTicker(symbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKET_TIMEOUT_MS);
  try {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const lastPrice = Number(data.lastPrice);
    const priceChangePercent = Number(data.priceChangePercent);
    if (!Number.isFinite(lastPrice) || !Number.isFinite(priceChangePercent)) {
      throw new Error('Invalid ticker payload');
    }
    return { symbol, lastPrice, priceChangePercent };
  } finally {
    clearTimeout(timeout);
  }
}

export function cachedMarketSnapshot() {
  const cached = readMarketCache();
  if (!cached) return null;
  const summary = deriveMarketSummary(cached.rows);
  return {
    status: STATUS.STALE,
    updatedAt: cached.updatedAt,
    rows: cached.rows,
    direction: cached.direction || summary.direction,
    sentiment: cached.sentiment || summary.sentiment
  };
}

export async function loadMarketSnapshot() {
  try {
    const tickers = await Promise.all(MARKET_SYMBOLS.map((item) => fetchTicker(item.symbol)));
    const rows = MARKET_SYMBOLS.map((item) => {
      const ticker = tickers.find((candidate) => candidate.symbol === item.symbol);
      return [item.icon, item.display, formatPrice(ticker.lastPrice), ticker.priceChangePercent];
    });
    const summary = deriveMarketSummary(rows);
    const snapshot = {
      status: STATUS.LIVE,
      updatedAt: new Date().toISOString(),
      rows,
      direction: summary.direction,
      sentiment: summary.sentiment
    };
    writeMarketCache(snapshot);
    return snapshot;
  } catch (error) {
    const cached = cachedMarketSnapshot();
    if (cached) return { ...cached, error };
    return {
      status: STATUS.ERROR,
      updatedAt: null,
      direction: '無資料',
      sentiment: '無資料',
      rows: MARKET_SYMBOLS.map(({ icon, display }) => [icon, display, '—', null]),
      error
    };
  }
}
