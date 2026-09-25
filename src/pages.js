import { trendOutlookView } from './trend_outlook_view.js';
import { smcReference } from './smc_reference.js';
import { agentTradePlanView } from './agent_trade_plan_view.js';
import { agentAdvicePanel, agentHistoryPanel } from './agent_workflow_view.js';
import { entryPlan, pullbackPanel } from './entry_plan.js';
import { mock } from './mock.js';
import { badge, metric, section, escapeHtml } from './ui.js';
import { evaluateStrategyGuard } from './strategy_guard.js';
import { researchHistoryPanel } from './research_history_view.js';
import { equityChart } from './equity_chart.js';
import { BACKTEST_VERSION, backtestAmountFields, backtestAmountNote } from './backtest_amounts.js';

import { displayStatus, displayText, displayStrategyMatch, displayTimeframe, displayRange } from './display.js';

function displayCandidateSource(value){ return displayText(value || '候選池'); }

function displaySide(value){
  const raw = String(value || '').toUpperCase();
  if(raw === 'LONG') return '做多';
  if(raw === 'SHORT') return '做空';
  return value || '—';
}
function displayMarketSource(value){
  return displayText(value || '—')
    .replaceAll('Binance USD-M Public Data','Binance U 本位永續合約公開資料')
    .replaceAll('Binance USD-M public klines','Binance U 本位永續合約公開 K 線')
    .replaceAll('Binance Spot public klines','Binance 現貨公開 K 線')
    .replaceAll('public klines','公開 K 線')
    .replaceAll('fallback','備援');
}
function displayExecutionModel(value){
  const raw = String(value || '—');
  if(raw === 'Fully Closed Signal → Next Bar Open') return '完整收盤訊號 → 下一根 K 棒開盤';
  return raw
    .replaceAll('Fully Closed','完整收盤')
    .replaceAll('Next Bar Open','下一根 K 棒開盤');
}

function marketStatusLabel(market) {
  const time = market.updatedAt
    ? new Date(market.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    : '尚未更新';
  return `${displayStatus(market.status)} · ${time}`;
}
function money(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
}
function pct(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
}
function valueOrDash(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}
function price(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = n >= 1000 ? 2 : n >= 1 ? 3 : 5;
  return n.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
}
function numberPrice(value){
  const n = Number(String(value || '').replace(/,/g,''));
  return Number.isFinite(n) ? n : null;
}
function compactVolume(value){
  if (value == null || value === '') return '—';
  const n = Number(value);
  if(!Number.isFinite(n)) return '—';
  if(n >= 1e9) return `${(n/1e9).toFixed(1)}B`;
  if(n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if(n >= 1e3) return `${(n/1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
function symbolFromDisplay(display){
  return String(display || '').replace(/\s|\//g,'');
}
function marketSymbolOptions(state, limit = 40){
  const symbols = [];
  const seen = new Set();
  const source = state.market?.universeRows?.length ? state.market.universeRows : (state.market?.rows || []);
  const selected = String(state.ui?.selectedSymbol || '').toUpperCase();
  if(selected){
    seen.add(selected);
    symbols.push(selected);
  }
  for(const row of source){
    const symbol = symbolFromDisplay(row?.[1]);
    if(!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
    if(symbols.length >= limit) break;
  }
  if(!symbols.length) symbols.push('BTCUSDT','ETHUSDT','SOLUSDT');
  return symbols.map(symbol => `<option value="${symbol}" ${selected === symbol ? 'selected' : ''}>${symbol.replace(/USDT$/,' / USDT')}</option>`).join('');
}
function coinCode(symbol){
  const normalized = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/USDT$/,'');
  const base = normalized.replace(/^1000/,'');
  return base ? base.toLowerCase() : null;
}
function coinLogo(symbol, fallback = '•', large = false){
  const code = coinCode(symbol);
  if(!code) return `<span class="coin-logo ${large ? 'large' : ''}"><span class="coin-logo-fallback">${fallback}</span></span>`;
  const src = `https://assets.coincap.io/assets/icons/${code}@2x.png`;
  return `<span class="coin-logo ${large ? 'large' : ''}">
    <img src="${src}" alt="${code.toUpperCase()}" loading="lazy" referrerpolicy="no-referrer"
      onerror="this.hidden=true;this.nextElementSibling.hidden=false">
    <span class="coin-logo-fallback" hidden>${fallback}</span>
  </span>`;
}
function messageBar(state){
  return state.ui?.message ? `<div class="flash-message">${displayText(state.ui.message)}</div>` : '';
}
function calendarPanel(state){
  if(!state.ui?.calendarOpen) return '';
  const rows = (mock.calendar || []).map((item)=>`
    <article class="calendar-event">
      <div class="calendar-event-top">
        <div class="calendar-event-main">
          <div class="calendar-tag-row"><span class="focus-tag">${item.category}</span><span class="impact-bias impact-pending">${item.bias || '待判讀'}</span></div>
          <strong>${item.title}</strong>
          <small>影響資產：${item.impact}</small>
        </div>
        <span class="calendar-time">${item.timing}</span>
      </div>
      <div class="impact-direction-grid">
        <div class="impact-positive"><span>偏利多條件</span><p>${item.bullishWhen || '—'}</p></div>
        <div class="impact-negative"><span>偏利空條件</span><p>${item.bearishWhen || '—'}</p></div>
      </div>
    </article>`).join('');
  return `<section class="panel calendar-panel" id="event-calendar-panel">
    <div class="section-head premium-head">
      <div class="section-title"><span class="section-symbol">▣</span>事件日曆</div>
      <button class="section-link" data-event-calendar type="button">關閉 ×</button>
    </div>
    <div class="calendar-panel-note">事件尚未公布前只顯示「條件式利多／利空」。待即時前值、預期、公布值資料接入後，再依實際結果判讀方向。</div>
    <div class="calendar-events">${rows}</div>
  </section>`;
}
function focusAnalysisPanel(state){
  const rawIndex = state.ui?.focusAnalysisIndex;
  if(rawIndex === null || rawIndex === undefined) return '';
  const index = Number(rawIndex);
  const item = mock.focusAnalysis?.[index];
  if(!item) return '';

  const chain = (item.chain || []).map((step, i)=>`
    <div class="analysis-chain-step"><span>${String(i + 1).padStart(2,'0')}</span><strong>${step}</strong></div>`).join('');

  const crypto = (item.crypto || []).map((text)=>`<li>${text}</li>`).join('');
  const watch = (item.watch || []).map((text)=>`<span class="analysis-watch-chip">${text}</span>`).join('');

  return `<div class="focus-analysis-detail" id="focus-analysis-detail">
    <div class="analysis-detail-head">
      <div>
        <span class="focus-tag">${item.status || '分析中'}</span>
        <h2>${item.title}</h2>
        <p>分析視窗：${item.horizon || '—'}</p>
      </div>
      <button class="analysis-close" data-focus-analysis="${index}" type="button" aria-label="關閉深度分析">×</button>
    </div>

    <section class="analysis-block analysis-summary">
      <span class="analysis-eyebrow">核心解讀</span>
      <p>${item.summary}</p>
    </section>

    <section class="analysis-block analysis-impact">
      <span class="analysis-eyebrow">市場方向判讀</span>
      <div class="impact-direction-grid">
        <div class="impact-positive"><span>偏利多條件</span><p>${item.bullishCondition || '—'}</p></div>
        <div class="impact-negative"><span>偏利空條件</span><p>${item.bearishCondition || '—'}</p></div>
      </div>
      <div class="analysis-assets">
        <span>主要影響</span>
        <div>${(item.affectedAssets || []).map(asset=>`<b>${asset}</b>`).join('')}</div>
      </div>
    </section>

    <section class="analysis-block">
      <span class="analysis-eyebrow">市場傳導鏈</span>
      <div class="analysis-chain">${chain}</div>
    </section>

    <section class="analysis-block">
      <span class="analysis-eyebrow">對加密市場的影響</span>
      <ul class="analysis-bullets">${crypto}</ul>
    </section>

    <section class="analysis-block">
      <span class="analysis-eyebrow">三種市場情境</span>
      <div class="scenario-grid">
        <article class="scenario-card scenario-positive"><span>風險資產友善</span><p>${item.scenarios?.positive || '—'}</p></article>
        <article class="scenario-card scenario-base"><span>基準情境</span><p>${item.scenarios?.base || '—'}</p></article>
        <article class="scenario-card scenario-risk"><span>壓力情境</span><p>${item.scenarios?.risk || '—'}</p></article>
      </div>
    </section>

    <section class="analysis-block">
      <span class="analysis-eyebrow">接下來要盯什麼</span>
      <div class="analysis-watchlist">${watch}</div>
    </section>

    <section class="analysis-block analysis-invalidate">
      <span class="analysis-eyebrow">什麼情況要重新評估</span>
      <p>${item.invalidate || '—'}</p>
    </section>

    <div class="analysis-disclaimer">目前為 FOXYYA 分析框架內容，非即時新聞資訊流；待新聞與經濟數據來源接入後，再以最新事件覆寫這個分析層。</div>
  </div>`;
}
function derivedStrategies(state){
  if(state.strategy?.items?.length) return state.strategy.items;
  return (state.market?.rows || []).map((row)=>{
    const price = numberPrice(row[2]);
    const change = Number(row[3]);
    const score = Number(row[5]);
    const absChange = Number.isFinite(change) ? Math.abs(change) : 0;
    const signalScore = Number.isFinite(score) ? Math.round(score) : Math.min(99, Math.round(45 + absChange * 7));
    const symbol = String(row[1]).replace(/\s|\//g,'');
    const side = change < -1.5 ? 'SHORT' : 'LONG';
    let status = 'WATCH';
    let statusLabel = '觀察';
    if(signalScore >= 85 && absChange >= 3){
      status = 'HIGH';
      statusLabel = '🔥 高強度訊號';
    } else if(signalScore >= 75 && absChange >= 2.5){
      status = 'TRIGGERED';
      statusLabel = '動能達標';
    } else if(signalScore >= 65 && absChange >= 2){
      status = 'READY';
      statusLabel = '接近動能門檻';
    } else if(signalScore >= 55 || absChange >= 1.5){
      status = 'SETUP';
      statusLabel = '形成中';
    }
    const stop = price ? price * (side === 'LONG' ? 0.988 : 1.012) : null;
    return {
      symbol,
      strategy:'動能策略 · 輕量版第一版',
      direction: side === 'LONG' ? '偏多觀察' : '偏空觀察',
      status,
      statusLabel,
      signalScore,
      entry: price,
      stop,
      tp1: price ? price * (side === 'LONG' ? 1.02 : 0.98) : null,
      tp2: price ? price * (side === 'LONG' ? 1.035 : 0.965) : null,
      rr: 1.67,
      confidence: status === 'HIGH' || status === 'TRIGGERED' ? '高' : status === 'READY' || status === 'SETUP' ? '中' : '低',
      note:'輕量版訊號依 24 小時動能與流動性分級。止盈／停損採固定百分比參考：停損距離 1.2%、第一止盈 2%、第二止盈 3.5%；多單向上止盈、空單向下止盈。未設定分批比例、未自動執行，亦未納入 指數均線回測。'
    };
  });
}
function momentumStatus(strategy) {
  return ({HIGH:'高強度動能',TRIGGERED:'動能達標',READY:'接近動能門檻',SETUP:'動能形成中',WATCH:'動能觀察'})[strategy.status] || displayStatus(strategy.statusLabel || strategy.status);
}
function momentumDetails(strategy) {
  return `<details class="coin-strategy-detail" data-search="momentum-${escapeHtml(strategy.symbol)}"><summary>動能參考 · 固定百分比點位</summary><p>動能評分 ${valueOrDash(strategy.signalScore)}／100 · ${momentumStatus(strategy)}。此為報價推算，非研究進場計畫，也不是成交紀錄。</p>
      ${entryPlan(strategy)}
      <div class="mini-grid strategy-metrics">
        <span><em>參考風報比</em><strong>${valueOrDash(strategy.rr)}</strong></span>
        <span><em>動能等級</em><strong>${valueOrDash(strategy.confidence)}</strong></span>
      </div>
      <p class="strategy-note">${strategy.note || '策略快照僅供觀察，不提供真實下單。'}</p>
      <button class="candidate-add-btn" data-candidate-add="${strategy.symbol}"
        data-candidate-source="交易訊號 · ${strategy.strategy}"
        data-candidate-reason="${momentumStatus(strategy)} · 動能評分 ${valueOrDash(strategy.signalScore)}"
        data-candidate-status="${strategy.status || ''}"
        data-candidate-score="${valueOrDash(strategy.signalScore)}"
        data-candidate-direction="${strategy.direction || ''}" type="button">＋ 加入候選池</button>
  </details>`;
}
function strategyCards(state) {
  const analyzed = new Set((state.pullback?.rows || []).map(row => row.symbol));
  const priority = { HIGH:5, TRIGGERED:4, READY:3, SETUP:2, WATCH:1 };
  const all = [...derivedStrategies(state)].filter(item => !analyzed.has(item.symbol)).sort((a,b)=>
    (priority[b.status]||0)-(priority[a.status]||0) ||
    (Number(b.signalScore)||0)-(Number(a.signalScore)||0)
  );
  const filter = state.ui?.strategyFilter || 'all';
  const items = filter === 'all' ? all : all.filter(item => item.status === filter);
  if (!items.length) return '<div class="empty-state"><strong>此分類目前沒有策略訊號</strong><span>等待市場條件形成或更多樣本。</span></div>';
  return `<div class="cards-grid">${items.map((strategy) => {
    const high = strategy.status === 'HIGH';
    return `
    <article class="detail-card strategy-detail-card ${high ? 'high-signal-card' : ''}" data-search="${strategy.symbol} ${strategy.strategy} ${strategy.statusLabel}">
      <div class="strategy-card-head">
        <div class="strategy-card-brand">
          ${coinLogo(strategy.symbol, strategy.symbol.slice(0,1), true)}
          <div class="strategy-card-meta">
            <strong class="strategy-symbol">${strategy.symbol}</strong>
            <span class="strategy-name">${strategy.strategy}</span>
          </div>
        </div>
        <span class="signal-badge signal-${String(strategy.status||'WATCH').toLowerCase()}">${momentumStatus(strategy)}</span>
      </div>
      <div class="strategy-signal-line">
        <strong class="strategy-direction">${strategy.direction}</strong>
        <span>動能評分 <b>${valueOrDash(strategy.signalScore)}</b>/100</span>
      </div>
      ${momentumDetails(strategy)}
    </article>`;
  }).join('')}</div>`;
}
function strategyOpportunity(state) {
  const priority = { HIGH:5, TRIGGERED:4, READY:3, SETUP:2, WATCH:1 };
  const strategy = [...derivedStrategies(state)].sort((a,b)=>
    (priority[b.status]||0)-(priority[a.status]||0) ||
    (Number(b.signalScore)||0)-(Number(a.signalScore)||0)
  )[0];
  if (!strategy) return '<div class="empty-state"><strong>策略機會等待資料</strong></div>';
  return `<div class="strategy-card strategy-opportunity ${strategy.status==='HIGH'?'high-signal-card':''}">
    ${coinLogo(strategy.symbol, strategy.symbol.startsWith('BTC') ? '₿' : '◇', true)}
    <div class="strategy-main">
      <div class="strategy-opportunity-top">
        <div><strong>${strategy.symbol}</strong><span>${strategy.strategy}</span></div>
        <span class="signal-badge signal-${String(strategy.status||'WATCH').toLowerCase()}">${momentumStatus(strategy)}</span>
      </div>
      <b class="strategy-direction">${strategy.direction}</b>
      <div class="opportunity-score">動能評分 <strong>${valueOrDash(strategy.signalScore)}</strong>/100</div>
      ${entryPlan(strategy)}
      <p class="strategy-note">${strategy.note}</p>
      <button class="text-btn" data-go-strategies type="button">查看全部交易訊號 ›</button>
    </div>
  </div>`;
}
function sortedRows(state){
  const rows = [...(state.market?.rows || [])];
  const sort = state.ui?.marketSort || 'popular';
  if(sort === 'gain') rows.sort((a,b)=>(Number(b[3])||-999)-(Number(a[3])||-999));
  if(sort === 'loss') rows.sort((a,b)=>(Number(a[3])||999)-(Number(b[3])||999));
  if(sort === 'strong') rows.sort((a,b)=>(Number(b[5])||-1)-(Number(a[5])||-1));
  return rows;
}
function researchUniverseRows(state){
  const source = state.market?.universeRows?.length ? state.market.universeRows : (state.market?.rows || []);
  return source.filter(row =>
    Number.isFinite(Number(row?.[3])) &&
    Number.isFinite(Number(row?.[4])) &&
    Number(row?.[4]) > 0 &&
    Number.isFinite(Number(row?.[5]))
  );
}
function tradabilityEvidence(state, row){
  const universe = [...researchUniverseRows(state)]
    .sort((a,b)=>Number(b?.[4]||0)-Number(a?.[4]||0));
  const symbol = symbolFromDisplay(row?.[1]);
  const rank = Math.max(0, universe.findIndex(item => symbolFromDisplay(item?.[1]) === symbol));
  const size = Math.max(1, universe.length);
  const liquidityScore = size > 1 ? 100 - (rank / (size - 1)) * 80 : 100;
  const absChange = Math.abs(Number(row?.[3]) || 0);
  const extremePenalty = absChange >= 30 ? 45 : absChange >= 20 ? 25 : absChange >= 15 ? 12 : 0;
  const score = Math.max(0, Math.min(100, Math.round(liquidityScore - extremePenalty)));
  const status = absChange >= 30 ? 'BLOCKED' : absChange >= 15 ? 'CAUTION' : 'PASS';
  return {
    score,
    status,
    liquidityRank: rank + 1,
    universeSize: size,
    reason: status === 'BLOCKED'
      ? '24 小時波動極端，暫不進入前五名'
      : status === 'CAUTION'
        ? '24 小時波動偏高，需提高滑價與追價風險警戒'
        : '位於高流動性 U 本位永續合約全市場標的池'
  };
}
function strategyMatch(row, evidence){
  const change = Number(row?.[3]) || 0;
  const absChange = Math.abs(change);
  const marketScore = Number(row?.[5]) || 0;
  const consensus = String(evidence?.technicalLabel || '');
  if(String(evidence?.riskLabel || '').toUpperCase() === 'BLOCKED') return 'NO TRADE';
  if(consensus === '多週期偏多' || consensus === '多週期偏空') return 'Trend';
  if(absChange >= 6 && marketScore >= 72) return 'Momentum / Breakout Watch';
  if(absChange >= 2 && marketScore >= 58) return 'Trend / Momentum';
  if(absChange <= 1.2) return 'Range Watch';
  return 'Momentum Watch';
}
function strongEvidence(state, row){
  const symbol = symbolFromDisplay(row?.[1]);
  const marketScore = Number(row?.[5]);
  const change = Number(row?.[3]);
  const candidate = (state.candidates?.items || []).find(item => item.symbol === symbol);

  let technicalScore = 50;
  const consensus = String(candidate?.technical?.consensus || '');
  if(consensus === '多週期偏多') technicalScore = 90;
  else if(consensus === '偏多') technicalScore = 72;
  else if(consensus === '偏空') technicalScore = 28;
  else if(consensus === '多週期偏空') technicalScore = 10;

  let validatorScore = 50;
  const verdict = validatorVerdict(candidate?.validator);
  if(verdict.label === 'PASS') validatorScore = 90;
  else if(verdict.label === 'CAUTION') validatorScore = 62;
  else if(verdict.label === 'REVIEW') validatorScore = 28;
  else if(verdict.label === '樣本不足') validatorScore = 45;

  let riskScore = 50;
  const risk = String(candidate?.risk?.status || '').toUpperCase();
  if(risk === 'PASS') riskScore = 90;
  else if(risk === 'CAUTION') riskScore = 42;
  else if(risk === 'BLOCKED') riskScore = 0;

  const baseMarket = Number.isFinite(marketScore) ? marketScore : 50;
  const tradability = tradabilityEvidence(state, row);

  const composite = Math.max(0, Math.min(100, Math.round(
    baseMarket * 0.50 +
    tradability.score * 0.20 +
    technicalScore * 0.12 +
    validatorScore * 0.10 +
    riskScore * 0.08
  )));

  const result = {
    symbol,
    candidate,
    marketScore: baseMarket,
    tradabilityScore: tradability.score,
    tradabilityStatus: tradability.status,
    tradabilityReason: tradability.reason,
    liquidityRank: tradability.liquidityRank,
    universeSize: tradability.universeSize,
    technicalScore,
    validatorScore,
    riskScore,
    composite,
    validatorLabel: verdict.label,
    technicalLabel: candidate?.technical?.consensus || '待分析',
    riskLabel: candidate?.risk?.status || '待檢查'
  };
  result.strategyMatch = strategyMatch(row, result);
  return result;
}
export function strongTopFive(state){
  return researchUniverseRows(state)
    .map(row => ({ row, evidence: strongEvidence(state, row) }))
    .filter(item =>
      item.evidence.tradabilityStatus !== 'BLOCKED' &&
      String(item.evidence.riskLabel || '').toUpperCase() !== 'BLOCKED'
    )
    .sort((a,b)=>
      b.evidence.composite - a.evidence.composite ||
      Number(b.row?.[5] || 0) - Number(a.row?.[5] || 0)
    )
    .slice(0,5);
}

function strongCoinDetail(state, strong){
  const selected = state.ui?.selectedStrongSymbol;
  if(!selected) return '';
  const selectedItem = strong.find(item => symbolFromDisplay(item.row?.[1] || item?.[1]) === selected);
  if(!selectedItem) return '';
  const row = selectedItem.row || selectedItem;
  const evidence = selectedItem.evidence || strongEvidence(state, row);
  const [icon, display, lastPrice, change, quoteVolume, score] = row;
  const changeNum = Number(change);
  const scoreNum = Number(score);
  const tier = scoreNum >= 80 ? '極強' : scoreNum >= 65 ? '強勢' : scoreNum >= 50 ? '偏強' : '觀察';
  return `<div class="strong-detail" id="strong-coin-detail">
    <div class="strong-detail-head">
      <div class="strong-detail-title">
        ${coinLogo(display, icon, true)}
        <div><span>強勢幣種分析</span><strong>${display}</strong></div>
      </div>
      <span class="strong-tier">綜合 ${evidence.composite} · ${tier}</span>
    </div>
    <div class="strong-detail-grid">
      <div><span>最新價格</span><strong>${lastPrice}</strong></div>
      <div><span>24 小時動能</span><strong class="${changeNum>=0?'up':'down'}">${changeNum>=0?'+':''}${changeNum.toFixed(2)}%</strong></div>
      <div><span>全市場流動性排名</span><strong>#${evidence.liquidityRank} / ${evidence.universeSize}</strong></div>
      <div><span>交易適宜度</span><strong>${displayStatus(evidence.tradabilityStatus)} · ${evidence.tradabilityScore}</strong></div>
      <div><span>市場強度</span><strong>${scoreNum.toFixed(0)} / 100</strong></div>
      <div><span>研究評分</span><strong>${evidence.composite} / 100</strong></div>
      <div><span>策略匹配</span><strong>${displayStrategyMatch(evidence.strategyMatch)}</strong></div>
      <div><span>曝險檢查</span><strong>${displayStatus(evidence.riskLabel)}</strong></div>
    </div>
    <div class="strong-reasons">
      <div><span>交易條件檢查</span><p>${evidence.tradabilityReason}。目前流動性排名 #${evidence.liquidityRank} / ${evidence.universeSize}，權重 20%。</p></div>
      <div><span>策略匹配</span><p>${displayStrategyMatch(evidence.strategyMatch)}。這是待驗證的策略族群，不等於該策略已經獲利。</p></div>
      <div><span>技術面分析</span><p>${evidence.technicalLabel} · 權重 12%。未分析時採中性分，不假設方向。</p></div>
      <div><span>策略驗證</span><p>${displayStatus(evidence.validatorLabel)} · 權重 10%。只有實際回測資料才可能判定為「通過」。</p></div>
      <div><span>曝險檢查</span><p>${displayStatus(evidence.riskLabel)} · 權重 8%。判定為「阻擋」時不得進入前五名，但仍保留在全市場研究資料。</p></div>
      <div><span>市場基礎</span><p>市場強勢權重 50%；研究前五名代表研究優先序，不是買進排名。</p></div>
    </div>
    <div class="strong-actions strong-actions-three">
      <button class="candidate-add-btn" data-candidate-add="${selected}"
        data-candidate-source="市場偵察 · 綜合強勢前五名"
        data-candidate-reason="市場機會前五名 · 研究評分 ${evidence.composite} · 市場強度 ${scoreNum.toFixed(0)}"
        data-candidate-score="${scoreNum.toFixed(0)}"
        data-candidate-direction="${changeNum >= 0 ? '偏多' : '偏空'}" type="button">＋ 加入候選</button>
      <button class="secondary-btn" data-use-backtest="${selected}" type="button">歷史回測</button>
      <button class="primary-inline-btn" data-use-paper="${selected}" type="button">帶入模擬</button>
    </div>
  </div>`;
}
function strongCoinCards(state){
  const strong = strongTopFive(state);
  if(!strong.length) return '<div class="empty-state"><strong>強勢幣種資料讀取中</strong><span>等待市場成交額與動能資料。</span></div>';
  return `<div class="strong-grid">${strong.map(({row,evidence},index)=>{
    const [icon, display, lastPrice, change] = row;
    const changeNum = Number(change);
    const symbol = symbolFromDisplay(display);
    const selected = state.ui?.selectedStrongSymbol === symbol;
    return `<button class="strong-card ${selected?'is-selected':''}" data-strong-symbol="${symbol}" type="button" aria-expanded="${selected}">
      <div class="strong-rank">#${index+1}</div>
      ${coinLogo(display, icon)}
      <div class="strong-main">
        <strong>${display}</strong>
        <span>#${evidence.liquidityRank}/${evidence.universeSize} · ${displayStrategyMatch(evidence.strategyMatch)} · ${displayStatus(evidence.validatorLabel)}</span>
      </div>
      <div class="strong-score"><small>綜合分數</small><b>${evidence.composite}</b></div>
      <div class="strong-change ${changeNum>=0?'up':'down'}">${changeNum>=0?'+':''}${changeNum.toFixed(2)}%</div>
      <div class="strong-price">${lastPrice}</div>
    </button>`;
  }).join('')}</div>
  ${strongCoinDetail(state,strong)}
  <div class="strong-note">動態前五名從完整高流動性全市場標的池中產生：市場強度 50%＋交易適宜度 20%＋技術面 12%＋策略驗證 10%＋風險 8%。缺資料採中性值；風險或交易適宜度判定為「阻擋」者不進前五名。僅作研究優先序。</div>`;
}
function tab(label,key,active,attr){
  return `<button type="button" class="tab-btn ${active===key?'active':''}" ${attr}="${key}">${label}</button>`;
}
function assetClassSwitcher(state){
  const active = state.ui?.assetClass || 'crypto';
  return `<div class="asset-switcher" role="tablist" aria-label="資產分類">
    <button type="button" class="asset-switch ${active==='crypto'?'active':''}" data-asset-class="crypto" role="tab" aria-selected="${active==='crypto'}">
      <span>₿</span><div><strong>加密貨幣</strong><small>數位資產</small></div>
    </button>
    <button type="button" class="asset-switch asset-switch-disabled" role="tab" aria-selected="false" aria-disabled="true" disabled>
      <span>▥</span><div><strong>股市</strong><small>待接資料源</small></div>
    </button>
  </div>`;
}
function stockEmptyState(title='股市資料源尚未接入'){
  return `<div class="asset-empty">
    <div class="asset-empty-icon">▥</div>
    <strong>${title}</strong>
    <span>目前股市尚未接入正式行情與策略資料，因此不會用加密貨幣資料代替。</span>
    <button type="button" class="secondary-btn asset-empty-action" data-asset-class="crypto">切回加密貨幣</button>
  </div>`;
}
function homeSectionTabs(state){
  const active = state.ui?.homeSection || 'market';
  const items = [
    ['market','市場排行','◉'],
    ['strong','市場機會前五名','◆'],
    ['focus','國際焦點','◌'],
    ['strategy','策略機會','◎']
  ];
  return `<div class="home-section-tabs" role="tablist" aria-label="首頁內容分頁">
    ${items.map(([key,label,icon]) => `
      <button type="button" class="home-section-btn ${active===key?'active':''}" data-home-section="${key}" role="tab" aria-selected="${active===key}">
        <span>${icon}</span><strong>${label}</strong>
      </button>`).join('')}
  </div>`;
}

export function homePage(state) {
  const homeSection = state.ui?.homeSection || 'market';
  const assetClass = state.ui?.assetClass || 'crypto';
  const isCrypto = assetClass === 'crypto';
  const market = isCrypto ? state.market : state.stocks;
  const coins = isCrypto ? sortedRows(state).map(([icon, symbol, price, change]) => {
    const hasChange = Number.isFinite(change);
    const changeText = hasChange ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—';
    const changeClass = !hasChange ? '' : change >= 0 ? 'up' : 'down';
    return `<div class="coin-row" data-search="${symbol}">
      ${coinLogo(symbol, icon)}
      <strong>${symbol}</strong>
      <span>${price}</span>
      <b class="${changeClass} change-pill">${changeText}</b>
    </div>`;
  }).join('') : '';
  const sort = state.ui?.marketSort || 'popular';
  const [focusA, focusB, focusC] = mock.news;

  const focusCard = ([, title, text, tag], index, featured = false) => {
    const analysis = mock.focusAnalysis?.[index] || {};
    return `
    <button class="focus-card ${featured ? 'focus-featured' : ''} ${Number(state.ui?.focusAnalysisIndex) === index ? 'is-selected' : ''}"
      data-search="${title} ${text} ${tag}" data-focus-analysis="${index}" type="button"
      aria-expanded="${Number(state.ui?.focusAnalysisIndex) === index}">
      <div class="focus-icon">${featured ? '◎' : '◇'}</div>
      <div class="focus-copy">
        <h3>${title}</h3>
        <p>${text}</p>
        <div class="focus-mini-impact">
          <span class="impact-mini-up">偏多條件</span>
          <span class="impact-mini-down">偏空條件</span>
        </div>
        <span class="focus-tag">${tag}</span>
      </div>
      <span class="focus-arrow">›</span>
    </button>`;
  };

  return `<div class="page-stack home-stack">${messageBar(state)}
    ${assetClassSwitcher(state)}
    <div class="hero-grid">
      <section class="panel hero-card direction-card">
        <div class="hero-label"><span class="hero-icon">◈</span>市場方向</div>
        <div class="direction-layout">
          <div class="direction-primary">
            <strong class="direction-value">${market.direction}</strong>
            <span class="hero-kicker">${marketStatusLabel(market)}</span>
          </div>
          <div class="direction-divider"></div>
          <p>關注國際動態與資金變化，保持靈活應對。</p>
        </div>
      </section>
      <section class="panel hero-card event-card" data-event-calendar role="button" tabindex="0" aria-expanded="${Boolean(state.ui?.calendarOpen)}">
        <div class="hero-label"><span class="hero-icon">▣</span>事件日曆</div>
        <p>追蹤重要經濟數據與市場事件。</p>
        <div class="event-bottom"><span class="focus-tag">模板</span><span>${state.ui?.calendarOpen ? '收合' : '查看本週'} ›</span></div>
      </section>
    </div>

    ${calendarPanel(state)}
    ${homeSectionTabs(state)}

    <section class="panel ranking-panel home-section-panel ${homeSection==='market'?'is-active':''}">
      <div class="section-head premium-head">
        <div class="section-title"><span class="section-symbol">◉</span>市場排行</div>
        <div class="section-meta">${displayMarketSource(market.source)} · ${badge(displayStatus(market.status), market.status)}</div>
      </div>
      ${isCrypto ? `
        <div class="tabs interactive premium-tabs">
          ${tab('熱門','popular',sort,'data-market-sort')}
          ${tab('強勢','strong',sort,'data-market-sort')}
          ${tab('漲幅','gain',sort,'data-market-sort')}
          ${tab('跌幅','loss',sort,'data-market-sort')}
        </div>
        <div class="table-head"><span>幣種</span><span>最新價格</span><span>24 小時</span></div>
        <div class="coin-list">${coins}</div>
      ` : stockEmptyState('股市行情尚未接入')}
    </section>

    <section class="panel strong-panel home-section-panel ${homeSection==='strong'?'is-active':''}">
      <div class="section-head premium-head">
        <div class="section-title"><span class="section-symbol">◆</span>${isCrypto ? '市場機會加密貨幣前五名' : '強勢股票前十名'}</div>
        <span class="section-quiet">${isCrypto ? '24 小時動能＋流動性' : '股票 · 獨立模組'}</span>
      </div>
      ${isCrypto ? strongCoinCards(state) : stockEmptyState('強勢股票排行待接入')}
    </section>

    <section class="panel focus-panel home-section-panel ${homeSection==='focus'?'is-active':''}">
      <div class="section-head premium-head">
        <div class="section-title"><span class="section-symbol">◌</span>國際焦點</div>
        <span class="section-quiet">靜態資料</span>
      </div>
      <div class="focus-layout">
        ${focusCard(focusA, 0, true)}
        <div class="focus-grid">
          ${focusCard(focusB, 1)}
          ${focusCard(focusC, 2)}
        </div>
        ${focusAnalysisPanel(state)}
        <button class="calendar-row premium-calendar" data-event-calendar type="button" aria-expanded="${Boolean(state.ui?.calendarOpen)}">
          <span class="hero-icon">▣</span>
          <div><strong>重要事件日曆</strong><small>事件監看模板 · 點擊展開</small></div>
          <span class="focus-arrow">›</span>
        </button>
      </div>
    </section>

    <section class="panel opportunity-panel home-section-panel ${homeSection==='strategy'?'is-active':''}">
      <div class="section-head premium-head">
        <div class="section-title"><span class="section-symbol">◎</span>策略機會</div>
        <button class="section-link" data-go-strategies type="button">查看全部 ›</button>
      </div>
      ${isCrypto ? strategyOpportunity(state) : stockEmptyState('股市策略模組待接入')}
    </section>
  </div>`;
}


function strategyTimeframeTabs(state){
  const active = state.ui?.strategyTimeframe || '1h';
  const frames = [
    ['15m','15 分鐘'],
    ['1h','1 小時'],
    ['4h','4 小時'],
    ['12h','12 小時'],
    ['1d','日線'],
    ['1w','週線'],
    ['1M','月線']
  ];
  return `<div class="strategy-timeframe-wrap">
    <div class="strategy-timeframe-tabs" role="tablist" aria-label="策略分析週期">
      ${frames.map(([key,label])=>`
        <button type="button" class="timeframe-btn ${active===key?'active':''}" data-strategy-timeframe="${key}" role="tab" aria-selected="${active===key}">${label}</button>
      `).join('')}
    </div>
    <div class="timeframe-note">目前輕量版交易訊號仍以 24 小時動能＋流動性為基準；週期按鈕先作為策略分析工作區，待多週期訊號引擎接入後再分別計算。</div>
  </div>`;
}
function strategyWorkspaceTabs(state){
  const workspace=state.ui?.strategyWorkspace || 'signals';
  const active=workspace==='candidates'?'agents':workspace;
  return `<div class="strategy-workspace-tabs strategy-primary-tabs" role="tablist" aria-label="交易研究入口">
    ${[['signals','強勢訊號'],['agents','交易流程']].map(([key,label])=>`<button type="button" class="strategy-workspace-btn ${active===key?'active':''}" data-strategy-workspace="${key}" role="tab" aria-selected="${active===key}">${label}</button>`).join('')}
  </div>`;
}
function strategyAdvancedTools(state){
  const workspace=state.ui?.strategyWorkspace;
  const agent=state.ui?.agentKey;
  const advanced=['library','develop','review','optimize'].includes(workspace) || (workspace==='agents' && ['news','validator','risk','review'].includes(agent));
  return `<details class="core-disclosure strategy-advanced-tools" data-search="進階工具" ${advanced?'open':''}><summary>進階工具${advanced?' · 使用中':''}</summary><div class="advanced-tool-grid">
    ${[['library','策略庫'],['develop','策略開發'],['review','策略檢討'],['optimize','策略優化']].map(([key,label])=>`<button type="button" class="secondary-btn" data-strategy-workspace="${key}" ${workspace===key?'aria-current="page"':''}>${label}</button>`).join('')}
    ${[['news','新聞影響'],['validator','策略驗證'],['risk','曝險管理'],['review','交易檢討']].map(([key,label])=>`<button type="button" class="secondary-btn" data-agent-key="${key}" ${workspace==='agents' && agent===key?'aria-current="page"':''}>${label}</button>`).join('')}
  </div></details>`;
}

function validatorVerdict(validator){
  const input = validator?.input;
  const localBacktest = input?.executionModel === 'Fully Closed Signal → Next Bar Open' && /^Binance /.test(input?.dataSource || '');
  if(localBacktest && input.calculationVersion !== BACKTEST_VERSION){
    return {label:'待重新驗證',tone:'caution',reason:'回測計算已更新，請重新驗證'};
  }
  return evaluateStrategyGuard(validator?.result);
}
function riskTone(status){
  const key = String(status || 'PENDING').toUpperCase();
  return key === 'PASS' ? 'pass' : key === 'BLOCKED' ? 'blocked' : key === 'CAUTION' ? 'caution' : 'pending';
}
function candidateFinalState(item){
  const risk = String(item.risk?.status || '').toUpperCase();
  const validator = validatorVerdict(item.validator);
  if(risk === 'BLOCKED') return {label:'BLOCKED',tone:'blocked'};
  if(validator.label === 'PASS' && item.technical?.status === 'LIVE' && risk === 'PASS') return {label:'READY',tone:'pass'};
  if(item.technical?.status === 'LIVE' || item.validator?.result) return {label:'SETUP',tone:'caution'};
  return {label:'WATCH',tone:'pending'};
}
function candidateTechnical(item){
  const tech = item.technical;
  if(!tech?.frames?.length) return '<div class="candidate-empty-line">尚未執行多週期分析</div>';
  return `<div class="candidate-timeframes">${tech.frames.map(frame=>{
    const dir = String(frame.direction || '');
    const tone = dir.includes('多') ? 'up' : dir.includes('空') ? 'down' : '';
    return `<div class="candidate-tf"><span>${displayTimeframe(frame.interval || frame.label)}</span><strong class="${tone}">${dir}</strong><small>${frame.status==='LIVE' && Number.isFinite(Number(frame.momentumPct)) ? `${Number(frame.momentumPct)>=0?'+':''}${Number(frame.momentumPct).toFixed(2)}%` : displayStatus(frame.status)}</small></div>`;
  }).join('')}</div>`;
}
function candidatePoolPanel(state){
  const items = state.candidates?.items || [];
  const rows = items.length ? items.map(item=>{
    const validator = validatorVerdict(item.validator);
    const finalState = candidateFinalState(item);
    const riskStatus = item.risk?.status || '待檢查';
    const added = item.addedAt ? new Date(item.addedAt).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
    const vr = item.validator?.result || {};
    return `<article class="candidate-card" data-search="${item.symbol} ${item.source} ${item.reason}">
      <div class="candidate-head">
        <div class="candidate-symbol-wrap">
          ${coinLogo(item.symbol,item.symbol.slice(0,1),true)}
          <div><strong>${item.symbol}</strong><span>${displayCandidateSource(item.source)} · ${added}</span></div>
        </div>
        <span class="decision-badge decision-${finalState.tone}">${displayStatus(finalState.label)}</span>
      </div>
      <p class="candidate-reason">${displayText(item.reason || '手動加入候選池')}</p>
      <div class="evidence-matrix">
        <div><span>市場</span><strong>${item.signal?.score != null ? `評分 ${item.signal.score}` : '已加入'}</strong><small>${item.signal?.direction || displayCandidateSource(item.source) || '—'}</small></div>
        <div><span>技術面</span><strong>${item.technical?.consensus || '待分析'}</strong><small>${displayStatus(item.technical?.status || '—')}</small></div>
        <div><span>策略驗證</span><strong class="decision-text-${validator.tone}">${displayStatus(validator.label)}</strong><small>${item.validator?.result ? `交易 ${Number(vr.trades)||0} 筆 · 獲利因子 ${vr.profitFactor == null ? '—' : Number(vr.profitFactor).toFixed(2)} · 最大回撤 ${pct(vr.maxDrawdownPct)}` : '尚未回測'}</small></div>
        <div><span>曝險檢查</span><strong class="decision-text-${riskTone(item.risk?.status)}">${displayStatus(riskStatus)}</strong><small>${item.risk ? `${Number(item.risk.portfolioRiskPct||0).toFixed(2)}% / 1.50%` : '待檢查'}</small></div>
      </div>
      ${candidateTechnical(item)}
      ${item.risk?.reasons?.length ? `<div class="risk-reasons">${item.risk.reasons.map(reason=>`<p>• ${displayText(reason)}</p>`).join('')}</div>` : ''}
      <div class="candidate-actions">
        <button type="button" class="secondary-btn" data-candidate-analyze="${item.symbol}">多週期分析</button>
        <button type="button" class="secondary-btn" data-candidate-validate="${item.symbol}">策略驗證</button>
        <button type="button" class="secondary-btn" data-candidate-risk="${item.symbol}">曝險檢查</button>
        <button type="button" class="danger-btn" data-candidate-remove="${item.symbol}">移出候選</button>
      </div>
    </article>`;
  }).join('') : '<div class="empty-state"><strong>候選池目前是空的</strong><span>可從動態前五名、全市場掃描、交易訊號，或下方手動加入標的。</span></div>';

  return `<div class="candidate-pool-wrap">
    <form id="candidate-manual-form" class="candidate-manual-form">
      <label>手動加入<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <button type="button" class="primary-inline-btn" data-candidate-manual-add>＋ 加入候選</button>
    </form>
    <div class="candidate-pool-summary">
      <div><span>候選數</span><strong>${items.length}</strong></div>
      <p>智慧分析代理可獨立分析；只有你選擇的標的才會進入候選池。曝險檢查目前以模擬保證金／淨值代理曝險，具有阻擋權但不會送出真實訂單。</p>
    </div>
    <div class="candidate-list">${rows}</div>
  </div>`;
}


function agentTabs(state){
  const active = state.ui?.strategyWorkspace==='candidates'?'market':state.ui?.agentKey || 'market';
  const agents = [
    ['technical','01','分析'],
    ['market','02','篩選'],
    ['playbook','03','策略'],
    ['advice','04','交易建議'],
    ['planHistory','05','紀錄']
  ];
  return `<div class="agent-tabs" role="tablist" aria-label="FOXYYA 智慧分析代理">
    ${agents.map(([key,no,label])=>`
      <button type="button" class="agent-tab ${active===key?'active':''}" data-agent-key="${key}" role="tab" aria-selected="${active===key}">
        <span>${no}</span><strong>${label}</strong>
      </button>
    `).join('')}
  </div>`;
}
function agentFilterTabs(state, items){
  const active = state.ui?.agentFilter || items?.[0]?.[0] || 'all';
  return `<div class="agent-filter-tabs">
    ${items.map(([key,label])=>`<button type="button" class="agent-filter-btn ${active===key?'active':''}" data-agent-filter="${key}">${label}</button>`).join('')}
  </div>`;
}
function agentCandidateButton(symbol, source, reason, extra=''){
  return `<button type="button" class="candidate-add-btn" data-candidate-add="${symbol}" data-candidate-source="${source}" data-candidate-reason="${reason}" ${extra}>＋ 加入候選</button>`;
}
function topFiveResearchPanel(state){
  const research = state.agents?.topFiveResearch || {};
  const rows = Array.isArray(research.rows) ? research.rows : [];
  const running = research.status === 'LOADING';
  const progress = Number(research.progress) || 0;
  const total = Number(research.total) || rows.length || 5;
  const updated = research.updatedAt
    ? new Date(research.updatedAt).toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
    : '尚未執行';

  const counts = {
    validated: rows.filter(item=>item.decision?.label === 'VALIDATED').length,
    caution: rows.filter(item=>['CAUTION','INSUFFICIENT'].includes(item.decision?.label)).length,
    review: rows.filter(item=>['REVIEW','ERROR'].includes(item.decision?.label)).length,
    blocked: rows.filter(item=>item.decision?.label === 'BLOCKED').length
  };

  const resultRows = rows.length ? rows.map(item=>{
    const result = item.backtest?.result || {};
    const input = item.backtest?.input || {};
    const decision = item.decision || {label:item.status || 'PENDING',tone:'pending'};
    const spec = item.spec || {};
    const guard = item.guard || {label:'待驗證',tone:'pending'};
    const risk = item.risk?.status || '待檢查';
    const technical = item.technical?.consensus || (item.technicalError ? '技術分析錯誤' : '待分析');
    const changeClass = Number(result.netReturnPct) >= 0 ? 'up' : 'down';

    const metrics = item.backtest ? `
      <div class="agent-research-metrics">
        <span><small>交易筆數</small><strong>${result.trades ?? '—'}</strong></span>
        <span><small>勝率</small><strong>${pct(result.winRatePct)}</strong></span>
        <span><small>獲利因子</small><strong>${result.profitFactor == null ? '—' : Number(result.profitFactor).toFixed(2)}</strong></span>
        <span><small>平均每筆</small><strong>${pct(result.avgTradePct)}</strong></span>
        <span><small>淨報酬率</small><strong class="${changeClass}">${pct(result.netReturnPct)}</strong></span>
        <span><small>最大回撤</small><strong>${pct(result.maxDrawdownPct)}</strong></span>
        ${backtestAmountFields(item.backtest).map(([label,value])=>`<span><small>${label}</small><strong>${value}</strong></span>`).join('')}
      </div>`
      : `<div class="candidate-empty-line">${displayText(spec.supported === false ? spec.reason : item.error || '尚未完成基準回測')}</div>`;

    const strategyChip = item.strategyMatch || '待配對';
    const guardChip = guard.label || '待驗證';

    return `<details class="agent-research-card research-compact-card" data-search="${item.symbol} ${item.strategyMatch} ${guard.label} ${decision.label}">
      <summary class="agent-research-summary">
        <span class="research-rank">#${item.rank}</span>
        ${coinLogo(item.symbol,item.symbol?.slice(0,1),true)}
        <div class="research-summary-main">
          <strong>${item.symbol}</strong>
          <div class="research-chip-row">
            <span class="research-chip">${displayStrategyMatch(strategyChip)}</span>
            <span class="research-chip research-chip-${guard.tone || 'pending'}">${displayStatus(guardChip)}</span>
            <span class="research-chip research-chip-${riskTone(item.risk?.status)}">${displayStatus(risk)}</span>
          </div>
        </div>
        <div class="research-score"><small>研究評分</small><b>${item.researchScore ?? '—'}</b></div>
        <span class="decision-badge decision-${decision.tone || 'pending'}">${displayStatus(decision.label || 'PENDING')}</span>
        <span class="research-chevron">⌄</span>
      </summary>
      <div class="research-detail-body">
        <div class="agent-research-evidence">
          <div><span>技術面</span><strong>${technical}</strong></div>
          <div><span>策略匹配</span><strong>${displayStrategyMatch(item.strategyMatch)}</strong></div>
          <div><span>驗證基準</span><strong>${spec.supported ? `${displayText(spec.strategyLabel)} · ${displayTimeframe(spec.timeframe)} · ${displayRange(spec.range)}` : '未支援'}</strong></div>
          <div><span>策略驗證</span><strong class="decision-text-${guard.tone || 'pending'}">${displayStatus(guard.label || '—')}</strong></div>
          <div><span>曝險檢查</span><strong class="decision-text-${riskTone(item.risk?.status)}">${displayStatus(risk)}</strong></div>
          <div><span>資料來源</span><strong>${displayMarketSource(input.dataSource)}</strong></div>
        </div>
        ${metrics}
        ${item.backtest ? `<p class="guard-note">${backtestAmountNote(item.backtest)}</p>` : ''}
        ${agentTradePlanView(state.agents?.tradePlans?.[item.symbol],{symbol:item.symbol,link:true,comparison:state.agents?.planComparisons?.[item.symbol],comparisonBusy:state.agents?.planComparisonBusy || state.pullback?.comparing})}
        <div class="research-detail-footer">
          <span>${displayText(guard.reason || spec.reason || '固定基準驗證')}</span>
          ${item.status === 'DONE' || item.status === 'ERROR' ? `
            <button type="button" class="candidate-add-btn" data-research-promote="${item.symbol}">加入候選池</button>
          ` : ''}
        </div>
      </div>
    </details>`;
  }).join('') : '<div class="empty-state research-empty"><strong>尚未執行前五名研究</strong><span>按下驗證後，系統會逐一執行技術分析、固定基準回測、策略驗證與曝險檢查。</span></div>';

  return `<section class="agent-research-panel research-cockpit">
    <div class="agent-research-head research-cockpit-head">
      <div>
        <span class="research-eyebrow">研究流程</span>
        <strong>前五名全套驗證</strong>
        <small>${research.restored ? '歷史研究 · 由本機儲存還原，請重新驗證' : '固定規則 · 不針對單一標的調參'} · 更新 ${updated}</small>
      </div>
      <button type="button" class="primary-inline-btn research-run-btn" data-top5-research-run ${running?'disabled':''}>
        ${running ? `執行中 ${progress}/${total}` : '開始全套驗證'}
      </button>
    </div>

    <div class="research-status-grid">
      <div class="research-status-pass"><span>已驗證</span><strong>${counts.validated}</strong></div>
      <div class="research-status-caution"><span>注意</span><strong>${counts.caution}</strong></div>
      <div class="research-status-review"><span>需複核</span><strong>${counts.review}</strong></div>
      <div class="research-status-blocked"><span>阻擋</span><strong>${counts.blocked}</strong></div>
    </div>

    ${running ? `
      <div class="research-progress-wrap">
        <div><span>驗證進度</span><strong>${progress} / ${total}</strong></div>
        <div class="agent-research-progress"><span style="width:${total ? Math.round(progress/total*100) : 0}%"></span></div>
      </div>
    ` : ''}

    <div class="agent-research-list">${resultRows}</div>
    <details class="research-rule-note">
      <summary>查看固定驗證規則</summary>
      <p>先檢查七個時間週期的技術方向，再依策略類型採固定基準：趨勢為 20／50 期指數均線 · 4 小時 · 2 年；動能／突破（包含趨勢／動能）為 10／30 期指數均線 · 1 小時 · 1 年。若至少五個週期同向，改採趨勢基準。期間是預先設定，不是逐幣挑選最高報酬期間；不同期間的累計報酬不能直接比較。</p>
      <p>策略通過條件：至少 50 筆交易、獲利因子 ≥ 1.2、平均每筆與淨報酬為正、最大回撤 ≤ 35%，且通過樣本層級檢查。少於 20 筆屬樣本不足。均值回歸已在訊號頁提供獨立多策略歷史比較，尚未接入本研究流程的自動判定。</p>
      <p>曝險阻擋優先於策略通過；本機以保證金占淨值 1.5% 為上限代理指標。最終「已驗證」只表示通過目前規則，未代表樣本外驗證或未來獲利。此 指數均線回測於方向翻轉後的下一根開盤換向，期末平倉，不使用訊號卡的第一／第二止盈。</p>
    </details>
  </section>`;
}
function marketScoutPanel(state){
  const filter = state.ui?.agentFilter || 'strong';
  const universe = researchUniverseRows(state);
  const topFive = strongTopFive(state);
  const evidenceUniverse = universe.map(row => ({row,evidence:strongEvidence(state,row)}));
  const blockedCount = evidenceUniverse.filter(({evidence}) =>
    evidence.tradabilityStatus === 'BLOCKED' ||
    String(evidence.riskLabel || '').toUpperCase() === 'BLOCKED'
  ).length;

  let items = [];
  if(filter === 'strong'){
    items = topFive.map(item => ({...item, mode:'top5'}));
  } else {
    let rows = [...universe];
    if(filter==='universe') rows.sort((a,b)=>Number(b?.[4]||0)-Number(a?.[4]||0));
    if(filter==='gain') rows.sort((a,b)=>(Number(b[3])||-999)-(Number(a[3])||-999));
    if(filter==='loss') rows.sort((a,b)=>(Number(a[3])||999)-(Number(b[3])||999));
    if(filter==='liquidity') rows.sort((a,b)=>(Number(b[4])||0)-(Number(a[4])||0));
    const limit = filter === 'universe' ? 40 : 10;
    items = rows.slice(0,limit).map(row => ({row,evidence:strongEvidence(state,row),mode:filter}));
  }

  const cards = items.length ? items.map(({row,evidence,mode},index)=>{
    const [icon,display,last,change,volume,score] = row;
    const symbol = symbolFromDisplay(display);
    const ch = Number(change);
    const strength = Number(score);
    const isComposite = mode === 'top5';
    const reason = isComposite
      ? `Research ${evidence.composite} · ${evidence.strategyMatch} · ${evidence.validatorLabel} · ${evidence.riskLabel}`
      : mode==='universe'
        ? `Tradability ${evidence.tradabilityStatus} · 流動性 #${evidence.liquidityRank}/${evidence.universeSize} · ${evidence.strategyMatch}`
        : filter==='gain' ? `24h 漲幅 ${ch.toFixed(2)}%`
        : filter==='loss' ? `24h 跌幅 ${ch.toFixed(2)}%`
        : `24h 成交額 ${compactVolume(volume)} USDT`;
    const source = isComposite
      ? 'Market Scout · 動態前五名'
      : mode === 'universe'
        ? '全市場掃描'
        : 'Market Scout';
    const scoreValue = isComposite ? evidence.composite : (Number.isFinite(strength) ? strength : '');
    const validatorTone = evidence.validatorLabel === 'PASS' ? 'pass'
      : evidence.validatorLabel === 'REVIEW' ? 'review'
      : evidence.validatorLabel === 'CAUTION' || evidence.validatorLabel === '樣本不足' ? 'caution'
      : 'pending';
    const tradTone = String(evidence.tradabilityStatus || '').toLowerCase() === 'pass' ? 'pass'
      : String(evidence.tradabilityStatus || '').toLowerCase() === 'blocked' ? 'blocked'
      : 'caution';
    const chips = isComposite || mode === 'universe' ? `
      <div class="agent-result-chips">
        <span class="research-chip">${displayStrategyMatch(evidence.strategyMatch)}</span>
        <span class="research-chip research-chip-${tradTone}">${displayStatus(evidence.tradabilityStatus)}</span>
        <span class="research-chip research-chip-${validatorTone}">${displayStatus(evidence.validatorLabel)}</span>
        <span class="research-chip research-chip-${riskTone(evidence.riskLabel)}">${displayStatus(evidence.riskLabel)}</span>
      </div>` : '';

    return `<article class="agent-result-row ${isComposite?'agent-top5-row':''}" data-search="${symbol} ${evidence.strategyMatch} ${evidence.tradabilityStatus}">
      <span class="agent-rank">#${index+1}</span>
      ${coinLogo(display,icon)}
      <div class="agent-result-main">
        <div class="agent-result-title">
          <strong>${display}</strong>
          <span>${last}</span>
        </div>
        ${chips || `<span>${displayText(reason)}</span>`}
        <small class="agent-market-move ${ch>=0?'up':'down'}">${ch>=0?'+':''}${ch.toFixed(2)}% · ${mode==='universe' ? `流動性 #${evidence.liquidityRank}` : compactVolume(volume)}</small>
      </div>
      ${isComposite
        ? `<div class="agent-score-block"><small>研究</small><strong>${evidence.composite}</strong></div>`
        : `<div class="agent-result-metric"><strong>${last}</strong><span class="${ch>=0?'up':'down'}">${ch>=0?'+':''}${ch.toFixed(2)}%</span></div>`}
      <button type="button" class="candidate-add-btn agent-quick-add"
        data-candidate-add="${symbol}"
        data-candidate-source="${source}"
        data-candidate-reason="${reason}"
        data-candidate-score="${scoreValue}"
        data-candidate-direction="${ch>=0?'偏多':'偏空'}">＋ 候選</button>
      <button type="button" class="secondary-btn agent-analyze-choice" data-agent-analyze="${escapeHtml(symbol)}" ${state.agents?.technicalBusy?'disabled':''}>分析並擬定計畫</button>
    </article>`;
  }).join('') : '<div class="empty-state"><strong>市場資料讀取中</strong></div>';

  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['strong','動態前五名'],['universe','全市場'],['gain','漲幅'],['loss','跌幅'],['liquidity','流動性']])}
    <div class="playbook-top market-scout-stats">
      <div><span>市場池</span><strong>${universe.length}</strong></div>
      <div><span>前五名</span><strong>${topFive.length}</strong></div>
      <div><span>阻擋</span><strong>${blockedCount}</strong></div>
      <div><span>資料源</span><strong>穩定幣本位永續</strong></div>
    </div>
    <div class="agent-intro agent-intro-compact"><strong>全市場掃描</strong><span>先找可交易市場，再驗證 技術面／策略優勢／風險。前五名是研究順位，不是買進順位。</span></div>
    <div class="agent-results market-scout-results">${cards}</div>
    ${filter === 'strong' ? topFiveResearchPanel(state) + researchHistoryPanel(state.agents?.researchHistory, state.ui?.researchHistoryId) : ''}
  </div>`;
}
function technicalAgentPanel(state){
  const filter = state.ui?.agentFilter || 'all';
  const technical = state.agents?.technical;
  const groups = {
    all:['15m','1h','4h','12h','1d','1w','1M'],
    intraday:['15m','1h','4h'],
    swing:['4h','12h','1d'],
    position:['1d','1w','1M']
  };
  const allowed = groups[filter] || groups.all;
  const frames = (technical?.frames || []).filter(frame=>allowed.includes(frame.interval));
  const frameHtml = technical?.status === 'LIVE'
    ? `<div class="agent-technical-grid">${frames.map(frame=>{
        const direction = String(frame.direction || '');
        const tone = direction.includes('多') ? 'up' : direction.includes('空') ? 'down' : '';
        return `<div class="agent-tech-card"><span>${displayTimeframe(frame.interval || frame.label)}</span><strong class="${tone}">${direction}</strong><small>20 期指數均線 ${price(frame.ema20)} · 50 期指數均線 ${price(frame.ema50)}</small><b>${Number.isFinite(Number(frame.momentumPct)) ? `${Number(frame.momentumPct)>=0?'+':''}${Number(frame.momentumPct).toFixed(2)}%` : '—'}</b></div>`;
      }).join('')}</div>`
    : `<div class="empty-state"><strong>${technical?.status==='LOADING'?'多週期分析中…':technical?.status==='ERROR'?'多週期分析未完成':'選擇標的後執行多週期分析'}</strong><span>${technical?.status==='ERROR'?'部分技術資料無法讀取，交易計畫另以完整合約資料核對。':'分析完成後自動擬定交易計畫；條件不足時列出等待原因。'}</span></div>`;
  const add = technical?.status === 'LIVE'
    ? agentCandidateButton(technical.symbol,'Technical Analyst',technical.consensus,`data-candidate-direction="${technical.consensus}"`)
    : '';
  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['all','全部週期'],['intraday','短線'],['swing','波段'],['position','中長線']])}
    <form id="agent-technical-form" class="agent-inline-form">
      <label>分析標的<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <button type="button" class="primary-inline-btn" data-agent-technical-run ${state.agents?.technicalBusy?'disabled':''}>${state.agents?.technicalBusy?'分析與擬定中…':'分析並擬定交易計畫'}</button>
    </form>
    ${technical?.symbol?'<button type="button" class="secondary-btn agent-summary-link" data-agent-key="advice">查看進退場摘要</button>':''}
    ${trendOutlookView(technical,state.agents?.tradePlans?.[technical?.symbol],{filter})}
    ${technical?.status==='LIVE'?`<details class="core-disclosure" data-search="technical-indicators"><summary>逐週期指標明細</summary>${frameHtml}</details>`:frameHtml}
    ${technical?.symbol?agentTradePlanView(state.agents?.tradePlans?.[technical.symbol],{symbol:technical.symbol,comparison:state.agents?.planComparisons?.[technical.symbol],comparisonBusy:state.agents?.planComparisonBusy || state.pullback?.comparing}):''}
    ${add ? `<div class="agent-single-action">${add}</div>` : ''}
  </div>`;
}
function newsAgentPanel(state){
  const filter = state.ui?.agentFilter || 'all';
  const themes = (mock.focusAnalysis || []).map((item,index)=>({...item,index,category:index===0?'macro':index===1?'geopolitics':'liquidity'}))
    .filter(item=>filter==='all' || item.category===filter);
  const rows = themes.map(item=>{
    const tradable = item.index===0 ? ['BTCUSDT','ETHUSDT'] : item.index===1 ? ['BTCUSDT','ETHUSDT'] : ['BTCUSDT','ETHUSDT'];
    return `<article class="agent-news-card">
      <div class="agent-news-head"><div><span>${item.horizon}</span><strong>${item.title}</strong></div><b>分析框架</b></div>
      <p>${item.summary}</p>
      <div class="impact-direction-grid">
        <div class="impact-positive"><span>偏利多條件</span><p>${item.bullishCondition}</p></div>
        <div class="impact-negative"><span>偏利空條件</span><p>${item.bearishCondition}</p></div>
      </div>
      <div class="agent-asset-tags">${(item.affectedAssets||[]).map(x=>`<span>${x}</span>`).join('')}</div>
      <div class="agent-news-actions">${tradable.map(symbol=>agentCandidateButton(symbol,`News Impact · ${item.title}`,`受 ${item.title} 影響，方向需等待實際事件確認`)).join('')}</div>
    </article>`;
  }).join('');
  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['all','全部'],['macro','通膨 / 利率'],['geopolitics','地緣 / 能源'],['liquidity','流動性']])}
    <div class="agent-intro"><strong>新聞影響分析</strong><span>目前使用事件分析框架，不把尚未公布或未接入的新聞偽裝成即時利多／利空。</span></div>
    <div class="agent-news-list">${rows}</div>
  </div>`;
}
function validatorAgentPanel(state){
  const filter = state.ui?.agentFilter || 'all';
  const candidateMap = new Map((state.candidates?.items || []).map(item=>[item.symbol,item]));
  const baseSymbols = [];
  for(const row of state.market?.rows || []){
    const symbol = symbolFromDisplay(row?.[1]);
    if(symbol && !baseSymbols.includes(symbol)) baseSymbols.push(symbol);
    if(baseSymbols.length>=12) break;
  }
  for(const symbol of candidateMap.keys()) if(!baseSymbols.includes(symbol)) baseSymbols.unshift(symbol);
  const rows = baseSymbols.map(symbol=>{
    const item = candidateMap.get(symbol);
    const verdict = validatorVerdict(item?.validator);
    return {symbol,item,verdict};
  }).filter(({verdict})=>{
    if(filter==='all') return true;
    if(filter==='pending') return verdict.label==='待驗證' || verdict.label==='樣本不足';
    if(filter==='pass') return verdict.label==='PASS';
    if(filter==='review') return verdict.label==='REVIEW';
    if(filter==='caution') return verdict.label==='CAUTION' || verdict.label==='樣本不足';
    return true;
  }).slice(0,12);
  const html = rows.length ? rows.map(({symbol,item,verdict})=>{
    const result = item?.validator?.result;
    return `<article class="agent-validator-row">
      <div class="agent-result-main"><strong>${symbol}</strong><span>${result ? `交易 ${result.trades} 筆 · 獲利因子 ${result.profitFactor==null?'—':Number(result.profitFactor).toFixed(2)} · 最大回撤 ${pct(result.maxDrawdownPct)}` : '尚未執行候選回測'}</span></div>
      <span class="decision-badge decision-${verdict.tone}">${displayStatus(verdict.label)}</span>
      <button type="button" class="secondary-btn" data-candidate-validate="${symbol}">策略驗證</button>
    </article>`;
  }).join('') : '<div class="empty-state"><strong>目前沒有符合篩選的標的</strong></div>';
  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['all','全部'],['pending','待驗證'],['pass','通過'],['caution','注意'],['review','需複核']])}
    <div class="agent-intro"><strong>策略驗證</strong><span>任何標的都可獨立送入歷史回測；若尚未在候選池，開始驗證時會自動建立候選紀錄。</span></div>
    <div class="agent-validator-list">${html}</div>
  </div>`;
}
function riskAgentPanel(state){
  const filter = state.ui?.agentFilter || 'all';
  const items = (state.candidates?.items || []).filter(item=>{
    const status = String(item.risk?.status || 'UNSCANNED').toLowerCase();
    if(filter==='all') return true;
    if(filter==='unscanned') return !item.risk;
    return status===filter;
  });
  const summary = state.paper?.summary || {};
  const rows = items.length ? items.map(item=>{
    const status = item.risk?.status || '未檢查';
    return `<article class="agent-risk-row">
      <div class="agent-result-main"><strong>${item.symbol}</strong><span>${item.risk ? `模擬保證金 ${Number(item.risk.portfolioRiskPct||0).toFixed(2)}% · 同向 ${item.risk.sameDirectionCount||0}` : '尚未執行曝險檢查'}</span></div>
      <span class="decision-badge decision-${riskTone(item.risk?.status)}">${displayStatus(status)}</span>
      <button type="button" class="secondary-btn" data-candidate-risk="${item.symbol}">執行曝險檢查</button>
    </article>`;
  }).join('') : '<div class="empty-state"><strong>候選池中沒有符合此風險分類的標的</strong></div>';
  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['all','全部'],['unscanned','未檢查'],['pass','通過'],['caution','注意'],['blocked','阻擋']])}
    <div class="agent-risk-summary"><div><span>目前模擬保證金</span><strong>${pct(summary.marginUsagePct ?? summary.portfolioRiskPct)}</strong></div><div><span>曝險上限</span><strong>1.50%</strong></div><div><span>持倉</span><strong>${summary.openPositions || 0}</strong></div></div>
    <div class="agent-intro"><strong>曝險管理</strong><span>輕量版目前以「模擬保證金／淨值」代理曝險；尚未有每筆停損，因此這不是正式的投資組合風險或 R 倍數。</span></div>
    <div class="agent-validator-list">${rows}</div>
  </div>`;
}
function tradeReviewAgentPanel(state){
  const filter = state.ui?.agentFilter || 'all';
  let trades = [...(state.results?.recentTrades || [])];
  trades = trades.filter(trade=>{
    const pnl = Number(trade.netPnl ?? trade.net_pnl_usdt);
    if(filter==='win') return pnl>0;
    if(filter==='loss') return pnl<0;
    return true;
  });
  const rows = trades.length ? trades.map(trade=>{
    const pnl = Number(trade.netPnl ?? trade.net_pnl_usdt);
    const symbol = String(trade.symbol || '');
    const reason = `Trade Review · ${pnl>=0?'獲利':'虧損'}交易 ${money(pnl)}`;
    return `<article class="agent-review-row">
      <div class="agent-result-main"><strong>${symbol || '—'}</strong><span>${displaySide(trade.side)} · ${trade.closedAt ? new Date(trade.closedAt).toLocaleString('zh-TW') : ''}</span></div>
      <strong class="${pnl>=0?'up':'down'}">${money(pnl)}</strong>
      ${symbol ? agentCandidateButton(symbol,'Trade Review Analyst',reason) : ''}
    </article>`;
  }).join('') : '<div class="empty-state"><strong>此分類目前沒有交易紀錄</strong><span>交易檢討只使用已平倉模擬交易。</span></div>';
  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['all','全部'],['win','獲利交易'],['loss','虧損交易']])}
    <div class="agent-intro"><strong>交易檢討分析</strong><span>從真實模擬交易紀錄找重複模式；可把值得重新研究的標的再次加入候選池。</span></div>
    <div class="agent-review-list">${rows}</div>
  </div>`;
}
function playbookAgentPanel(state){
  const plans=Object.values(state.agents?.tradePlans || {}).sort((a,b)=>(b.checkedAt||Infinity)-(a.checkedAt||Infinity));
  const filter = state.ui?.agentFilter || 'all';
  const all = (state.candidates?.items || []).map(item=>({...item,final:candidateFinalState(item)}));
  const items = all.filter(item=>filter==='all' || item.final.label.toLowerCase()===filter);
  const cards = items.length ? items.map(item=>`<article class="playbook-row">
    <div class="agent-result-main"><strong>${item.symbol}</strong><span>${item.technical?.consensus || '技術待分析'} · ${displayStatus(item.risk?.status || '風險待檢查')}</span></div>
    <span class="decision-badge decision-${item.final.tone}">${displayStatus(item.final.label)}</span>
    <div class="playbook-actions">
      <button class="secondary-btn" type="button" data-candidate-analyze="${item.symbol}">技術分析</button>
      <button class="secondary-btn" type="button" data-candidate-risk="${item.symbol}">風險檢查</button>
      <button class="secondary-btn" type="button" data-candidate-validate="${item.symbol}">策略驗證</button>
    </div>
  </article>`).join('') : '<div class="empty-state"><strong>目前沒有符合此狀態的候選</strong></div>';
  return `<div class="agent-panel-stack">
    <div class="agent-intro"><strong>交易策略與進退場計畫</strong><span>技術分析或前五名研究完成後，計畫自動整理於此。只保留本次使用期間的行情，重新開啟需重新分析。</span></div>
    <div class="agent-plan-list">${plans.length?plans.map(record=>agentTradePlanView(record,{comparison:state.agents?.planComparisons?.[record.symbol],comparisonBusy:state.agents?.planComparisonBusy || state.pullback?.comparing})).join(''):'<div class="empty-state"><strong>尚未擬定交易計畫</strong><span>先完成技術分析，或使用下方候選的「技術分析」產生計畫。</span><button type="button" class="primary-inline-btn" data-agent-key="technical">前往技術分析</button></div>'}</div>
    <details class="core-disclosure" data-search="候選驗證清單"><summary>候選驗證與曝險清單</summary>
    ${agentFilterTabs(state,[['all','全部'],['watch','觀察中'],['setup','條件形成中'],['ready','就緒'],['blocked','阻擋']])}
    <div class="playbook-top">
      <div><span>候選池</span><strong>${all.length}</strong></div>
      <div><span>就緒</span><strong>${all.filter(x=>x.final.label==='READY').length}</strong></div>
      <div><span>持倉</span><strong>${state.paper?.summary?.openPositions || 0}</strong></div>
      <div><span>事件</span><strong>${mock.calendar?.length || 0}</strong></div>
    </div>
    <div class="agent-intro"><strong>交易執行手冊</strong><span>把候選、驗證、曝險檢查與持倉整合成每日執行清單；仍不具備真實下單權。</span></div>
    <div class="playbook-list">${cards}</div>
    </details>
  </div>`;
}
function aiAgentsPanel(state){
  const candidates=state.ui?.strategyWorkspace==='candidates';
  const key = candidates?'market':state.ui?.agentKey || 'market';
  let content = candidates?candidatePoolPanel(state):marketScoutPanel(state);
  if(key==='technical') content = technicalAgentPanel(state);
  if(key==='news') content = newsAgentPanel(state);
  if(key==='validator') content = validatorAgentPanel(state);
  if(key==='risk') content = riskAgentPanel(state);
  if(key==='review') content = tradeReviewAgentPanel(state);
  if(key==='playbook') content = playbookAgentPanel(state);
  if(key==='advice') content = agentAdvicePanel(state);
  if(key==='planHistory') content = agentHistoryPanel(state);
  return `<div class="ai-agents-wrap">
    ${agentTabs(state)}
    ${state.agents?.planHistory?.error?`<p role="alert">${escapeHtml(state.agents.planHistory.error)}</p>`:''}
    ${key==='market'?`<div class="selection-source-tabs" aria-label="篩選來源"><button type="button" class="secondary-btn" data-strategy-workspace="agents" data-agent-stage="market" aria-pressed="${!candidates}">市場篩選</button><button type="button" class="secondary-btn" data-strategy-workspace="candidates" aria-pressed="${candidates}">我的候選 · ${state.candidates?.items?.length || 0}</button></div>`:''}
    ${content}
    <details class="core-disclosure workflow-help" data-search="流程使用說明"><summary>流程使用說明</summary><p>分析 → 篩選 → 策略 → 交易建議 → 紀錄。分析完成後，在「交易建議」查看進退場摘要；在「策略」查看依據與完整規則。研究紀錄僅存目前瀏覽器，重新開啟需重新核對點位。</p><p>行情資料完整不代表正式帳本或部位風險已通過核對。僅模擬研究，真實下單維持鎖定，不補造過往交易。</p></details>
  </div>`;
}

function profitabilityPanel(state){
  const s = state.results?.summary || {};
  const backtest = state.backtest?.result || null;
  const top = derivedStrategies(state)[0] || {};
  const trades = Number(s.trades) || 0;
  const expectancy = s.expectancyR == null ? '—' : `${Number(s.expectancyR).toFixed(2)}R`;
  const winRate = trades > 0 ? pct(s.winRatePct) : '—';
  const pf = s.profitFactor == null ? '—' : Number(s.profitFactor).toFixed(2);
  const dd = trades > 0 ? pct(s.maxDrawdownPct) : '—';
  const backtestReturn = backtest?.netReturnPct == null ? '—' : pct(backtest.netReturnPct);
  return `<div class="profit-panel">
    <div class="rd-panel-head"><div><span>收益架構</span><strong>以正期望值與風險控制為核心</strong></div><small>僅使用實際資料</small></div>
    <div class="profit-grid">
      <div><span>期望值</span><strong>${expectancy}</strong><small>前向模擬交易</small></div>
      <div><span>設計風報比</span><strong>${valueOrDash(top.rr)}</strong><small>目前訊號模型</small></div>
      <div><span>勝率</span><strong>${winRate}</strong><small>${trades} 筆已平倉</small></div>
      <div><span>獲利因子</span><strong>${pf}</strong><small>前向模擬交易</small></div>
      <div><span>最大回撤</span><strong>${dd}</strong><small>前向模擬交易</small></div>
      <div><span>最新回測報酬</span><strong>${backtestReturn}</strong><small>${backtest ? '歷史回測' : '待執行'}</small></div>
    </div>
    <p class="rd-note">無足夠樣本時顯示「—」，不以臨時訊號或推估值冒充策略績效。</p>
  </div>`;
}

function strategyLibraryPanel(state){
  const entries = [
    {name:'動能策略',version:'輕量版第一版',type:'動能',status:'訊號運作中',tone:'live',desc:'24 小時動能＋流動性分級，負責目前市場雷達與訊號分類。'},
    {name:'趨勢策略',version:'20／50 期指數均線',type:'趨勢',status:'可回測',tone:'ready',desc:'較慢的趨勢跟隨版本，現有歷史回測引擎可驗證。'},
    {name:'快速趨勢',version:'10／30 期指數均線',type:'趨勢',status:'可回測',tone:'ready',desc:'反應較快的趨勢版本，用來和慢速版本進行比較。'},
    {name:'機構交易結構策略',version:'規劃中',type:'結構',status:'規劃中',tone:'planned',desc:'結構突破、趨勢特徵改變、流動性掃蕩、最佳進場區等結構邏輯。'},
    {name:'均值回歸',version:'研究第一版',type:'均值回歸',status:'可比較 · 未驗證',tone:'ready',desc:'震盪條件下，偏離固定均價區間後收回；在訊號頁先掃描強勢幣，再執行 90 天多策略比較。訊號頁另有收盤快照條件分析，尚未追蹤盤中成交。'},
    {name:'突破策略',version:'研究第一版',type:'突破',status:'可比較 · 未驗證',tone:'ready',desc:'收盤突破前 20 根區間並放量；在訊號頁執行 90 天多策略比較。訊號頁另有收盤快照條件分析，尚未追蹤盤中成交。'}
  ];
  return `<div class="rd-stack">
    ${profitabilityPanel(state)}
    <div class="strategy-library-grid">
      ${entries.map(item=>`<article class="rd-card">
        <div class="rd-card-head"><div><span>${item.type}</span><strong>${item.name}</strong></div><span class="rd-status rd-${item.tone}">${item.status}</span></div>
        <b>${item.version}</b>
        <p>${item.desc}</p>
      </article>`).join('')}
    </div>
  </div>`;
}

function strategyDevelopmentPanel(){
  const steps = [
    ['01','交易假設','先說明為什麼這個策略優勢應該存在。'],
    ['02','市場狀態','定義趨勢／區間／高波動等市場狀態。'],
    ['03','進場','明確定義觸發條件，不使用事後判讀。'],
    ['04','停損','定義失效點、平均真實波幅或結構停損。'],
    ['05','止盈','第一止盈／第二止盈、移動停利與離場規則。'],
    ['06','風險','每筆風險、模擬保證金、槓桿與成本。'],
    ['07','驗證','歷史回測 → 樣本外測試 → 前向模擬交易 → 對照組。']
  ];
  return `<div class="rd-stack">
    <div class="rd-intro"><strong>策略建構器</strong><span>開發規則先固定，再進入歷史驗證；避免看到結果後反向調參。</span></div>
    <div class="rd-flow">${steps.map(([no,title,text])=>`
      <div class="rd-step"><span>${no}</span><div><strong>${title}</strong><p>${text}</p></div></div>
    `).join('')}</div>
    <div class="rd-template">
      <div class="rd-panel-head"><div><span>新策略規格</span><strong>開發模板</strong></div><small>草稿</small></div>
      <div class="rd-spec-grid">
        <div><span>策略名稱</span><strong>尚未命名</strong></div>
        <div><span>適用資產</span><strong>加密貨幣／股票</strong></div>
        <div><span>市場狀態</span><strong>待定義</strong></div>
        <div><span>單筆風險</span><strong>待定義</strong></div>
        <div><span>進場</span><strong>待定義</strong></div>
        <div><span>出場</span><strong>待定義</strong></div>
      </div>
    </div>
  </div>`;
}

function strategyReviewPanel(state){
  const s = state.results?.summary || {};
  const trades = Number(s.trades) || 0;
  const notes = [];
  if(!trades){
    notes.push('目前沒有足夠已平倉前向模擬交易樣本，暫不對策略好壞下結論。');
  } else {
    const wr = Number(s.winRatePct);
    const pf = Number(s.profitFactor);
    const dd = Number(s.maxDrawdownPct);
    if(Number.isFinite(wr) && wr < 45) notes.push('勝率低於 45%，需要檢查是否依靠高風報比 才維持正期望值。');
    if(Number.isFinite(pf) && pf < 1) notes.push('獲利因子低於 1，現有樣本的總獲利尚未覆蓋總虧損。');
    if(Number.isFinite(dd) && dd > 5) notes.push('最大回撤超過 5%，需要檢查部位風險與連續虧損集中度。');
    if(!notes.length) notes.push('目前樣本未觸發基礎警示，但仍需增加樣本並拆解 市場狀態、做多／做空與交易成本。');
  }
  return `<div class="rd-stack">
    ${profitabilityPanel(state)}
    <div class="review-grid">
      <div class="rd-card"><span class="rd-eyebrow">樣本完整性</span><strong>${trades} 筆已平倉</strong><p>${trades >= 30 ? '可開始做初步分層檢討。' : '樣本仍偏少，避免過早優化。'}</p></div>
      <div class="rd-card"><span class="rd-eyebrow">檢討維度</span><strong>市場狀態／方向／成本</strong><p>後續拆解趨勢盤、震盪盤、做多／做空、手續費與滑價。</p></div>
    </div>
    <div class="review-notes"><strong>檢討提示</strong>${notes.map(n=>`<p>• ${n}</p>`).join('')}</div>
  </div>`;
}

function strategyOptimizationPanel(state){
  const b = state.backtest;
  return `<div class="rd-stack">
    <div class="optimization-lanes">
      <article class="opt-card"><span>對照組</span><strong>正式策略基準</strong><p>沿用既有 對照組凍結原則。輕量版訊號不會自動升格成正式策略。</p><small>保持不動，作為比較基準</small></article>
      <article class="opt-card"><span>候選版本</span><strong>20／50 期指數均線</strong><p>可使用現有歷史回測驗證；需再加入 樣本外測試與前向模擬交易。</p><small>${b?.result ? '已有最新回測結果' : '尚未執行最新回測'}</small></article>
      <article class="opt-card"><span>挑戰版本</span><strong>10／30 期指數均線</strong><p>反應較快，需比較交易頻率、成本侵蝕與最大回撤。</p><small>不可只用最高報酬選參數</small></article>
    </div>
    <div class="optimization-rules">
      <strong>優化門檻</strong>
      <div><span>01</span>先增加樣本，不用少量交易調參。</div>
      <div><span>02</span>歷史回測與前向模擬交易必須分離。</div>
      <div><span>03</span>比較期望值、獲利因子、最大回撤、成本後報酬與權益曲線品質。</div>
      <div><span>04</span>新版本先成為 候選版本／挑戰版本，通過驗證才考慮替換對照組。</div>
    </div>
  </div>`;
}

export function strategiesPage(state) {
  const filter = state.ui?.strategyFilter || 'all';
  const workspace = state.ui?.strategyWorkspace || 'signals';
  const isCrypto = (state.ui?.assetClass || 'crypto') === 'crypto';
  const signalsHtml = isCrypto ? `
    ${pullbackPanel(state,Date.now(),{renderMarket:row=>{const market=derivedStrategies(state).find(item=>item.symbol===row.symbol);return market?momentumDetails(market):'';}})}
    <details class="core-disclosure" data-search="market-reference"><summary>市場動能雷達 · 其他標的</summary><h3>${state.pullback?.rows?.length?'其他市場動能':'市場動能參考'}</h3><p class="strategy-note">${state.pullback?.analysisHistorical?'上方為歷史分析；本區列出其他標的目前動能。':state.pullback?.rows?.length?'已分析幣種的動能參考整併於上方主卡；本區只列出其他標的。':'動能評分僅供觀察；請先完成上方分析取得研究條件。'}</p>
    <div class="signal-filter-row">
      ${tab('全部','all',filter,'data-strategy-filter')}
      ${tab('🔥 高強度','HIGH',filter,'data-strategy-filter')}
      ${tab('動能達標','TRIGGERED',filter,'data-strategy-filter')}
      ${tab('接近門檻','READY',filter,'data-strategy-filter')}
      ${tab('形成中','SETUP',filter,'data-strategy-filter')}
      ${tab('觀察','WATCH',filter,'data-strategy-filter')}
    </div>
    <div class="signal-legend">訊號依動能與流動性分級；高強度訊號會特別置頂，但不代表保證買進或獲利。</div>
    ${strategyCards(state)}</details>
    ${smcReference()}
  ` : stockEmptyState('股市策略資料源尚未接入');

  let content = signalsHtml;
  if(workspace === 'agents') content = aiAgentsPanel(state);
  if(workspace === 'candidates') content = aiAgentsPanel(state);
  if(workspace === 'library') content = strategyLibraryPanel(state);
  if(workspace === 'develop') content = strategyDevelopmentPanel();
  if(workspace === 'review') content = strategyReviewPanel(state);
  if(workspace === 'optimize') content = strategyOptimizationPanel(state);

  return `<div class="page-stack strategy-page">${messageBar(state)}
    ${assetClassSwitcher(state)}
    ${strategyWorkspaceTabs(state)}
    ${workspace === 'signals' && isCrypto ? '<div class="signal-source-note">24 小時動能用於選幣；下方以 1 小時與 4 小時收盤資料研究三策略。動能達標、研究條件成立與成交是不同狀態。</div>' : ''}
    ${section(workspace === 'signals' ? '交易訊號' : workspace === 'agents' || workspace === 'candidates' ? '交易研究' : '策略研發', content, badge(workspace === 'signals' ? (isCrypto ? '輕量版訊號' : '無資料') : workspace === 'agents' || workspace === 'candidates' ? '僅模擬 · 實盤鎖定' : '策略研發'))}
    ${strategyAdvancedTools(state)}
  </div>`;
}

function paperPositions(paper){
  if(!paper.positions?.length) return '<div class="empty-state"><strong>目前沒有模擬持倉</strong><span>建立模擬倉位後會顯示於此。</span></div>';
  return `<div class="position-list">${paper.positions.map(p=>`
    <article class="position-card">
      <div class="position-card-head">
        <div><strong>${p.symbol}</strong><span>${displaySide(p.side)} · ${p.leverage || '-'} 倍</span></div>
        <b class="${Number(p.unrealizedPnl)>=0?'up':'down'}">${money(p.unrealizedPnl)}</b>
      </div>
      <div class="position-stats">
        <span><small>進場價</small><strong>${price(p.entry ?? p.entry_fill)}</strong></span>
        <span><small>標記價格</small><strong>${price(p.mark)}</strong></span>
        <span><small>保證金</small><strong>${money(p.margin)}</strong></span>
        <span><small>名目價值</small><strong>${money(p.notional)}</strong></span>
      </div>
      ${p.id && paper.local ? `<button class="danger-btn full-width" data-paper-close="${p.id}" type="button">模擬平倉</button>` : ''}
    </article>`).join('')}</div>`;
}

export function ordersPage(state) {
  const paper = state.paper;
  const summary = paper.summary;
  return `<div class="page-stack">${messageBar(state)}${section('持倉訂單', `
    <div class="metric-grid">
      ${metric('模擬淨值', money(summary.nav))}${metric('帳戶餘額', money(summary.cash))}
      ${metric('未平倉數', summary.openPositions)}${metric('未實現損益', money(summary.unrealizedPnl))}
      ${metric('保證金 / 淨值', pct(summary.portfolioRiskPct))}${metric('資料模式', paper.local ? '本機模擬' : '執行環境')}
    </div>
    <form id="paper-order-form" class="form-grid compact-form">
      <label>幣種<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <label>方向<select name="side"><option value="LONG">做多</option><option value="SHORT">做空</option></select></label>
      <label>槓桿<select name="leverage"><option value="5">5 倍</option><option value="8">8 倍</option><option value="10">10 倍</option></select></label>
      <label>模擬保證金 USDT<input name="margin" type="number" min="1" step="1" value="100" /></label>
    </form>
    <button class="primary-btn" data-paper-open type="button" ${!paper.local || state.market.status !== 'LIVE' ? 'disabled' : ''}>建立模擬倉位</button>
    <p class="guard-note">${!paper.local ? '目前資料來源僅供查閱。' : state.market.status !== 'LIVE' ? '行情尚未更新，暫停建立模擬倉位。' : '本機模擬紀錄僅儲存於此瀏覽器。'}風險限制：總模擬保證金 ≤ 淨值 1.5%；不會送出任何真實訂單。</p>
    ${paperPositions(paper)}`, `${badge('僅模擬交易')} ${badge('真實下單已鎖定')}`)}</div>`;
}

function tradeRows(results){
  if(!results.recentTrades?.length) return '<div class="empty-state"><strong>尚無已平倉交易</strong><span>模擬平倉後會自動進入交易結果。</span></div>';
  return `<div class="trade-list">${results.recentTrades.map(t=>{
    const pnl = Number(t.netPnl ?? t.net_pnl_usdt);
    return `
    <article class="trade-card">
      <div class="trade-card-head"><strong>${t.symbol || '-'}</strong><span>${displaySide(t.side)}</span></div>
      <b class="${pnl>=0?'up':'down'}">${money(pnl)}</b>
      <small>${t.closedAt ? new Date(t.closedAt).toLocaleString('zh-TW') : ''}</small>
    </article>`;
  }).join('')}</div>`;
}
export function resultsPage(state) {
  const results = state.results;
  const s = results.summary;
  return `<div class="page-stack">${messageBar(state)}${section('交易結果', `
    <div class="metric-grid">
      ${metric('交易筆數', s.trades)}${metric('勝率', pct(s.winRatePct))}
      ${metric('期望值', s.expectancyR == null ? '—' : `${Number(s.expectancyR).toFixed(2)}R`)}
      ${metric('獲利因子', s.profitFactor == null ? '—' : Number(s.profitFactor).toFixed(2))}
      ${metric('淨損益', money(s.netPnl))}${metric('最大回撤', pct(s.maxDrawdownPct))}
    </div>
    ${equityChart(results.navCurve,{kind:'paper',local:results.local})}
    ${tradeRows(results)}`, badge(results.local ? '本機模擬交易' : '模擬交易'))}</div>`;
}

export function backtestPage(state) {
  const b = state.backtest;
  const input = b.input || {};
  const result = b.result;
  const resultHtml = result ? `
    <div class="metric-grid">
      ${metric('交易筆數',result.trades)}${metric('勝率',pct(result.winRatePct))}
      ${metric('獲利因子',result.profitFactor == null ? '—' : Number(result.profitFactor).toFixed(2))}
      ${metric('淨報酬率',pct(result.netReturnPct))}${metric('最大回撤',pct(result.maxDrawdownPct))}
      ${backtestAmountFields(b).map(([label,value])=>metric(label,value)).join('')}
      ${metric('樣本數',input.samples || '—')}${metric('驗證層級',displayStatus(result.validation?.label || '—'))}
      ${metric('平均每筆',result.avgTradePct == null ? '—' : pct(result.avgTradePct))}
    </div>
    <div class="backtest-summary">
      <div><span>樣本</span><strong>${input.samples || '—'} K</strong></div>
      <div><span>成本模型</span><strong>${input.costModel || '—'}</strong></div>
      <div><span>時間週期</span><strong>${displayTimeframe(input.timeframe)}</strong></div>
      <div><span>資料來源</span><strong>${displayMarketSource(input.dataSource)}</strong></div>
      <div><span>成交模型</span><strong>${displayExecutionModel(input.executionModel)}</strong></div>
    </div>
    <p class="guard-note">${backtestAmountNote(b)}</p>
    ${equityChart(b.equityCurve)}`
    : `<div class="empty-state"><strong>${b.status==='LOADING'?'歷史回測執行中…':'尚未執行歷史回測'}</strong><span>使用幣安穩定幣本位永續合約歷史 K 線；模擬交易與歷史回測完全分離。</span></div>`;
  return `<div class="page-stack">${messageBar(state)}${section('策略測試', `
    <form id="backtest-form" class="form-grid">
      <label>幣種<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <label>測試期間<select name="range"><option value="30D">30 天</option><option value="90D">90 天</option><option value="180D">180 天</option></select></label>
      <label>策略<select name="strategy"><option value="A">策略甲 · 20／50 期指數均線</option><option value="B">策略乙 · 10／30 期指數均線</option></select></label>
      <label>時間週期<select name="timeframe">
        <option value="15m">15 分鐘</option>
        <option value="1h">1 小時</option>
        <option value="4h">4 小時</option>
        <option value="12h">12 小時</option>
        <option value="1d">日線</option>
        <option value="1w">週線</option>
        <option value="1M">月線</option>
      </select></label>
    </form>
    <button class="primary-btn" data-backtest-run type="button" ${b.status==='LOADING'?'disabled':''}>開始歷史測試</button>
    <p class="guard-note">回測僅使用完整收盤 K 棒；較長週期若歷史 K 線不足，系統會直接顯示樣本不足，不會補造資料。</p>
    ${resultHtml}`, badge('歷史回測'))}</div>`;
}


export function strategyLabPage(state) {
  const tabKey = state.ui?.labTab || 'forward';
  const results = state.results;
  const s = results.summary;
  const b = state.backtest;
  const input = b.input || {};
  const result = b.result;

  const forwardHtml = `
    <div class="metric-grid">
      ${metric('交易筆數', s.trades)}${metric('勝率', pct(s.winRatePct))}
      ${metric('期望值', s.expectancyR == null ? '—' : `${Number(s.expectancyR).toFixed(2)}R`)}
      ${metric('獲利因子', s.profitFactor == null ? '—' : Number(s.profitFactor).toFixed(2))}
      ${metric('淨損益', money(s.netPnl))}${metric('最大回撤', pct(s.maxDrawdownPct))}
    </div>
    ${equityChart(results.navCurve,{kind:'paper',local:results.local})}
    ${tradeRows(results)}
  `;

  const backtestResult = result ? `
    <div class="metric-grid">
      ${metric('交易筆數',result.trades)}${metric('勝率',pct(result.winRatePct))}
      ${metric('獲利因子',result.profitFactor == null ? '—' : Number(result.profitFactor).toFixed(2))}
      ${metric('淨報酬率',pct(result.netReturnPct))}${metric('最大回撤',pct(result.maxDrawdownPct))}
      ${backtestAmountFields(b).map(([label,value])=>metric(label,value)).join('')}
      ${metric('樣本數',input.samples || '—')}${metric('驗證層級',displayStatus(result.validation?.label || '—'))}
      ${metric('平均每筆',result.avgTradePct == null ? '—' : pct(result.avgTradePct))}
    </div>
    <div class="backtest-summary">
      <div><span>樣本</span><strong>${input.samples || '—'} K</strong></div>
      <div><span>成本模型</span><strong>${input.costModel || '—'}</strong></div>
      <div><span>時間週期</span><strong>${displayTimeframe(input.timeframe)}</strong></div>
      <div><span>資料來源</span><strong>${displayMarketSource(input.dataSource)}</strong></div>
      <div><span>成交模型</span><strong>${displayExecutionModel(input.executionModel)}</strong></div>
    </div>
    <p class="guard-note">${backtestAmountNote(b)}</p>
    ${equityChart(b.equityCurve)}
  ` : `<div class="empty-state"><strong>${b.status==='LOADING'?'歷史回測執行中…':'尚未執行歷史回測'}</strong><span>使用幣安穩定幣本位永續合約歷史 K 線；模擬交易與歷史回測完全分離。</span></div>`;

  const backtestHtml = `
    <form id="backtest-form" class="form-grid">
      <label>幣種<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <label>測試期間<select name="range"><option value="30D">30 天</option><option value="90D">90 天</option><option value="180D">180 天</option></select></label>
      <label>策略<select name="strategy"><option value="A">趨勢策略 · 20／50 期指數均線</option><option value="B">快速趨勢 · 10／30 期指數均線</option></select></label>
      <label>時間週期<select name="timeframe">
        <option value="15m">15 分鐘</option>
        <option value="1h">1 小時</option>
        <option value="4h">4 小時</option>
        <option value="12h">12 小時</option>
        <option value="1d">日線</option>
        <option value="1w">週線</option>
        <option value="1M">月線</option>
      </select></label>
    </form>
    <button class="primary-btn" data-backtest-run type="button" ${b.status==='LOADING'?'disabled':''}>開始歷史測試</button>
    <p class="guard-note">支援 15 分鐘／1 小時／4 小時／12 小時／日／週／月；僅使用已收盤 K 線。長週期若樣本不足會直接停止。</p>
    ${backtestResult}
  `;

  return `<div class="page-stack">${messageBar(state)}
    ${section('策略實驗室', `
      <div class="lab-tabs">
        ${tab('模擬績效','forward',tabKey,'data-lab-tab')}
        ${tab('歷史回測','backtest',tabKey,'data-lab-tab')}
        ${tab('交易明細','trades',tabKey,'data-lab-tab')}
      </div>
      ${tabKey==='backtest' ? backtestHtml : tabKey==='trades' ? tradeRows(results) : forwardHtml}
    `, `${badge('僅模擬交易')} ${badge('真實下單已鎖定')}`)}
  </div>`;
}

export const pages = Object.freeze({ home: homePage, strategies: strategiesPage, orders: ordersPage, lab: strategyLabPage, results: state => strategyLabPage({...state, ui:{...state.ui,labTab:'forward'}}), backtest: state => strategyLabPage({...state, ui:{...state.ui,labTab:'backtest'}}) });
