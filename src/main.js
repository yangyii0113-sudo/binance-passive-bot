import { MARKET_REFRESH_MS } from './config.js';
import { appState, setMarketState, setStateSlice } from './state.js';
import { cachedMarketSnapshot, loadMarketSnapshot } from './market.js';
import { loadStrategySnapshot } from './services/strategy.js';
import { loadPaperSnapshot } from './services/paper.js';
import { loadResultsSnapshot } from './services/results.js';
import { loadBacktestSnapshot } from './services/backtest.js';
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

async function loadIndependentSnapshots() {
  const loaders = [
    ['strategy', loadStrategySnapshot],
    ['paper', loadPaperSnapshot],
    ['results', loadResultsSnapshot],
    ['backtest', loadBacktestSnapshot]
  ];

  await Promise.all(loaders.map(async ([name, loader]) => {
    try {
      setStateSlice(name, await loader());
    } catch (error) {
      console.warn(`[FOXYYA] ${name} snapshot failed`, error);
    }
  }));
  render();
}

function init() {
  const cached = cachedMarketSnapshot();
  if (cached) setMarketState(cached);
  render();

  refreshMarket();
  loadIndependentSnapshots();
  setInterval(refreshMarket, MARKET_REFRESH_MS);
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', init);
