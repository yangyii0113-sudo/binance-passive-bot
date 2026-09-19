import { MARKET_REFRESH_MS } from './config.js';
import { appState, setMarketState, setStateSlice } from './state.js';
import { cachedMarketSnapshot, loadMarketSnapshot } from './market.js';
import { loadStrategySnapshot } from './services/strategy.js';
import { loadPaperSnapshot } from './services/paper.js';
import { loadResultsSnapshot } from './services/results.js';
import { loadBacktestSnapshot } from './services/backtest.js';
import { openLocalPaperPosition, closeLocalPaperPosition } from './local_paper.js';
import { runLiteBacktest } from './local_backtest.js';
import { loadCandidatePool, upsertCandidate, removeCandidate, updateCandidate } from './candidate_pool.js';
import { analyzeMultiTimeframe } from './multi_timeframe.js';
import { evaluatePortfolioRisk } from './risk_gate.js';
import { STATUS } from './status.js';
import { pages } from './pages.js';
import { currentRoute, markActiveNav } from './router.js';

function syncCandidates() {
  const book = loadCandidatePool();
  setStateSlice('candidates', {
    status: book.items.length ? STATUS.LIVE : STATUS.EMPTY,
    updatedAt: book.updatedAt,
    items: book.items
  });
}

function candidateBySymbol(symbol) {
  const target = String(symbol || '').toUpperCase();
  return (appState.candidates?.items || []).find(item => item.symbol === target) || null;
}

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
    const validatorTarget = appState.ui.validatorTargetSymbol;
    if (validatorTarget && validatorTarget === snapshot.input.symbol) {
      updateCandidate(validatorTarget, {
        validator: {
          status: 'LIVE',
          updatedAt: snapshot.updatedAt,
          input: snapshot.input,
          result: snapshot.result
        }
      });
      syncCandidates();
      appState.ui.validatorTargetSymbol = null;
    }
    appState.ui.message = `回測完成：${snapshot.input.samples} 根 K 線 / ${snapshot.result.trades} 筆交易`;
  } catch (error) {
    setStateSlice('backtest', {
      status: STATUS.ERROR,
      updatedAt: new Date().toISOString(),
      input: Object.fromEntries(data.entries()),
      result: null,
      equityCurve: [],
      error
    });
    appState.ui.message = `回測失敗：${error?.message || '未知錯誤'}`;
  }
  render();
}

function initEvents() {
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'global-search') applySearch(event.target.value);
  });

  document.addEventListener('click', async (event) => {
    const assetClass = event.target.closest?.('[data-asset-class]');
    if (assetClass) {
      appState.ui.assetClass = assetClass.dataset.assetClass;
      appState.ui.selectedStrongSymbol = null;
      appState.ui.marketSort = 'popular';
      render();
      applySearch(appState.ui.search);
      return;
    }
    const homeSection = event.target.closest?.('[data-home-section]');
    if (homeSection) {
      appState.ui.homeSection = homeSection.dataset.homeSection;
      render();
      applySearch(appState.ui.search);
      return;
    }
    const labTab = event.target.closest?.('[data-lab-tab]');
    if (labTab) {
      appState.ui.labTab = labTab.dataset.labTab;
      render();
      return;
    }
    const sort = event.target.closest?.('[data-market-sort]');
    if (sort) {
      appState.ui.marketSort = sort.dataset.marketSort;
      render();
      applySearch(appState.ui.search);
      return;
    }
    const strategyWorkspace = event.target.closest?.('[data-strategy-workspace]');
    if (strategyWorkspace) {
      appState.ui.strategyWorkspace = strategyWorkspace.dataset.strategyWorkspace;
      render();
      return;
    }
    const strategyTimeframe = event.target.closest?.('[data-strategy-timeframe]');
    if (strategyTimeframe) {
      appState.ui.strategyTimeframe = strategyTimeframe.dataset.strategyTimeframe;
      render();
      return;
    }
    const agentKey = event.target.closest?.('[data-agent-key]');
    if (agentKey) {
      appState.ui.agentKey = agentKey.dataset.agentKey;
      const defaults = {
        market: 'strong',
        technical: 'all',
        news: 'all',
        validator: 'all',
        risk: 'all',
        review: 'all',
        playbook: 'all'
      };
      appState.ui.agentFilter = defaults[appState.ui.agentKey] || 'all';
      render();
      return;
    }
    const agentFilter = event.target.closest?.('[data-agent-filter]');
    if (agentFilter) {
      appState.ui.agentFilter = agentFilter.dataset.agentFilter;
      render();
      return;
    }
    const agentTechnicalRun = event.target.closest?.('[data-agent-technical-run]');
    if (agentTechnicalRun) {
      const form = document.getElementById('agent-technical-form');
      const data = form ? new FormData(form) : null;
      const symbol = data?.get('symbol');
      if (!symbol) return;
      appState.ui.message = `${symbol} Technical Analyst 多週期分析中…`;
      render();
      try {
        const technical = await analyzeMultiTimeframe(symbol);
        setStateSlice('agents', { technical });
        appState.ui.message = `${symbol} Technical Analyst：${technical.consensus}`;
      } catch (error) {
        setStateSlice('agents', { technical: { symbol, status: 'ERROR', error: String(error?.message || error) } });
        appState.ui.message = `Technical Analyst 失敗：${error?.message || '未知錯誤'}`;
      }
      render();
      return;
    }
    const strategyFilter = event.target.closest?.('[data-strategy-filter]');
    if (strategyFilter) {
      appState.ui.strategyFilter = strategyFilter.dataset.strategyFilter;
      render();
      return;
    }
    const candidateManualAdd = event.target.closest?.('[data-candidate-manual-add]');
    if (candidateManualAdd) {
      const form = document.getElementById('candidate-manual-form');
      const data = form ? new FormData(form) : null;
      const symbol = data?.get('symbol');
      try {
        upsertCandidate({ symbol, assetClass: 'crypto', source: '手動加入', reason: 'Candidate Pool 手動加入' });
        syncCandidates();
        appState.ui.message = `${symbol} 已加入候選池`;
      } catch (error) {
        appState.ui.message = error?.message || '加入候選失敗';
      }
      render();
      return;
    }
    const candidateAdd = event.target.closest?.('[data-candidate-add]');
    if (candidateAdd) {
      const symbol = candidateAdd.dataset.candidateAdd;
      try {
        upsertCandidate({
          symbol,
          assetClass: candidateAdd.dataset.candidateAsset || 'crypto',
          source: candidateAdd.dataset.candidateSource || 'FOXYYA',
          reason: candidateAdd.dataset.candidateReason || '',
          signal: {
            status: candidateAdd.dataset.candidateStatus || null,
            score: candidateAdd.dataset.candidateScore ? Number(candidateAdd.dataset.candidateScore) : null,
            direction: candidateAdd.dataset.candidateDirection || null
          }
        });
        syncCandidates();
        appState.ui.message = `${symbol} 已加入候選池`;
      } catch (error) {
        appState.ui.message = error?.message || '加入候選失敗';
      }
      render();
      return;
    }
    const candidateRemove = event.target.closest?.('[data-candidate-remove]');
    if (candidateRemove) {
      removeCandidate(candidateRemove.dataset.candidateRemove);
      syncCandidates();
      appState.ui.message = `${candidateRemove.dataset.candidateRemove} 已移出候選池`;
      render();
      return;
    }
    const candidateAnalyze = event.target.closest?.('[data-candidate-analyze]');
    if (candidateAnalyze) {
      const symbol = candidateAnalyze.dataset.candidateAnalyze;
      appState.ui.message = `${symbol} 多週期技術分析中…`;
      render();
      try {
        const technical = await analyzeMultiTimeframe(symbol);
        updateCandidate(symbol, { technical });
        syncCandidates();
        appState.ui.message = `${symbol} 多週期分析完成：${technical.consensus}`;
      } catch (error) {
        appState.ui.message = `多週期分析失敗：${error?.message || '未知錯誤'}`;
      }
      render();
      return;
    }
    const candidateRisk = event.target.closest?.('[data-candidate-risk]');
    if (candidateRisk) {
      const symbol = candidateRisk.dataset.candidateRisk;
      const candidate = candidateBySymbol(symbol);
      if (candidate) {
        const risk = evaluatePortfolioRisk(candidate, appState.paper);
        updateCandidate(symbol, { risk });
        syncCandidates();
        appState.ui.message = `${symbol} Risk Gate：${risk.status}`;
      }
      render();
      return;
    }
    const candidateValidate = event.target.closest?.('[data-candidate-validate]');
    if (candidateValidate) {
      const symbol = candidateValidate.dataset.candidateValidate;
      appState.ui.selectedSymbol = symbol;
      appState.ui.validatorTargetSymbol = symbol;
      appState.ui.labTab = 'backtest';
      appState.ui.message = `已帶入 ${symbol}；完成回測後結果會回寫候選池。`;
      location.hash = '#/lab';
      return;
    }
    const strongCoin = event.target.closest?.('[data-strong-symbol]');
    if (strongCoin) {
      const symbol = strongCoin.dataset.strongSymbol;
      appState.ui.selectedStrongSymbol = appState.ui.selectedStrongSymbol === symbol ? null : symbol;
      render();
      if (appState.ui.selectedStrongSymbol) {
        setTimeout(() => document.getElementById('strong-coin-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
      }
      return;
    }
    const usePaper = event.target.closest?.('[data-use-paper]');
    if (usePaper) {
      appState.ui.selectedSymbol = usePaper.dataset.usePaper;
      appState.ui.message = `已帶入 ${appState.ui.selectedSymbol}，請設定方向、槓桿與模擬保證金。`;
      location.hash = '#/orders';
      return;
    }
    const useBacktest = event.target.closest?.('[data-use-backtest]');
    if (useBacktest) {
      appState.ui.selectedSymbol = useBacktest.dataset.useBacktest;
      appState.ui.labTab = 'backtest';
      appState.ui.message = `已帶入 ${appState.ui.selectedSymbol}，可直接設定期間與策略開始回測。`;
      location.hash = '#/lab';
      return;
    }
    const focus = event.target.closest?.('[data-focus-analysis]');
    if (focus) {
      const index = Number(focus.dataset.focusAnalysis);
      const next = appState.ui.focusAnalysisIndex === index ? null : index;
      appState.ui.focusAnalysisIndex = next;
      render();
      if (next !== null) {
        setTimeout(() => document.getElementById('focus-analysis-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      }
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
        appState.ui.message = '模擬持倉已平倉，交易結果已更新';
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
  if (location.hash !== '#/') {
    history.replaceState(null, '', `${location.pathname}${location.search}#/`);
  }
}

function init() {
  ensureHomeOnFreshOpen();
  const cached = cachedMarketSnapshot();
  if (cached) setMarketState(cached);
  syncCandidates();
  initEvents();
  render();
  refreshMarket();
  loadIndependentSnapshots();
  setInterval(refreshMarket, MARKET_REFRESH_MS);
}

window.addEventListener('hashchange', () => { render(); applySearch(appState.ui.search); });
window.addEventListener('DOMContentLoaded', init);
