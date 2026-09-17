import { MARKET_REFRESH_MS } from './config.js';
import { appState, setMarketState } from './state.js';
import { cachedMarketSnapshot, loadMarketSnapshot } from './market.js';
import { pages } from './pages.js';
import { currentRoute, markActiveNav } from './router.js';

function render() {
  const route = currentRoute();
  const page = pages[route] || pages.home;
  document.getElementById('app').innerHTML = page(appState);
  markActiveNav(route, Boolean(pages[route]));
}

async function refreshMarket() {
  const snapshot = await loadMarketSnapshot();
  setMarketState(snapshot);
  if (snapshot.error) {
    console.warn('[FOXYYA] market refresh failed', snapshot.error);
  }
  render();
}

function init() {
  const cached = cachedMarketSnapshot();
  if (cached) setMarketState(cached);
  render();
  refreshMarket();
  setInterval(refreshMarket, MARKET_REFRESH_MS);
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', init);
