import { MARKET_CACHE_KEY } from './config.js';

export function readMarketCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MARKET_CACHE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.rows) || !parsed.updatedAt) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function writeMarketCache(snapshot) {
  try {
    localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(snapshot));
  } catch (_) {
    // Cache failure must never break the app shell.
  }
}
