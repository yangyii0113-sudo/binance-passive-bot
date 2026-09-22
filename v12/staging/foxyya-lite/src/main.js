import { MARKET_REFRESH_MS } from './config.js';
import { appState, setMarketState, setStateSlice } from './state.js';
import { cachedMarketSnapshot, loadMarketSnapshot } from './market.js';
import { loadStrategySnapshot } from './services/strategy.js';
import { loadPaperSnapshot } from './services/paper.js';
import { loadResultsSnapshot } from './services/results.js';
import { loadBacktestSnapshot } from './services/backtest.js';
import { pages } from './pages.js';
import { currentRoute, markActiveNav } from './router.js';
import { toggleFavorite } from './view.js';

function render() {
  const route = currentRoute();
  const page = pages[route] || pages.home;
  const app = document.getElementById('app');
  const focused = app.contains(document.activeElement) ? document.activeElement : null;
  const focusAction = focused?.dataset.action;
  const focusValue = focused?.dataset.value;
  app.innerHTML = page(appState);
  markActiveNav(route, Boolean(pages[route]));
  const searchable = page === pages.home || page === pages.strategies;
  document.getElementById('search-form').hidden = !searchable;
  if (searchable) {
    const strategySearch = page === pages.strategies;
    const searchInput = document.getElementById('market-search');
    const value = appState.view[strategySearch ? 'strategyQuery' : 'marketQuery'];
    if (searchInput.value !== value) searchInput.value = value;
    searchInput.placeholder = strategySearch ? '幣種、策略名稱或方向' : 'BTC、ETH、SOL';
    document.getElementById('search-label').textContent = strategySearch ? '搜尋策略快照' : '搜尋行情幣種';
  }
  if (focusAction) {
    const target = Array.from(app.querySelectorAll('[data-action]')).find((element) =>
      element.dataset.action === focusAction && element.dataset.value === focusValue);
    (target || app.querySelector('[aria-pressed="true"]'))?.focus({ preventScroll: true });
  }
}

async function refreshMarket() {
  const snapshot = await loadMarketSnapshot();
  setMarketState(snapshot);
  if (snapshot.error) {
    console.warn('[FOXYYA] market refresh failed', snapshot.error);
  }
  if (!pages[currentRoute()] || currentRoute() === 'home') render();
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
  document.getElementById('search-form').addEventListener('submit', (event) => event.preventDefault());
  document.getElementById('market-search').addEventListener('input', (event) => {
    const key = currentRoute() === 'strategies' ? 'strategyQuery' : 'marketQuery';
    appState.view[key] = event.target.value;
    render();
  });
  document.getElementById('search-clear').addEventListener('click', () => {
    const key = currentRoute() === 'strategies' ? 'strategyQuery' : 'marketQuery';
    appState.view[key] = '';
    render();
    document.getElementById('market-search').focus();
  });
  document.getElementById('app').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const { action, value } = button.dataset;
    if (action === 'market-filter' && ['all', 'favorites', 'gainers', 'losers'].includes(value)) appState.view.marketFilter = value;
    else if (action === 'strategy-filter' && ['all', 'watch', 'pending', 'invalid'].includes(value)) appState.view.strategyFilter = value;
    else if (action === 'event-tab' && ['news', 'calendar'].includes(value)) appState.view.eventTab = value;
    else if (action === 'favorite') toggleFavorite(appState.view, decodeURIComponent(value));
    else return;
    render();
  });
  const cached = cachedMarketSnapshot();
  if (cached) setMarketState(cached);
  render();

  refreshMarket();
  loadIndependentSnapshots();
  setInterval(refreshMarket, MARKET_REFRESH_MS);
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', init);
