import { mock } from './mock.js';
import { badge, metric, section } from './ui.js';
import { evaluateStrategyGuard } from './strategy_guard.js';

function marketStatusLabel(market) {
  const time = market.updatedAt
    ? new Date(market.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    : '尚未更新';
  return `${market.status} · ${time}`;
}
function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
}
function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
}
function valueOrDash(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}
function price(value) {
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
  return state.ui?.message ? `<div class="flash-message">${state.ui.message}</div>` : '';
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
        <span class="focus-tag">${item.status || 'ANALYSIS'}</span>
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
      <span class="analysis-eyebrow">對 Crypto 的影響</span>
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

    <div class="analysis-disclaimer">目前為 FOXYYA 分析框架內容，非即時新聞 feed；待新聞與經濟數據來源接入後，再以最新事件覆寫這個分析層。</div>
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
      statusLabel = '已觸發';
    } else if(signalScore >= 65 && absChange >= 2){
      status = 'READY';
      statusLabel = '等待觸發';
    } else if(signalScore >= 55 || absChange >= 1.5){
      status = 'SETUP';
      statusLabel = '形成中';
    }
    const stop = price ? price * (side === 'LONG' ? 0.988 : 1.012) : null;
    return {
      symbol,
      strategy:'動能策略 · Lite v1',
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
      note:'Lite 動能訊號依 24h 動能與流動性分級；高強度代表條件共振較高，不等同保證獲利或自動買進。'
    };
  });
}
function strategyCards(state) {
  const priority = { HIGH:5, TRIGGERED:4, READY:3, SETUP:2, WATCH:1 };
  const all = [...derivedStrategies(state)].sort((a,b)=>
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
        <span class="signal-badge signal-${String(strategy.status||'WATCH').toLowerCase()}">${strategy.statusLabel || strategy.status}</span>
      </div>
      <div class="strategy-signal-line">
        <strong class="strategy-direction">${strategy.direction}</strong>
        <span>訊號分數 <b>${valueOrDash(strategy.signalScore)}</b>/100</span>
      </div>
      <div class="mini-grid strategy-metrics">
        <span><em>R:R</em><strong>${valueOrDash(strategy.rr)}</strong></span>
        <span><em>信心</em><strong>${valueOrDash(strategy.confidence)}</strong></span>
        <span><em>Entry</em><strong>${price(strategy.entry)}</strong></span>
        <span><em>Stop</em><strong>${price(strategy.stop)}</strong></span>
        <span><em>TP1</em><strong>${price(strategy.tp1)}</strong></span>
        <span><em>TP2</em><strong>${price(strategy.tp2)}</strong></span>
      </div>
      <p class="strategy-note">${strategy.note || '策略快照僅供觀察，不提供真實下單。'}</p>
      <button class="candidate-add-btn" data-candidate-add="${strategy.symbol}"
        data-candidate-source="交易訊號 · ${strategy.strategy}"
        data-candidate-reason="${strategy.statusLabel || strategy.status} · 訊號分數 ${valueOrDash(strategy.signalScore)}"
        data-candidate-status="${strategy.status || ''}"
        data-candidate-score="${valueOrDash(strategy.signalScore)}"
        data-candidate-direction="${strategy.direction || ''}" type="button">＋ 加入候選池</button>
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
        <span class="signal-badge signal-${String(strategy.status||'WATCH').toLowerCase()}">${strategy.statusLabel || strategy.status}</span>
      </div>
      <b class="strategy-direction">${strategy.direction}</b>
      <div class="opportunity-score">訊號分數 <strong>${valueOrDash(strategy.signalScore)}</strong>/100</div>
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
      ? '24h 波動極端，暫不進入 Top 5'
      : status === 'CAUTION'
        ? '24h 波動偏高，需提高滑價與追價風險警戒'
        : '位於高流動性 USD-M Universe'
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
      <div><span>24h 動能</span><strong class="${changeNum>=0?'up':'down'}">${changeNum>=0?'+':''}${changeNum.toFixed(2)}%</strong></div>
      <div><span>Universe 流動性</span><strong>#${evidence.liquidityRank} / ${evidence.universeSize}</strong></div>
      <div><span>Tradability</span><strong>${evidence.tradabilityStatus} · ${evidence.tradabilityScore}</strong></div>
      <div><span>市場強勢</span><strong>${scoreNum.toFixed(0)} / 100</strong></div>
      <div><span>Research Score</span><strong>${evidence.composite} / 100</strong></div>
      <div><span>Strategy Match</span><strong>${evidence.strategyMatch}</strong></div>
      <div><span>Risk Gate</span><strong>${evidence.riskLabel}</strong></div>
    </div>
    <div class="strong-reasons">
      <div><span>Tradability Gate</span><p>${evidence.tradabilityReason}。目前流動性排名 #${evidence.liquidityRank} / ${evidence.universeSize}，權重 20%。</p></div>
      <div><span>Strategy Match</span><p>${evidence.strategyMatch}。這是待驗證的策略族群，不等於該策略已經盈利。</p></div>
      <div><span>Technical</span><p>${evidence.technicalLabel} · 權重 12%。未分析時採中性分，不假設方向。</p></div>
      <div><span>Strategy Validator</span><p>${evidence.validatorLabel} · 權重 10%。只有實際回測資料才可能成為 PASS。</p></div>
      <div><span>Risk Gate</span><p>${evidence.riskLabel} · 權重 8%。BLOCKED 不得進入 Top 5，但仍保留在 Universe 研究資料。</p></div>
      <div><span>市場基礎</span><p>市場強勢權重 50%；Research Top 5 是研究優先序，不是買進排名。</p></div>
    </div>
    <div class="strong-actions strong-actions-three">
      <button class="candidate-add-btn" data-candidate-add="${selected}"
        data-candidate-source="Market Scout · 綜合強勢 Top 5"
        data-candidate-reason="綜合 Top 5 · 綜合分數 ${evidence.composite} · 市場強勢 ${scoreNum.toFixed(0)}"
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
        <span>#${evidence.liquidityRank}/${evidence.universeSize} · ${evidence.strategyMatch} · ${evidence.validatorLabel}</span>
      </div>
      <div class="strong-score"><small>綜合分數</small><b>${evidence.composite}</b></div>
      <div class="strong-change ${changeNum>=0?'up':'down'}">${changeNum>=0?'+':''}${changeNum.toFixed(2)}%</div>
      <div class="strong-price">${lastPrice}</div>
    </button>`;
  }).join('')}</div>
  ${strongCoinDetail(state,strong)}
  <div class="strong-note">Dynamic Top 5 從完整高流動性 Universe 中產生：Market 50% + Tradability 20% + Technical 12% + Validator 10% + Risk 8%。缺資料採中性值；Risk 或 Tradability BLOCKED 不進 Top 5。僅作研究優先序。</div>`;
}
function tab(label,key,active,attr){
  return `<button type="button" class="tab-btn ${active===key?'active':''}" ${attr}="${key}">${label}</button>`;
}
function assetClassSwitcher(state){
  const active = state.ui?.assetClass || 'crypto';
  return `<div class="asset-switcher" role="tablist" aria-label="資產分類">
    <button type="button" class="asset-switch ${active==='crypto'?'active':''}" data-asset-class="crypto" role="tab" aria-selected="${active==='crypto'}">
      <span>₿</span><div><strong>加密貨幣</strong><small>Crypto</small></div>
    </button>
    <button type="button" class="asset-switch ${active==='stocks'?'active':''}" data-asset-class="stocks" role="tab" aria-selected="${active==='stocks'}">
      <span>▥</span><div><strong>股市</strong><small>Stocks</small></div>
    </button>
  </div>`;
}
function stockEmptyState(title='股市資料源尚未接入'){
  return `<div class="asset-empty">
    <div class="asset-empty-icon">▥</div>
    <strong>${title}</strong>
    <span>股市模組已與加密貨幣分離；目前不會使用 Crypto 行情替代股票資料。下一階段再接入正式股票行情與策略資料源。</span>
  </div>`;
}
function homeSectionTabs(state){
  const active = state.ui?.homeSection || 'market';
  const items = [
    ['market','市場排行','◉'],
    ['strong','強勢 Top 5','◆'],
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
        <div class="event-bottom"><span class="focus-tag">TEMPLATE</span><span>${state.ui?.calendarOpen ? '收合' : '查看本週'} ›</span></div>
      </section>
    </div>

    ${calendarPanel(state)}
    ${homeSectionTabs(state)}

    <section class="panel ranking-panel home-section-panel ${homeSection==='market'?'is-active':''}">
      <div class="section-head premium-head">
        <div class="section-title"><span class="section-symbol">◉</span>市場排行</div>
        <div class="section-meta">${market.source} · ${badge(market.status, market.status)}</div>
      </div>
      ${isCrypto ? `
        <div class="tabs interactive premium-tabs">
          ${tab('熱門','popular',sort,'data-market-sort')}
          ${tab('強勢','strong',sort,'data-market-sort')}
          ${tab('漲幅','gain',sort,'data-market-sort')}
          ${tab('跌幅','loss',sort,'data-market-sort')}
        </div>
        <div class="table-head"><span>幣種</span><span>最新價格</span><span>24h</span></div>
        <div class="coin-list">${coins}</div>
      ` : stockEmptyState('股市行情尚未接入')}
    </section>

    <section class="panel strong-panel home-section-panel ${homeSection==='strong'?'is-active':''}">
      <div class="section-head premium-head">
        <div class="section-title"><span class="section-symbol">◆</span>${isCrypto ? '綜合強勢加密貨幣 Top 5' : '強勢股票 Top 10'}</div>
        <span class="section-quiet">${isCrypto ? '24H MOMENTUM + LIQUIDITY' : 'STOCKS · SEPARATE MODULE'}</span>
      </div>
      ${isCrypto ? strongCoinCards(state) : stockEmptyState('強勢股票排行待接入')}
    </section>

    <section class="panel focus-panel home-section-panel ${homeSection==='focus'?'is-active':''}">
      <div class="section-head premium-head">
        <div class="section-title"><span class="section-symbol">◌</span>國際焦點</div>
        <span class="section-quiet">STATIC</span>
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
    ['15m','15分'],
    ['1h','1H'],
    ['4h','4H'],
    ['12h','12H'],
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
    <div class="timeframe-note">目前 Lite 交易訊號仍以 24h 動能＋流動性為基準；週期按鈕先作為策略分析工作區，待多週期訊號引擎接入後再分別計算。</div>
  </div>`;
}
function strategyWorkspaceTabs(state){
  const active = state.ui?.strategyWorkspace || 'signals';
  const items = [
    ['signals','訊號'],
    ['agents','AI Agents'],
    ['candidates','候選池'],
    ['library','策略庫'],
    ['develop','策略開發'],
    ['review','策略檢討'],
    ['optimize','策略優化']
  ];
  return `<div class="strategy-workspace-tabs" role="tablist" aria-label="策略研發工作區">
    ${items.map(([key,label])=>`
      <button type="button" class="strategy-workspace-btn ${active===key?'active':''}" data-strategy-workspace="${key}" role="tab" aria-selected="${active===key}">${label}</button>
    `).join('')}
  </div>`;
}

function validatorVerdict(validator){
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
    return `<div class="candidate-tf"><span>${frame.label}</span><strong class="${tone}">${dir}</strong><small>${frame.status==='LIVE' && Number.isFinite(Number(frame.momentumPct)) ? `${Number(frame.momentumPct)>=0?'+':''}${Number(frame.momentumPct).toFixed(2)}%` : frame.status}</small></div>`;
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
          <div><strong>${item.symbol}</strong><span>${item.source || '候選池'} · ${added}</span></div>
        </div>
        <span class="decision-badge decision-${finalState.tone}">${finalState.label}</span>
      </div>
      <p class="candidate-reason">${item.reason || '手動加入候選池'}</p>
      <div class="evidence-matrix">
        <div><span>MARKET</span><strong>${item.signal?.score != null ? `Score ${item.signal.score}` : '已加入'}</strong><small>${item.signal?.direction || item.source || '—'}</small></div>
        <div><span>TECHNICAL</span><strong>${item.technical?.consensus || '待分析'}</strong><small>${item.technical?.status || '—'}</small></div>
        <div><span>VALIDATOR</span><strong class="decision-text-${validator.tone}">${validator.label}</strong><small>${item.validator?.result ? `${Number(vr.trades)||0} trades · PF ${vr.profitFactor == null ? '—' : Number(vr.profitFactor).toFixed(2)} · DD ${pct(vr.maxDrawdownPct)}` : '尚未回測'}</small></div>
        <div><span>RISK GATE</span><strong class="decision-text-${riskTone(item.risk?.status)}">${riskStatus}</strong><small>${item.risk ? `${Number(item.risk.portfolioRiskPct||0).toFixed(2)}% / 1.50%` : '待檢查'}</small></div>
      </div>
      ${candidateTechnical(item)}
      ${item.risk?.reasons?.length ? `<div class="risk-reasons">${item.risk.reasons.map(reason=>`<p>• ${reason}</p>`).join('')}</div>` : ''}
      <div class="candidate-actions">
        <button type="button" class="secondary-btn" data-candidate-analyze="${item.symbol}">多週期分析</button>
        <button type="button" class="secondary-btn" data-candidate-validate="${item.symbol}">策略驗證</button>
        <button type="button" class="secondary-btn" data-candidate-risk="${item.symbol}">Risk Gate</button>
        <button type="button" class="danger-btn" data-candidate-remove="${item.symbol}">移出候選</button>
      </div>
    </article>`;
  }).join('') : '<div class="empty-state"><strong>候選池目前是空的</strong><span>可從 Dynamic Top 5、Universe Scanner、交易訊號，或下方手動加入標的。</span></div>';

  return `<div class="candidate-pool-wrap">
    <form id="candidate-manual-form" class="candidate-manual-form">
      <label>手動加入<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <button type="button" class="primary-inline-btn" data-candidate-manual-add>＋ 加入候選</button>
    </form>
    <div class="candidate-pool-summary">
      <div><span>候選數</span><strong>${items.length}</strong></div>
      <p>Agent 可獨立分析；只有你選擇的標的才會進入候選池。Risk Gate 具有阻擋權，但不會送出真實訂單。</p>
    </div>
    <div class="candidate-list">${rows}</div>
  </div>`;
}


function agentTabs(state){
  const active = state.ui?.agentKey || 'market';
  const agents = [
    ['market','01','Market Scout'],
    ['technical','02','Technical'],
    ['news','03','News Impact'],
    ['validator','04','Validator'],
    ['risk','05','Risk Manager'],
    ['review','06','Trade Review'],
    ['playbook','07','Playbook']
  ];
  return `<div class="agent-tabs" role="tablist" aria-label="FOXYYA AI Agents">
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
    ? new Date(research.updatedAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})
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
    const technical = item.technical?.consensus || (item.technicalError ? 'Technical ERROR' : '待分析');
    const changeClass = Number(result.netReturnPct) >= 0 ? 'up' : 'down';

    const metrics = item.backtest ? `
      <div class="agent-research-metrics">
        <span><small>Trades</small><strong>${result.trades ?? '—'}</strong></span>
        <span><small>Win Rate</small><strong>${pct(result.winRatePct)}</strong></span>
        <span><small>PF</small><strong>${result.profitFactor == null ? '—' : Number(result.profitFactor).toFixed(2)}</strong></span>
        <span><small>Avg Trade</small><strong>${pct(result.avgTradePct)}</strong></span>
        <span><small>Net Return</small><strong class="${changeClass}">${pct(result.netReturnPct)}</strong></span>
        <span><small>Max DD</small><strong>${pct(result.maxDrawdownPct)}</strong></span>
      </div>`
      : `<div class="candidate-empty-line">${spec.supported === false ? spec.reason : item.error || '尚未完成 baseline 回測'}</div>`;

    const strategyChip = item.strategyMatch || '待配對';
    const guardChip = guard.label || '待驗證';

    return `<details class="agent-research-card research-compact-card" data-search="${item.symbol} ${item.strategyMatch} ${guard.label} ${decision.label}">
      <summary class="agent-research-summary">
        <span class="research-rank">#${item.rank}</span>
        ${coinLogo(item.symbol,item.symbol?.slice(0,1),true)}
        <div class="research-summary-main">
          <strong>${item.symbol}</strong>
          <div class="research-chip-row">
            <span class="research-chip">${strategyChip}</span>
            <span class="research-chip research-chip-${guard.tone || 'pending'}">${guardChip}</span>
            <span class="research-chip research-chip-${riskTone(item.risk?.status)}">${risk}</span>
          </div>
        </div>
        <div class="research-score"><small>Research</small><b>${item.researchScore ?? '—'}</b></div>
        <span class="decision-badge decision-${decision.tone || 'pending'}">${decision.label || 'PENDING'}</span>
        <span class="research-chevron">⌄</span>
      </summary>
      <div class="research-detail-body">
        <div class="agent-research-evidence">
          <div><span>TECHNICAL</span><strong>${technical}</strong></div>
          <div><span>STRATEGY MATCH</span><strong>${item.strategyMatch || '—'}</strong></div>
          <div><span>BASELINE</span><strong>${spec.supported ? `${spec.strategyLabel} · ${String(spec.timeframe||'').toUpperCase()} · ${spec.range}` : '未支援'}</strong></div>
          <div><span>GUARD</span><strong class="decision-text-${guard.tone || 'pending'}">${guard.label || '—'}</strong></div>
          <div><span>RISK</span><strong class="decision-text-${riskTone(item.risk?.status)}">${risk}</strong></div>
          <div><span>DATA</span><strong>${input.dataSource || '—'}</strong></div>
        </div>
        ${metrics}
        <div class="research-detail-footer">
          <span>${guard.reason || spec.reason || '固定 baseline 驗證'}</span>
          ${item.status === 'DONE' || item.status === 'ERROR' ? `
            <button type="button" class="candidate-add-btn" data-research-promote="${item.symbol}">升格 Candidate</button>
          ` : ''}
        </div>
      </div>
    </details>`;
  }).join('') : '<div class="empty-state research-empty"><strong>尚未執行 Top 5 Research</strong><span>按下驗證後，系統會逐隻執行 Technical、固定 baseline 回測、Strategy Guard 與 Risk Gate。</span></div>';

  return `<section class="agent-research-panel research-cockpit">
    <div class="agent-research-head research-cockpit-head">
      <div>
        <span class="research-eyebrow">RESEARCH PIPELINE</span>
        <strong>Top 5 全套驗證</strong>
        <small>固定規則 · 不針對單一標的調參 · 更新 ${updated}</small>
      </div>
      <button type="button" class="primary-inline-btn research-run-btn" data-top5-research-run ${running?'disabled':''}>
        ${running ? `執行中 ${progress}/${total}` : '開始全套驗證'}
      </button>
    </div>

    <div class="research-status-grid">
      <div class="research-status-pass"><span>VALIDATED</span><strong>${counts.validated}</strong></div>
      <div class="research-status-caution"><span>CAUTION</span><strong>${counts.caution}</strong></div>
      <div class="research-status-review"><span>REVIEW</span><strong>${counts.review}</strong></div>
      <div class="research-status-blocked"><span>BLOCKED</span><strong>${counts.blocked}</strong></div>
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
      <p>Trend：EMA20/50 · 4H · 2Y；Momentum / Breakout Watch：EMA10/30 · 1H · 1Y；Range 尚未實作 Mean Reversion baseline，因此只研究、不偽裝成已驗證策略。</p>
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
      ? 'Market Scout · Dynamic Top 5'
      : mode === 'universe'
        ? 'Universe Scanner'
        : 'Market Scout';
    const scoreValue = isComposite ? evidence.composite : (Number.isFinite(strength) ? strength : '');
    return `<article class="agent-result-row" data-search="${symbol} ${evidence.strategyMatch} ${evidence.tradabilityStatus}">
      <span class="agent-rank">#${index+1}</span>
      ${coinLogo(display,icon)}
      <div class="agent-result-main"><strong>${display}</strong><span>${reason}</span></div>
      <div class="agent-result-metric"><strong>${last}</strong><span class="${ch>=0?'up':'down'}">${ch>=0?'+':''}${ch.toFixed(2)}%</span></div>
      ${agentCandidateButton(symbol,source,reason,`data-candidate-score="${scoreValue}" data-candidate-direction="${ch>=0?'偏多':'偏空'}"`)}
    </article>`;
  }).join('') : '<div class="empty-state"><strong>市場資料讀取中</strong></div>';

  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['strong','Dynamic Top 5'],['universe','Universe'],['gain','漲幅'],['loss','跌幅'],['liquidity','流動性']])}
    <div class="playbook-top">
      <div><span>Universe</span><strong>${universe.length}</strong></div>
      <div><span>Top 5</span><strong>${topFive.length}</strong></div>
      <div><span>Blocked</span><strong>${blockedCount}</strong></div>
      <div><span>Source</span><strong>USD-M</strong></div>
    </div>
    <div class="agent-intro"><strong>Universe Scanner</strong><span>先從 Binance USD-M 高流動性市場池建立 Universe，再由 Market / Tradability / Technical / Validator / Risk 產生 Dynamic Top 5。Strategy Match 是待驗證方向，不是盈利保證。</span></div>
    <div class="agent-results">${cards}</div>
    ${filter === 'strong' ? topFiveResearchPanel(state) : ''}
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
        return `<div class="agent-tech-card"><span>${frame.label}</span><strong class="${tone}">${direction}</strong><small>EMA20 ${price(frame.ema20)} · EMA50 ${price(frame.ema50)}</small><b>${Number.isFinite(Number(frame.momentumPct)) ? `${Number(frame.momentumPct)>=0?'+':''}${Number(frame.momentumPct).toFixed(2)}%` : '—'}</b></div>`;
      }).join('')}</div>`
    : '<div class="empty-state"><strong>選擇標的後執行多週期分析</strong><span>資料直接使用 Binance USD-M Fully Closed Bar。</span></div>';
  const add = technical?.status === 'LIVE'
    ? agentCandidateButton(technical.symbol,'Technical Analyst',technical.consensus,`data-candidate-direction="${technical.consensus}"`)
    : '';
  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['all','全部週期'],['intraday','短線'],['swing','波段'],['position','中長線']])}
    <form id="agent-technical-form" class="agent-inline-form">
      <label>分析標的<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <button type="button" class="primary-inline-btn" data-agent-technical-run>執行分析</button>
    </form>
    ${technical?.status==='LIVE' ? `<div class="agent-consensus"><span>多週期共識</span><strong>${technical.consensus}</strong><small>${technical.source}</small></div>` : ''}
    ${frameHtml}
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
      <div class="agent-news-head"><div><span>${item.horizon}</span><strong>${item.title}</strong></div><b>FRAMEWORK</b></div>
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
    <div class="agent-intro"><strong>News Impact Analyst</strong><span>目前使用事件分析框架，不把尚未公布或未接入的新聞偽裝成即時利多／利空。</span></div>
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
      <div class="agent-result-main"><strong>${symbol}</strong><span>${result ? `${result.trades} trades · PF ${result.profitFactor==null?'—':Number(result.profitFactor).toFixed(2)} · DD ${pct(result.maxDrawdownPct)}` : '尚未執行候選回測'}</span></div>
      <span class="decision-badge decision-${verdict.tone}">${verdict.label}</span>
      <button type="button" class="secondary-btn" data-candidate-validate="${symbol}">策略驗證</button>
    </article>`;
  }).join('') : '<div class="empty-state"><strong>目前沒有符合篩選的標的</strong></div>';
  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['all','全部'],['pending','待驗證'],['pass','PASS'],['caution','CAUTION'],['review','REVIEW']])}
    <div class="agent-intro"><strong>Strategy Validator</strong><span>任何標的都可獨立送入歷史回測；若尚未在候選池，開始驗證時會自動建立候選紀錄。</span></div>
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
      <div class="agent-result-main"><strong>${item.symbol}</strong><span>${item.risk ? `Portfolio Risk ${Number(item.risk.portfolioRiskPct||0).toFixed(2)}% · 同向 ${item.risk.sameDirectionCount||0}` : '尚未執行 Risk Gate'}</span></div>
      <span class="decision-badge decision-${riskTone(item.risk?.status)}">${status}</span>
      <button type="button" class="secondary-btn" data-candidate-risk="${item.symbol}">執行 Risk Gate</button>
    </article>`;
  }).join('') : '<div class="empty-state"><strong>候選池中沒有符合此風險分類的標的</strong></div>';
  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['all','全部'],['unscanned','未檢查'],['pass','PASS'],['caution','CAUTION'],['blocked','BLOCKED']])}
    <div class="agent-risk-summary"><div><span>目前 Portfolio Risk</span><strong>${pct(summary.portfolioRiskPct)}</strong></div><div><span>風險上限</span><strong>1.50%</strong></div><div><span>持倉</span><strong>${summary.openPositions || 0}</strong></div></div>
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
      <div class="agent-result-main"><strong>${symbol || '—'}</strong><span>${trade.side || '—'} · ${trade.closedAt ? new Date(trade.closedAt).toLocaleString('zh-TW') : ''}</span></div>
      <strong class="${pnl>=0?'up':'down'}">${money(pnl)}</strong>
      ${symbol ? agentCandidateButton(symbol,'Trade Review Analyst',reason) : ''}
    </article>`;
  }).join('') : '<div class="empty-state"><strong>此分類目前沒有交易紀錄</strong><span>Trade Review 只使用已平倉 Paper 交易。</span></div>';
  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['all','全部'],['win','獲利交易'],['loss','虧損交易']])}
    <div class="agent-intro"><strong>Trade Review Analyst</strong><span>從真實 Paper 交易紀錄找重複模式；可把值得重新研究的標的再次加入候選池。</span></div>
    <div class="agent-review-list">${rows}</div>
  </div>`;
}
function playbookAgentPanel(state){
  const filter = state.ui?.agentFilter || 'all';
  const all = (state.candidates?.items || []).map(item=>({...item,final:candidateFinalState(item)}));
  const items = all.filter(item=>filter==='all' || item.final.label.toLowerCase()===filter);
  const cards = items.length ? items.map(item=>`<article class="playbook-row">
    <div class="agent-result-main"><strong>${item.symbol}</strong><span>${item.technical?.consensus || '技術待分析'} · ${item.risk?.status || 'Risk 待檢查'}</span></div>
    <span class="decision-badge decision-${item.final.tone}">${item.final.label}</span>
    <div class="playbook-actions">
      <button class="secondary-btn" type="button" data-candidate-analyze="${item.symbol}">Technical</button>
      <button class="secondary-btn" type="button" data-candidate-risk="${item.symbol}">Risk</button>
      <button class="secondary-btn" type="button" data-candidate-validate="${item.symbol}">Validate</button>
    </div>
  </article>`).join('') : '<div class="empty-state"><strong>目前沒有符合此狀態的候選</strong></div>';
  return `<div class="agent-panel-stack">
    ${agentFilterTabs(state,[['all','全部'],['watch','WATCH'],['setup','SETUP'],['ready','READY'],['blocked','BLOCKED']])}
    <div class="playbook-top">
      <div><span>候選池</span><strong>${all.length}</strong></div>
      <div><span>READY</span><strong>${all.filter(x=>x.final.label==='READY').length}</strong></div>
      <div><span>持倉</span><strong>${state.paper?.summary?.openPositions || 0}</strong></div>
      <div><span>事件</span><strong>${mock.calendar?.length || 0}</strong></div>
    </div>
    <div class="agent-intro"><strong>Trading Playbook</strong><span>把候選、驗證、Risk Gate 與持倉整合成每日執行清單；仍不具備真實下單權。</span></div>
    <div class="playbook-list">${cards}</div>
  </div>`;
}
function aiAgentsPanel(state){
  const key = state.ui?.agentKey || 'market';
  let content = marketScoutPanel(state);
  if(key==='technical') content = technicalAgentPanel(state);
  if(key==='news') content = newsAgentPanel(state);
  if(key==='validator') content = validatorAgentPanel(state);
  if(key==='risk') content = riskAgentPanel(state);
  if(key==='review') content = tradeReviewAgentPanel(state);
  if(key==='playbook') content = playbookAgentPanel(state);
  return `<div class="ai-agents-wrap">
    <div class="agent-system-note"><strong>FOXYYA AI Agents v1</strong><span>Agent 彼此獨立；篩選結果可自由加入 Candidate Pool。現階段分析只使用已接入的市場、Paper、回測與事件框架資料。</span></div>
    ${agentTabs(state)}
    ${content}
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
    <div class="rd-panel-head"><div><span>收益架構</span><strong>以正期望值與風險控制為核心</strong></div><small>REAL DATA ONLY</small></div>
    <div class="profit-grid">
      <div><span>Expectancy</span><strong>${expectancy}</strong><small>Forward Paper</small></div>
      <div><span>設計 R:R</span><strong>${valueOrDash(top.rr)}</strong><small>目前訊號模型</small></div>
      <div><span>勝率</span><strong>${winRate}</strong><small>${trades} 筆已平倉</small></div>
      <div><span>Profit Factor</span><strong>${pf}</strong><small>Forward Paper</small></div>
      <div><span>最大回撤</span><strong>${dd}</strong><small>Forward Paper</small></div>
      <div><span>最新回測報酬</span><strong>${backtestReturn}</strong><small>${backtest ? '歷史回測' : '待執行'}</small></div>
    </div>
    <p class="rd-note">無足夠樣本時顯示「—」，不以臨時訊號或推估值冒充策略績效。</p>
  </div>`;
}

function strategyLibraryPanel(state){
  const entries = [
    {name:'動能策略',version:'Lite v1',type:'Momentum',status:'訊號運作中',tone:'live',desc:'24h 動能＋流動性分級，負責目前市場雷達與訊號分類。'},
    {name:'趨勢策略',version:'EMA20 / 50',type:'Trend',status:'可回測',tone:'ready',desc:'較慢的趨勢跟隨版本，現有歷史回測引擎可驗證。'},
    {name:'快速趨勢',version:'EMA10 / 30',type:'Trend',status:'可回測',tone:'ready',desc:'反應較快的趨勢版本，用來和慢速版本進行比較。'},
    {name:'ICT 結構策略',version:'Planned',type:'Structure',status:'規劃中',tone:'planned',desc:'BOS、CHoCH、Liquidity Sweep、OTE 等結構邏輯。'},
    {name:'均值回歸',version:'Planned',type:'Mean Reversion',status:'規劃中',tone:'planned',desc:'震盪市場用，後續驗證 RSI、VWAP deviation 等條件。'},
    {name:'突破策略',version:'Planned',type:'Breakout',status:'規劃中',tone:'planned',desc:'區間突破、成交量與波動擴張的方向性策略。'}
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
    ['01','交易假設','先說明為什麼這個 edge 應該存在。'],
    ['02','市場狀態','定義 Trend / Range / High Volatility 等 Regime。'],
    ['03','Entry','明確定義觸發條件，不使用事後判讀。'],
    ['04','Stop','定義失效點、ATR 或結構停損。'],
    ['05','Take Profit','TP1 / TP2、移動停利與離場規則。'],
    ['06','Risk','每筆風險、Portfolio Risk、槓桿與成本。'],
    ['07','Validation','Backtest → OOS → Forward Paper → Control。']
  ];
  return `<div class="rd-stack">
    <div class="rd-intro"><strong>Strategy Builder</strong><span>開發規則先固定，再進入歷史驗證；避免看到結果後反向調參。</span></div>
    <div class="rd-flow">${steps.map(([no,title,text])=>`
      <div class="rd-step"><span>${no}</span><div><strong>${title}</strong><p>${text}</p></div></div>
    `).join('')}</div>
    <div class="rd-template">
      <div class="rd-panel-head"><div><span>新策略規格</span><strong>開發模板</strong></div><small>DRAFT</small></div>
      <div class="rd-spec-grid">
        <div><span>策略名稱</span><strong>尚未命名</strong></div>
        <div><span>適用資產</span><strong>Crypto / Stocks</strong></div>
        <div><span>Regime</span><strong>待定義</strong></div>
        <div><span>Risk / Trade</span><strong>待定義</strong></div>
        <div><span>Entry</span><strong>待定義</strong></div>
        <div><span>Exit</span><strong>待定義</strong></div>
      </div>
    </div>
  </div>`;
}

function strategyReviewPanel(state){
  const s = state.results?.summary || {};
  const trades = Number(s.trades) || 0;
  const notes = [];
  if(!trades){
    notes.push('目前沒有足夠已平倉 Forward Paper 樣本，暫不對策略好壞下結論。');
  } else {
    const wr = Number(s.winRatePct);
    const pf = Number(s.profitFactor);
    const dd = Number(s.maxDrawdownPct);
    if(Number.isFinite(wr) && wr < 45) notes.push('勝率低於 45%，需要檢查是否依靠高 R:R 才維持正期望值。');
    if(Number.isFinite(pf) && pf < 1) notes.push('Profit Factor 低於 1，現有樣本的總獲利尚未覆蓋總虧損。');
    if(Number.isFinite(dd) && dd > 5) notes.push('最大回撤超過 5%，需要檢查部位風險與連續虧損集中度。');
    if(!notes.length) notes.push('目前樣本未觸發基礎警示，但仍需增加樣本並拆解 Regime、Long / Short 與交易成本。');
  }
  return `<div class="rd-stack">
    ${profitabilityPanel(state)}
    <div class="review-grid">
      <div class="rd-card"><span class="rd-eyebrow">樣本完整性</span><strong>${trades} 筆已平倉</strong><p>${trades >= 30 ? '可開始做初步分層檢討。' : '樣本仍偏少，避免過早優化。'}</p></div>
      <div class="rd-card"><span class="rd-eyebrow">檢討維度</span><strong>Regime / Direction / Cost</strong><p>後續拆解趨勢盤、震盪盤、Long / Short、手續費與滑價。</p></div>
    </div>
    <div class="review-notes"><strong>檢討提示</strong>${notes.map(n=>`<p>• ${n}</p>`).join('')}</div>
  </div>`;
}

function strategyOptimizationPanel(state){
  const b = state.backtest;
  return `<div class="rd-stack">
    <div class="optimization-lanes">
      <article class="opt-card"><span>CONTROL</span><strong>正式策略基準</strong><p>沿用既有 Control Freeze 原則。Lite 訊號不會自動升格成正式策略。</p><small>保持不動，作為比較基準</small></article>
      <article class="opt-card"><span>CANDIDATE</span><strong>EMA20 / 50</strong><p>可使用現有歷史回測驗證；需再加入 OOS 與 Forward Paper。</p><small>${b?.result ? '已有最新回測結果' : '尚未執行最新回測'}</small></article>
      <article class="opt-card"><span>CHALLENGER</span><strong>EMA10 / 30</strong><p>反應較快，需比較交易頻率、成本侵蝕與最大回撤。</p><small>不可只用最高報酬選參數</small></article>
    </div>
    <div class="optimization-rules">
      <strong>優化門檻</strong>
      <div><span>01</span>先增加樣本，不用少量交易調參。</div>
      <div><span>02</span>Historical Backtest 與 Forward Paper 必須分離。</div>
      <div><span>03</span>比較 Expectancy、PF、Drawdown、成本後報酬與 Equity Curve 品質。</div>
      <div><span>04</span>新版本先成為 Candidate / Challenger，通過驗證才考慮替換 Control。</div>
    </div>
  </div>`;
}

export function strategiesPage(state) {
  const filter = state.ui?.strategyFilter || 'all';
  const workspace = state.ui?.strategyWorkspace || 'signals';
  const isCrypto = (state.ui?.assetClass || 'crypto') === 'crypto';
  const signalsHtml = isCrypto ? `
    <div class="signal-filter-row">
      ${tab('全部','all',filter,'data-strategy-filter')}
      ${tab('🔥 高強度','HIGH',filter,'data-strategy-filter')}
      ${tab('已觸發','TRIGGERED',filter,'data-strategy-filter')}
      ${tab('等待觸發','READY',filter,'data-strategy-filter')}
      ${tab('形成中','SETUP',filter,'data-strategy-filter')}
      ${tab('觀察','WATCH',filter,'data-strategy-filter')}
    </div>
    <div class="signal-legend">訊號依動能與流動性分級；高強度訊號會特別置頂，但不代表保證買進或獲利。</div>
    ${strategyCards(state)}
  ` : stockEmptyState('股市策略資料源尚未接入');

  let content = signalsHtml;
  if(workspace === 'agents') content = aiAgentsPanel(state);
  if(workspace === 'candidates') content = candidatePoolPanel(state);
  if(workspace === 'library') content = strategyLibraryPanel(state);
  if(workspace === 'develop') content = strategyDevelopmentPanel();
  if(workspace === 'review') content = strategyReviewPanel(state);
  if(workspace === 'optimize') content = strategyOptimizationPanel(state);

  return `<div class="page-stack">${messageBar(state)}
    ${assetClassSwitcher(state)}
    ${strategyWorkspaceTabs(state)}
    ${workspace === 'signals' ? strategyTimeframeTabs(state) : ''}
    ${section(workspace === 'signals' ? '交易訊號' : workspace === 'agents' ? 'AI Agents' : workspace === 'candidates' ? 'Candidate Pool' : '策略研發', content, badge(workspace === 'signals' ? (isCrypto ? 'LIVE SIGNALS' : 'EMPTY') : workspace === 'agents' ? '7 AGENTS' : workspace === 'candidates' ? `${state.candidates?.items?.length || 0} CANDIDATES` : 'R&D'))}
  </div>`;
}

function paperPositions(paper){
  if(!paper.positions?.length) return '<div class="empty-state"><strong>目前沒有模擬持倉</strong><span>建立模擬倉位後會顯示於此。</span></div>';
  return `<div class="position-list">${paper.positions.map(p=>`
    <article class="position-card">
      <div class="position-card-head">
        <div><strong>${p.symbol}</strong><span>${p.side} · ${p.leverage || '-'}x</span></div>
        <b class="${Number(p.unrealizedPnl)>=0?'up':'down'}">${money(p.unrealizedPnl)}</b>
      </div>
      <div class="position-stats">
        <span><small>Entry</small><strong>${price(p.entry ?? p.entry_fill)}</strong></span>
        <span><small>Mark</small><strong>${price(p.mark)}</strong></span>
        <span><small>Margin</small><strong>${money(p.margin)}</strong></span>
        <span><small>Notional</small><strong>${money(p.notional)}</strong></span>
      </div>
      ${p.id ? `<button class="danger-btn full-width" data-paper-close="${p.id}" type="button">模擬平倉</button>` : ''}
    </article>`).join('')}</div>`;
}

export function ordersPage(state) {
  const paper = state.paper;
  const summary = paper.summary;
  return `<div class="page-stack">${messageBar(state)}${section('持倉訂單', `
    <div class="metric-grid">
      ${metric('模擬淨值', money(summary.nav))}${metric('可用資金', money(summary.cash))}
      ${metric('未平倉數', summary.openPositions)}${metric('未實現損益', money(summary.unrealizedPnl))}
      ${metric('保證金 / 淨值', pct(summary.portfolioRiskPct))}${metric('資料模式', paper.local ? '本機模擬' : '執行環境')}
    </div>
    <form id="paper-order-form" class="form-grid compact-form">
      <label>幣種<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <label>方向<select name="side"><option value="LONG">做多</option><option value="SHORT">做空</option></select></label>
      <label>槓桿<select name="leverage"><option value="5">5x</option><option value="8">8x</option><option value="10">10x</option></select></label>
      <label>模擬保證金 USDT<input name="margin" type="number" min="1" step="1" value="100" /></label>
    </form>
    <button class="primary-btn" data-paper-open type="button">建立 PAPER 倉位</button>
    <p class="guard-note">風險限制：總模擬保證金 ≤ 淨值 1.5%；不會送出任何真實訂單。</p>
    ${paperPositions(paper)}`, `${badge('PAPER ONLY')} ${badge('REAL ORDER LOCKED')}`)}</div>`;
}

function tradeRows(results){
  if(!results.recentTrades?.length) return '<div class="empty-state"><strong>尚無已平倉交易</strong><span>模擬平倉後會自動進入交易結果。</span></div>';
  return `<div class="trade-list">${results.recentTrades.map(t=>{
    const pnl = Number(t.netPnl ?? t.net_pnl_usdt);
    return `
    <article class="trade-card">
      <div class="trade-card-head"><strong>${t.symbol || '-'}</strong><span>${t.side || '-'}</span></div>
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
      ${metric('樣本數',input.samples || '—')}${metric('驗證層級',result.validation?.label || '—')}
      ${metric('平均每筆',result.avgTradePct == null ? '—' : pct(result.avgTradePct))}
    </div>
    <div class="backtest-summary">
      <div><span>樣本</span><strong>${input.samples || '—'} K</strong></div>
      <div><span>成本模型</span><strong>${input.costModel || '—'}</strong></div>
      <div><span>時間週期</span><strong>${String(input.timeframe || '—').toUpperCase()}</strong></div>
      <div><span>資料來源</span><strong>${input.dataSource || '—'}</strong></div>
    </div>
    <div class="chart-placeholder"><span>權益曲線</span><strong>${b.equityCurve?.length || 0} 個權益節點</strong></div>`
    : `<div class="empty-state"><strong>${b.status==='LOADING'?'歷史回測執行中…':'尚未執行歷史回測'}</strong><span>使用 Binance USD-M 歷史 K 線；模擬交易與歷史回測完全分離。</span></div>`;
  return `<div class="page-stack">${messageBar(state)}${section('策略測試', `
    <form id="backtest-form" class="form-grid">
      <label>幣種<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <label>測試期間<select name="range"><option value="90D">90 天</option><option value="180D">180 天</option><option value="1Y">1 年</option></select></label>
      <label>策略<select name="strategy"><option value="A">策略 A · EMA20/50</option><option value="B">策略 B · EMA10/30</option></select></label>
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
    <p class="guard-note">回測僅使用 Fully Closed Bar；較長週期若歷史 K 線不足，系統會直接顯示樣本不足，不會補造資料。</p>
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
    ${tradeRows(results)}
  `;

  const backtestResult = result ? `
    <div class="metric-grid">
      ${metric('交易筆數',result.trades)}${metric('勝率',pct(result.winRatePct))}
      ${metric('獲利因子',result.profitFactor == null ? '—' : Number(result.profitFactor).toFixed(2))}
      ${metric('淨報酬率',pct(result.netReturnPct))}${metric('最大回撤',pct(result.maxDrawdownPct))}
      ${metric('樣本數',input.samples || '—')}${metric('驗證層級',result.validation?.label || '—')}
      ${metric('平均每筆',result.avgTradePct == null ? '—' : pct(result.avgTradePct))}
    </div>
    <div class="backtest-summary">
      <div><span>樣本</span><strong>${input.samples || '—'} K</strong></div>
      <div><span>成本模型</span><strong>${input.costModel || '—'}</strong></div>
      <div><span>時間週期</span><strong>${String(input.timeframe || '—').toUpperCase()}</strong></div>
      <div><span>資料來源</span><strong>${input.dataSource || '—'}</strong></div>
    </div>
    <div class="chart-placeholder"><span>權益曲線</span><strong>${b.equityCurve?.length || 0} 個權益節點</strong></div>
  ` : `<div class="empty-state"><strong>${b.status==='LOADING'?'歷史回測執行中…':'尚未執行歷史回測'}</strong><span>使用 Binance USD-M 歷史 K 線；模擬交易與歷史回測完全分離。</span></div>`;

  const backtestHtml = `
    <form id="backtest-form" class="form-grid">
      <label>幣種<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <label>測試期間<select name="range"><option value="90D">90 天</option><option value="180D">180 天</option><option value="1Y">1 年</option></select></label>
      <label>策略<select name="strategy"><option value="A">趨勢策略 · EMA20/50</option><option value="B">快速趨勢 · EMA10/30</option></select></label>
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
    <p class="guard-note">支援 15m / 1H / 4H / 12H / 日 / 週 / 月；僅使用已收盤 K 線。長週期若樣本不足會直接停止。</p>
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
    `, `${badge('PAPER ONLY')} ${badge('NO REAL ORDERS')}`)}
  </div>`;
}

export const pages = Object.freeze({ home: homePage, strategies: strategiesPage, orders: ordersPage, lab: strategyLabPage, results: strategyLabPage, backtest: strategyLabPage });
