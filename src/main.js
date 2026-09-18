import { MARKET_REFRESH_MS } from './config.js';
import { appState, setMarketState, setStateSlice } from './state.js';
import { cachedMarketSnapshot, loadMarketSnapshot } from './market.js';
import { loadStrategySnapshot } from './services/strategy.js';
import { loadPaperSnapshot } from './services/paper.js';
import { loadResultsSnapshot } from './services/results.js';
import { loadBacktestSnapshot } from './services/backtest.js';
import { openLocalPaperPosition, closeLocalPaperPosition } from './local_paper.js';
import { runLiteBacktest } from './local_backtest.js';
import { STATUS } from './status.js';
import { pages } from './pages.js';
import { currentRoute, markActiveNav } from './router.js';

function render() {
  const route = currentRoute();
  const page = pages[route] || pages.home;
  document.getElementById('app').innerHTML = page(appState);
  markActiveNav(route, Boolean(pages[route]));
  const search = document.getElementById('global-search');
  if (search && search.value !== appState.ui.search) search.value = appState.ui.search;
}

async function syncPaperAndResults() {
  const [paper, results] = await Promise.all([
    loadPaperSnapshot({ marketRows: appState.market.rows }),
    loadResultsSnapshot({ allowLocal: true })
  ]);
  setStateSlice('paper', paper);
  setStateSlice('results', results);
}

async function refreshMarket() {
  const snapshot = await loadMarketSnapshot();
  setMarketState(snapshot);
  if (snapshot.error) console.warn('[FOXYYA] market refresh failed', snapshot.error);
  await syncPaperAndResults();
  render();
}

async function loadIndependentSnapshots() {
  const tasks = [
    ['strategy', () => loadStrategySnapshot()],
    ['paper', () => loadPaperSnapshot({ marketRows: appState.market.rows })],
    ['results', () => loadResultsSnapshot({ allowLocal: true })],
    ['backtest', () => loadBacktestSnapshot()]
  ];
  await Promise.all(tasks.map(async ([name, loader]) => {
    try { setStateSlice(name, await loader()); }
    catch (error) { console.warn(`[FOXYYA] ${name} snapshot failed`, error); }
  }));
  render();
}

function applySearch(value) {
  const q = String(value || '').trim().toLowerCase();
  appState.ui.search = value;
  document.querySelectorAll('[data-search]').forEach((el) => {
    el.hidden = Boolean(q) && !String(el.dataset.search || '').toLowerCase().includes(q);
  });
}

async function handlePaperOpen(form) {
  const data = new FormData(form);
  try {
    openLocalPaperPosition({
      symbol: data.get('symbol'),
      side: data.get('side'),
      leverage: Number(data.get('leverage')),
      margin: Number(data.get('margin')),
      marketRows: appState.market.rows
    });
    appState.ui.message = '模擬倉位已建立（PAPER ONLY）';
    await syncPaperAndResults();
    render();
  } catch (error) {
    appState.ui.message = error?.message || '模擬下單失敗';
    render();
  }
}

async function handleBacktest(form) {
  const data = new FormData(form);
  setStateSlice('backtest', {
    status: STATUS.LOADING,
    updatedAt: new Date().toISOString(),
    input: Object.fromEntries(data.entries()),
    result: null,
    equityCurve: []
  });
  appState.ui.message = '歷史 K 線讀取與回測中…';
  render();
  try {
    const snapshot = await runLiteBacktest({
      symbol: data.get('symbol'),
      range: data.get('range'),
      strategy: data.get('strategy'),
      timeframe: data.get('timeframe')
    });
    setStateSlice('backtest', snapshot);
    appState.ui.message = `Backtest 完成：${snapshot.input.samples} 根 K 線 / ${snapshot.result.trades} 筆交易`;
  } catch (error) {
    setStateSlice('backtest', {
      status: STATUS.ERROR,
      updatedAt: new Date().toISOString(),
      input: Object.fromEntries(data.entries()),
      result: null,
      equityCurve: [],
      error
    });
    appState.ui.message = `Backtest 失敗：${error?.message || 'unknown error'}`;
  }
  render();
}

function initEvents() {
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'global-search') applySearch(event.target.value);
  });

  document.addEventListener('click', async (event) => {
    const sort = event.target.closest?.('[data-market-sort]');
    if (sort) {
      appState.ui.marketSort = sort.dataset.marketSort;
      render();
      applySearch(appState.ui.search);
      return;
    }
    const strategyFilter = event.target.closest?.('[data-strategy-filter]');
    if (strategyFilter) {
      appState.ui.strategyFilter = strategyFilter.dataset.strategyFilter;
      render();
      return;
    }
    const calendar = event.target.closest?.('[data-event-calendar]');
    if (calendar) {
      appState.ui.calendarOpen = !appState.ui.calendarOpen;
      render();
      if (appState.ui.calendarOpen) {
        setTimeout(() => document.getElementById('event-calendar-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      }
      return;
    }
    const goStrategies = event.target.closest?.('[data-go-strategies]');
    if (goStrategies) {
      location.hash = '#/strategies';
      return;
    }
    const open = event.target.closest?.('[data-paper-open]');
    if (open) {
      const form = document.getElementById('paper-order-form');
      if (form) await handlePaperOpen(form);
      return;
    }
    const close = event.target.closest?.('[data-paper-close]');
    if (close) {
      try {
        closeLocalPaperPosition(close.dataset.paperClose, appState.market.rows);
        appState.ui.message = '模擬持倉已平倉，Results 已更新';
        await syncPaperAndResults();
      } catch (error) {
        appState.ui.message = error?.message || '平倉失敗';
      }
      render();
      return;
    }
    const backtest = event.target.closest?.('[data-backtest-run]');
    if (backtest) {
      const form = document.getElementById('backtest-form');
      if (form) await handleBacktest(form);
    }
  });
}

function ensureHomeOnFreshOpen() {
  try {
    const key = 'foxyya.session.booted';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      if (location.hash !== '#/') {
        history.replaceState(null, '', `${location.pathname}${location.search}#/`);
      }
    }
  } catch (_) {
    if (!location.hash) location.hash = '#/';
  }
}

function init() {
  ensureHomeOnFreshOpen();
  const cached = cachedMarketSnapshot();
  if (cached) setMarketState(cached);
  initEvents();
  render();
  refreshMarket();
  loadIndependentSnapshots();
  setInterval(refreshMarket, MARKET_REFRESH_MS);
}

window.addEventListener('hashchange', () => { render(); applySearch(appState.ui.search); });
window.addEventListener('DOMContentLoaded', init);
