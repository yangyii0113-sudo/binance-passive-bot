import { MARKET_SYMBOLS } from './config.js';

const FAVORITES_KEY = 'foxyya.lite.favorites.v1';
const supportedSymbols = MARKET_SYMBOLS.map((item) => item.display);

export function createViewState() {
  let favorites = [];
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    if (Array.isArray(saved)) favorites = supportedSymbols.filter((symbol) => saved.includes(symbol));
  } catch (_) { /* Storage is optional; navigation and market data remain usable. */ }
  return { marketQuery: '', marketFilter: 'all', strategyQuery: '', strategyFilter: 'all', eventTab: 'news', favorites, preferenceNotice: '' };
}

export function toggleFavorite(view, symbol) {
  if (!supportedSymbols.includes(symbol)) return;
  view.favorites = view.favorites.includes(symbol)
    ? view.favorites.filter((item) => item !== symbol)
    : [...view.favorites, symbol];
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(view.favorites));
    view.preferenceNotice = '收藏已儲存在此瀏覽器。';
  } catch (_) {
    view.preferenceNotice = '瀏覽器無法儲存收藏；本次開啟期間仍可使用。';
  }
}

function searchable(value) {
  return String(value || '').toUpperCase().replace(/[\s/]+/g, '');
}

export function selectMarketRows(rows, view) {
  const query = searchable(view.marketQuery);
  const selected = rows.filter((row) => searchable(row[1]).includes(query)
    && (view.marketFilter !== 'favorites' || view.favorites.includes(row[1])));
  if (view.marketFilter === 'gainers' || view.marketFilter === 'losers') {
    const direction = view.marketFilter === 'gainers' ? -1 : 1;
    selected.sort((a, b) => {
      if (!Number.isFinite(a[3])) return Number.isFinite(b[3]) ? 1 : 0;
      if (!Number.isFinite(b[3])) return -1;
      return direction * (a[3] - b[3]);
    });
  }
  return selected;
}

function strategyGroup(item) {
  const status = String(item.status || '').toUpperCase();
  if (['ARMED', 'PENDING'].includes(status) || item.statusLabel === '等待進場') return 'pending';
  if (['REJECTED', 'CANCELLED', 'EXPIRED', 'INVALIDATED'].includes(status) || item.statusLabel === '已失效') return 'invalid';
  if (['WATCH', 'WATCHING'].includes(status) || item.statusLabel === '觀察中') return 'watch';
  return 'other';
}

export function selectStrategyItems(items, view) {
  const query = searchable(view.strategyQuery);
  return items.filter((item) => searchable(`${item.symbol} ${item.strategy} ${item.direction}`).includes(query)
    && (view.strategyFilter === 'all' || strategyGroup(item) === view.strategyFilter));
}
