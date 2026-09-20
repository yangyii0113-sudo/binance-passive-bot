import { MARKET_REFRESH_MS } from './config.js';
import { appState, setMarketState, setStateSlice } from './state.js';
import { cachedMarketSnapshot, loadMarketSnapshot } from './market.js';
import { loadStrategySnapshot } from './services/strategy.js';
import { loadPaperSnapshot } from './services/paper.js';
import { loadResultsSnapshot } from './services/results.js';
import { loadBacktestSnapshot } from './services/backtest.js';
import { openLocalPaperPosition, closeLocalPaperPosition } from './local_paper.js';
import { runLiteBacktest, BACKTEST_RANGE_OPTIONS, normalizeTimeframe } from './local_backtest.js';
import { loadCandidatePool, upsertCandidate, removeCandidate, updateCandidate } from './candidate_pool.js';
import { loadResearchHistory, appendResearchRun, researchExport } from './research_history.js';
import { analyzeMultiTimeframe } from './multi_timeframe.js';
import { evaluatePortfolioRisk } from './risk_gate.js';
import { evaluateStrategyGuard } from './strategy_guard.js';
import { validationSpecForMatch, researchDecision } from './research_pipeline.js';
import { STATUS } from './status.js';
import { pages, strongTopFive } from './pages.js';
import { currentRoute, markActiveNav } from './router.js';

function syncCandidates() {
  const book = loadCandidatePool();
  setStateSlice('candidates', {
    status: book.items.length ? STATUS.LIVE : STATUS.EMPTY,
    updatedAt: book.updatedAt,
    items: book.items
  });
}

function syncResearchHistory() {
  const history = loadResearchHistory();
  const current = appState.agents?.topFiveResearch;
  const nextAgents = { researchHistory: history };

  if (
    current?.status === STATUS.EMPTY &&
    history.runs?.length
  ) {
    const latest = history.runs[0];
    nextAgents.topFiveResearch = {
      status: STATUS.STALE,
      restored: true,
      startedAt: latest.startedAt,
      updatedAt: latest.completedAt,
      progress: latest.rows.length,
      total: latest.total || latest.rows.length,
      rows: latest.rows,
      error: null
    };
  }

  setStateSlice('agents', nextAgents);
}

function candidateBySymbol(symbol) {
  const target = String(symbol || '').toUpperCase();
  return (appState.candidates?.items || []).find(item => item.symbol === target) || null;
}

let renderedContext = null;
function render() {
  const route = currentRoute();
  const context = [route, appState.ui.strategyWorkspace, appState.ui.agentKey,
    appState.ui.labTab, appState.ui.selectedSymbol].join(':');
  const root = document.getElementById('app');
  // Market updates must not reset a user's order/backtest inputs or collapse research details.
  const controls = context === renderedContext
    ? [...root.querySelectorAll('form [name]')].map(el => ({
        form:el.form.id, name:el.name, value:el.value,
        label:el.selectedOptions?.[0]?.textContent,
        focused:el === document.activeElement,
        start:el.selectionStart, end:el.selectionEnd
      })) : [];
  const openDetails = context === renderedContext
    ? [...root.querySelectorAll('details[open]')].map(el => el.dataset.search || el.className) : [];
  const page = pages[route] || pages.home;
  root.innerHTML = page(appState);
  renderedContext = context;
  const findControl = saved => [...(document.getElementById(saved.form)?.elements || [])].find(el=>el.name===saved.name);
  for (const saved of controls.filter(x=>x.name==='timeframe')) {
    const el = findControl(saved);
    if (el) { el.value = saved.value; syncBacktestRangeSelect(el); }
  }
  for (const saved of controls) {
    const el = findControl(saved);
    if (!el) continue;
    if (el.tagName === 'SELECT' && ![...el.options].some(option=>option.value===saved.value)) {
      if (saved.name !== 'symbol') continue;
      const option = document.createElement('option');
      option.value = saved.value;
      option.textContent = saved.label || saved.value;
      el.append(option);
    }
    el.value = saved.value;
    if (saved.focused) {
      el.focus({preventScroll:true});
      if (saved.start != null && typeof el.setSelectionRange === 'function') el.setSelectionRange(saved.start,saved.end);
    }
  }
  for (const el of root.querySelectorAll('details')) {
    if (openDetails.includes(el.dataset.search || el.className)) el.open = true;
  }
  markActiveNav(route, Boolean(pages[route]));
  const search = document.getElementById('global-search');
  if (search && search.value !== appState.ui.search) search.value = appState.ui.search;
  applySearch(appState.ui.search);
}

function navigateTo(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

async function syncPaperAndResults() {
  const [paper, results] = await Promise.all([
    loadPaperSnapshot({ marketRows: paperMarketRows() }),
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
    ['paper', () => loadPaperSnapshot({ marketRows: paperMarketRows() })],
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

function syncBacktestRangeSelect(timeframeSelect) {
  const form = timeframeSelect?.closest?.('form');
  const rangeSelect = form?.querySelector?.('select[name="range"]');
  if (!rangeSelect) return;
  const timeframe = normalizeTimeframe(timeframeSelect.value);
  const options = BACKTEST_RANGE_OPTIONS[timeframe] || BACKTEST_RANGE_OPTIONS['1h'];
  const previous = rangeSelect.value;
  rangeSelect.innerHTML = options.map(([value,label]) =>
    `<option value="${value}">${label}</option>`
  ).join('');
  if (options.some(([value]) => value === previous)) rangeSelect.value = previous;
}

function batchStrategyMatch(baseMatch, technical){
  const consensus = String(technical?.consensus || '');
  if(consensus === '多週期偏多' || consensus === '多週期偏空') return 'Trend';
  return baseMatch || 'Momentum Watch';
}

async function handleTopFiveResearch(){
  if(appState.agents?.topFiveResearch?.status === STATUS.LOADING) return;

  const topFive = strongTopFive(appState);
  if(!topFive.length){
    appState.ui.message = '目前沒有可執行的動態前五名標的';
    render();
    return;
  }

  const startedAt = new Date().toISOString();
  const initialRows = topFive.map(({row,evidence},index)=>({
    rank:index + 1,
    symbol:String(row?.[1] || '').replace(/\s|\//g,''),
    researchScore:evidence.composite,
    marketScore:evidence.marketScore,
    tradabilityStatus:evidence.tradabilityStatus,
    baseStrategyMatch:evidence.strategyMatch,
    strategyMatch:evidence.strategyMatch,
    technical:null,
    spec:null,
    backtest:null,
    guard:{label:'待驗證',tone:'pending'},
    risk:null,
    decision:{label:'PENDING',tone:'pending'},
    status:'PENDING',
    error:null
  }));

  setStateSlice('agents',{
    topFiveResearch:{
      status:STATUS.LOADING,
      restored:false,
      startedAt,
      updatedAt:startedAt,
      progress:0,
      total:initialRows.length,
      rows:initialRows,
      error:null
    }
  });
  appState.ui.message = `動態前五名研究啟動：0 / ${initialRows.length}`;
  render();

  const rows = [...initialRows];

  for(let index=0; index<rows.length; index++){
    const row = {...rows[index], status:'RUNNING'};
    rows[index] = row;
    setStateSlice('agents',{
      topFiveResearch:{
        status:STATUS.LOADING,
        startedAt,
        updatedAt:new Date().toISOString(),
        progress:index,
        total:rows.length,
        rows:[...rows],
        error:null
      }
    });
    appState.ui.message = `研究 ${row.symbol}：${index + 1} / ${rows.length}`;
    render();

    try{
      let technical = null;
      let technicalError = null;
      try{
        technical = await analyzeMultiTimeframe(row.symbol);
      }catch(error){
        technicalError = String(error?.message || error);
      }

      const strategyMatch = batchStrategyMatch(row.baseStrategyMatch, technical);
      const spec = validationSpecForMatch(strategyMatch);
      let backtest = null;
      let guard = {label:'待驗證',tone:'pending',reason:'未執行基準回測'};
      let backtestError = null;

      if(spec.supported){
        try{
          backtest = await runLiteBacktest({
            symbol:row.symbol,
            range:spec.range,
            strategy:spec.strategy,
            timeframe:spec.timeframe
          });
          guard = evaluateStrategyGuard(backtest.result);
        }catch(error){
          backtestError = String(error?.message || error);
          guard = {label:'ERROR',tone:'review',reason:backtestError};
        }
      }else{
        guard = {label:'RESEARCH',tone:'pending',reason:spec.reason};
      }

      const direction = technical?.consensus || 'UNKNOWN';
      const risk = evaluatePortfolioRisk({
        symbol:row.symbol,
        signal:{direction}
      }, appState.paper);
      const decision = researchDecision({technical,guard,risk,spec});

      rows[index] = {
        ...row,
        strategyMatch,
        technical,
        technicalError,
        spec,
        backtest,
        guard,
        risk,
        decision,
        status:'DONE',
        error:backtestError
      };
    }catch(error){
      rows[index] = {
        ...row,
        status:'ERROR',
        error:String(error?.message || error),
        decision:{label:'ERROR',tone:'review'}
      };
    }

    setStateSlice('agents',{
      topFiveResearch:{
        status:STATUS.LOADING,
        startedAt,
        updatedAt:new Date().toISOString(),
        progress:index + 1,
        total:rows.length,
        rows:[...rows],
        error:null
      }
    });
    render();
  }

  const completedAt = new Date().toISOString();
  setStateSlice('agents',{
    topFiveResearch:{
      status:STATUS.LIVE,
      startedAt,
      updatedAt:completedAt,
      progress:rows.length,
      total:rows.length,
      rows,
      error:null
    }
  });
  appendResearchRun({
    id:completedAt,
    startedAt,
    completedAt,
    total:rows.length,
    rows
  });
  syncResearchHistory();
  const validated = rows.filter(item=>item.decision?.label === 'VALIDATED').length;
  appState.ui.message = `動態前五名研究完成：${rows.length} 組，已驗證 ${validated} 組`;
  render();
}

function promoteResearchCandidate(symbol){
  const target = String(symbol || '').toUpperCase();
  const research = (appState.agents?.topFiveResearch?.rows || []).find(item=>item.symbol === target);
  if(!research) throw new Error('找不到研究結果');

  upsertCandidate({
    symbol:target,
    assetClass:'crypto',
    source:'動態前五名研究',
    reason:`${research.decision?.label || '研究中'} · ${research.strategyMatch || '策略匹配'} · ${research.guard?.label || '未驗證'}`,
    signal:{
      status:research.decision?.label || '研究中',
      score:Number(research.researchScore) || null,
      direction:research.technical?.consensus || null
    }
  });

  const patch = {};
  if(research.technical) patch.technical = research.technical;
  if(research.backtest){
    patch.validator = {
      status:'LIVE',
      updatedAt:research.backtest.updatedAt,
      input:research.backtest.input,
      result:research.backtest.result
    };
  }
  if(research.risk) patch.risk = research.risk;
  if(Object.keys(patch).length) updateCandidate(target,patch);
  syncCandidates();
}

function paperMarketRows() {
  return [...(appState.market.universeRows || []), ...(appState.market.rows || [])];
}
function requireFreshPaperMarket() {
  const age = Date.now() - Date.parse(appState.market.updatedAt);
  if (!appState.paper.local) throw new Error('此持倉來源僅供查閱，請使用本機模擬模式');
  if (appState.market.status !== STATUS.LIVE || !Number.isFinite(age) || age < 0 || age > MARKET_REFRESH_MS * 2) {
    throw new Error('市場資料尚未更新或已過期，請待行情恢復後再操作模擬持倉');
  }
  return paperMarketRows();
}
let paperOpenPending = false;
async function handlePaperOpen(form) {
  if (paperOpenPending) return;
  paperOpenPending = true;
  const data = new FormData(form);
  try {
    openLocalPaperPosition({
      symbol: data.get('symbol'),
      side: data.get('side'),
      leverage: Number(data.get('leverage')),
      margin: Number(data.get('margin')),
      marketRows: requireFreshPaperMarket()
    });
    appState.ui.message = '模擬倉位已建立（僅模擬交易）';
    await syncPaperAndResults();
    render();
  } catch (error) {
    appState.ui.message = error?.message || '模擬下單失敗';
    render();
  } finally {
    paperOpenPending = false;
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

  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('[data-research-history-select]')) {
      appState.ui.researchHistoryId = event.target.value;
      render();
      document.querySelector('[data-research-history-select]')?.focus({preventScroll:true});
      return;
    }
    if (event.target?.matches?.('select[name="timeframe"]')) {
      syncBacktestRangeSelect(event.target);
    }
  });

  document.addEventListener('click', async (event) => {
    const historyExport = event.target.closest?.('[data-history-export]');
    if (historyExport && !historyExport.disabled) {
      try {
        const history = appState.agents.researchHistory;
        const id = history.runs.find(run=>run.id === appState.ui.researchHistoryId)?.id || history.runs[0]?.id;
        const file = researchExport(history,{format:historyExport.dataset.historyExport,id});
        const url = URL.createObjectURL(new Blob([file.text],{type:file.mime}));
        const link = document.createElement('a');
        link.href = url; link.download = file.filename;
        document.body.append(link); link.click(); link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        appState.ui.message = `已產生 ${file.filename}，請查看瀏覽器下載項目。`;
      } catch (error) {
        appState.ui.message = error?.message || '研究匯出失敗';
      }
      render();
      return;
    }
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
      navigateTo('#/lab');
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
    const topFiveResearchRun = event.target.closest?.('[data-top5-research-run]');
    if (topFiveResearchRun) {
      await handleTopFiveResearch();
      return;
    }
    const researchPromote = event.target.closest?.('[data-research-promote]');
    if (researchPromote) {
      try {
        promoteResearchCandidate(researchPromote.dataset.researchPromote);
        appState.ui.message = `${researchPromote.dataset.researchPromote} 已從研究結果升格為候選`;
      } catch (error) {
        appState.ui.message = error?.message || '升格候選失敗';
      }
      render();
      return;
    }
    const agentTechnicalRun = event.target.closest?.('[data-agent-technical-run]');
    if (agentTechnicalRun) {
      const form = document.getElementById('agent-technical-form');
      const data = form ? new FormData(form) : null;
      const symbol = data?.get('symbol');
      if (!symbol) return;
      appState.ui.message = `${symbol} 多週期技術分析中…`;
      render();
      try {
        const technical = await analyzeMultiTimeframe(symbol);
        setStateSlice('agents', { technical });
        appState.ui.message = `${symbol} 技術分析：${technical.consensus}`;
      } catch (error) {
        setStateSlice('agents', { technical: { symbol, status: 'ERROR', error: String(error?.message || error) } });
        appState.ui.message = `技術分析失敗：${error?.message || '未知錯誤'}`;
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
        upsertCandidate({ symbol, assetClass: 'crypto', source: '手動加入', reason: '候選池手動加入' });
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
        const technical = appState.agents?.technical;
        if (
          String(candidateAdd.dataset.candidateSource || '').startsWith('Technical Analyst') &&
          technical?.status === 'LIVE' &&
          technical?.symbol === symbol
        ) {
          updateCandidate(symbol, { technical });
        }
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
        appState.ui.message = `${symbol} 曝險檢查：${risk.status === 'PASS' ? '通過' : risk.status === 'CAUTION' ? '注意' : risk.status === 'BLOCKED' ? '阻擋' : risk.status}`;
      }
      render();
      return;
    }
    const candidateValidate = event.target.closest?.('[data-candidate-validate]');
    if (candidateValidate) {
      const symbol = candidateValidate.dataset.candidateValidate;
      if (!candidateBySymbol(symbol)) {
        upsertCandidate({
          symbol,
          assetClass: 'crypto',
          source: '策略驗證',
          reason: '由策略驗證建立候選，等待歷史回測驗證'
        });
        syncCandidates();
      }
      appState.ui.selectedSymbol = symbol;
      appState.ui.validatorTargetSymbol = symbol;
      appState.ui.labTab = 'backtest';
      appState.ui.message = `已帶入 ${symbol}；完成回測後結果會回寫候選池。`;
      navigateTo('#/lab');
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
      navigateTo('#/orders');
      return;
    }
    const useBacktest = event.target.closest?.('[data-use-backtest]');
    if (useBacktest) {
      appState.ui.selectedSymbol = useBacktest.dataset.useBacktest;
      appState.ui.validatorTargetSymbol = null;
      appState.ui.labTab = 'backtest';
      appState.ui.message = `已帶入 ${appState.ui.selectedSymbol}，可直接設定期間與策略開始回測。`;
      navigateTo('#/lab');
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
      navigateTo('#/strategies');
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
        closeLocalPaperPosition(close.dataset.paperClose, requireFreshPaperMarket());
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

function ensureValidRouteOnFreshOpen() {
  if (!location.hash) {
    history.replaceState(null, '', `${location.pathname}${location.search}#/`);
    return;
  }
  const route = currentRoute();
  if (!pages[route]) {
    history.replaceState(null, '', `${location.pathname}${location.search}#/`);
  }
}

function init() {
  ensureValidRouteOnFreshOpen();
  const cached = cachedMarketSnapshot();
  if (cached) setMarketState(cached);
  syncCandidates();
  syncResearchHistory();
  initEvents();
  render();
  refreshMarket();
  loadIndependentSnapshots();
  setInterval(refreshMarket, MARKET_REFRESH_MS);
}

window.addEventListener('hashchange', () => { render(); window.scrollTo({top:0, behavior:'instant'}); });
window.addEventListener('DOMContentLoaded', init);
