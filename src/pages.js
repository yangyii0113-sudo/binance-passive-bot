import { mock } from './mock.js';
import { badge, metric, section } from './ui.js';

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
function marketSymbolOptions(state, limit = 20){
  const symbols = [];
  const seen = new Set();
  for(const row of state.market?.rows || []){
    const symbol = symbolFromDisplay(row?.[1]);
    if(!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
    if(symbols.length >= limit) break;
  }
  if(!symbols.length) symbols.push('BTCUSDT','ETHUSDT','SOLUSDT');
  return symbols.map(symbol => `<option value="${symbol}" ${state.ui?.selectedSymbol === symbol ? 'selected' : ''}>${symbol.replace(/USDT$/,' / USDT')}</option>`).join('');
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
      <div class="calendar-event-main">
        <span class="focus-tag">${item.category}</span>
        <strong>${item.title}</strong>
        <small>影響：${item.impact}</small>
      </div>
      <span class="calendar-time">${item.timing}</span>
    </article>`).join('');
  return `<section class="panel calendar-panel" id="event-calendar-panel">
    <div class="section-head premium-head">
      <div class="section-title"><span class="section-symbol">▣</span>事件日曆</div>
      <button class="section-link" data-event-calendar type="button">關閉 ×</button>
    </div>
    <div class="calendar-panel-note">目前為事件監看模板；即時前值／預期／公布值資料源尚未接入，不會偽裝成即時數據。</div>
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
function strongCoinDetail(state, strong){
  const selected = state.ui?.selectedStrongSymbol;
  if(!selected) return '';
  const row = strong.find(item => symbolFromDisplay(item[1]) === selected);
  if(!row) return '';
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
      <span class="strong-tier">${tier} · ${scoreNum.toFixed(0)} 分</span>
    </div>
    <div class="strong-detail-grid">
      <div><span>最新價格</span><strong>${lastPrice}</strong></div>
      <div><span>24h 動能</span><strong class="${changeNum>=0?'up':'down'}">${changeNum>=0?'+':''}${changeNum.toFixed(2)}%</strong></div>
      <div><span>24h 成交額</span><strong>${compactVolume(quoteVolume)} USDT</strong></div>
      <div><span>篩選狀態</span><strong>${tier}</strong></div>
    </div>
    <div class="strong-reasons">
      <div><span>價格動能</span><p>${changeNum >= 3 ? '短線動能明顯高於中性區間。' : changeNum > 0 ? '價格維持正向動能，但需觀察延續性。' : '流動性較佳，但價格動能尚未轉強。'}</p></div>
      <div><span>流動性</span><p>已通過 FOXYYA 高成交額市場池篩選，降低極低流動性幣種干擾。</p></div>
      <div><span>風險提醒</span><p>強勢排行是市場雷達，不等同進場訊號；需再經策略、停損與風險額度確認。</p></div>
    </div>
    <div class="strong-actions">
      <button class="secondary-btn" data-use-backtest="${selected}" type="button">用此幣歷史回測</button>
      <button class="primary-inline-btn" data-use-paper="${selected}" type="button">帶入模擬交易</button>
    </div>
  </div>`;
}
function strongCoinCards(state){
  const strong = [...(state.market?.rows || [])]
    .filter(row => Number.isFinite(Number(row?.[5])))
    .sort((a,b)=>Number(b[5])-Number(a[5]))
    .slice(0,10);
  if(!strong.length) return '<div class="empty-state"><strong>強勢幣種資料讀取中</strong><span>等待市場成交額與動能資料。</span></div>';
  return `<div class="strong-grid">${strong.map((row,index)=>{
    const [icon, display, lastPrice, change, quoteVolume, score] = row;
    const changeNum = Number(change);
    const symbol = symbolFromDisplay(display);
    const selected = state.ui?.selectedStrongSymbol === symbol;
    return `<button class="strong-card ${selected?'is-selected':''}" data-strong-symbol="${symbol}" type="button" aria-expanded="${selected}">
      <div class="strong-rank">#${index+1}</div>
      ${coinLogo(display, icon)}
      <div class="strong-main">
        <strong>${display}</strong>
        <span>24h 成交額 ${compactVolume(quoteVolume)} USDT</span>
      </div>
      <div class="strong-score"><small>強勢分數</small><b>${Number(score).toFixed(0)}</b></div>
      <div class="strong-change ${changeNum>=0?'up':'down'}">${changeNum>=0?'+':''}${changeNum.toFixed(2)}%</div>
      <div class="strong-price">${lastPrice}</div>
    </button>`;
  }).join('')}</div>
  ${strongCoinDetail(state,strong)}
  <div class="strong-note">強勢分數依 24h 價格動能與成交額流動性計算，僅作市場篩選，不代表未來報酬或買進建議。</div>`;
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

export function homePage(state) {
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

  const focusCard = ([, title, text, tag], index, featured = false) => `
    <button class="focus-card ${featured ? 'focus-featured' : ''} ${Number(state.ui?.focusAnalysisIndex) === index ? 'is-selected' : ''}"
      data-search="${title} ${text} ${tag}" data-focus-analysis="${index}" type="button"
      aria-expanded="${Number(state.ui?.focusAnalysisIndex) === index}">
      <div class="focus-icon">${featured ? '◎' : '◇'}</div>
      <div class="focus-copy">
        <h3>${title}</h3>
        <p>${text}</p>
        <span class="focus-tag">${tag}</span>
      </div>
      <span class="focus-arrow">›</span>
    </button>`;

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

    <section class="panel ranking-panel">
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

    <section class="panel strong-panel">
      <div class="section-head premium-head">
        <div class="section-title"><span class="section-symbol">◆</span>${isCrypto ? '強勢加密貨幣 Top 10' : '強勢股票 Top 10'}</div>
        <span class="section-quiet">${isCrypto ? '24H MOMENTUM + LIQUIDITY' : 'STOCKS · SEPARATE MODULE'}</span>
      </div>
      ${isCrypto ? strongCoinCards(state) : stockEmptyState('強勢股票排行待接入')}
    </section>

    <section class="panel focus-panel">
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

    <section class="panel opportunity-panel">
      <div class="section-head premium-head">
        <div class="section-title"><span class="section-symbol">◎</span>策略機會</div>
        <button class="section-link" data-go-strategies type="button">查看全部 ›</button>
      </div>
      ${isCrypto ? strategyOpportunity(state) : stockEmptyState('股市策略模組待接入')}
    </section>
  </div>`;
}

export function strategiesPage(state) {
  const filter = state.ui?.strategyFilter || 'all';
  const isCrypto = (state.ui?.assetClass || 'crypto') === 'crypto';
  return `<div class="page-stack">${messageBar(state)}
    ${assetClassSwitcher(state)}
    ${section('交易訊號', isCrypto ? `
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
    ` : stockEmptyState('股市策略資料源尚未接入'), badge(isCrypto ? (state.strategy?.items?.length ? state.strategy.status : 'LITE') : 'EMPTY'))}
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
      ${metric('樣本數',input.samples || '—')}
    </div>
    <div class="backtest-summary">
      <div><span>樣本</span><strong>${input.samples || '—'} K</strong></div>
      <div><span>成本模型</span><strong>${input.costModel || '—'}</strong></div>
      <div><span>時間週期</span><strong>${String(input.timeframe || '—').toUpperCase()}</strong></div>
    </div>
    <div class="chart-placeholder"><span>權益曲線</span><strong>${b.equityCurve?.length || 0} 個權益節點</strong></div>`
    : `<div class="empty-state"><strong>${b.status==='LOADING'?'歷史回測執行中…':'尚未執行歷史回測'}</strong><span>使用 Binance USD-M 歷史 K 線；模擬交易與歷史回測完全分離。</span></div>`;
  return `<div class="page-stack">${messageBar(state)}${section('策略測試', `
    <form id="backtest-form" class="form-grid">
      <label>幣種<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <label>測試期間<select name="range"><option value="90D">90 天</option><option value="180D">180 天</option><option value="1Y">1 年</option></select></label>
      <label>策略<select name="strategy"><option value="A">策略 A · EMA20/50</option><option value="B">策略 B · EMA10/30</option></select></label>
      <label>時間週期<select name="timeframe"><option value="1h">1 小時</option><option value="4h">4 小時</option></select></label>
    </form>
    <button class="primary-btn" data-backtest-run type="button" ${b.status==='LOADING'?'disabled':''}>開始歷史測試</button>
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
      ${metric('樣本數',input.samples || '—')}
    </div>
    <div class="backtest-summary">
      <div><span>樣本</span><strong>${input.samples || '—'} K</strong></div>
      <div><span>成本模型</span><strong>${input.costModel || '—'}</strong></div>
      <div><span>時間週期</span><strong>${String(input.timeframe || '—').toUpperCase()}</strong></div>
    </div>
    <div class="chart-placeholder"><span>權益曲線</span><strong>${b.equityCurve?.length || 0} 個權益節點</strong></div>
  ` : `<div class="empty-state"><strong>${b.status==='LOADING'?'歷史回測執行中…':'尚未執行歷史回測'}</strong><span>使用 Binance USD-M 歷史 K 線；模擬交易與歷史回測完全分離。</span></div>`;

  const backtestHtml = `
    <form id="backtest-form" class="form-grid">
      <label>幣種<select name="symbol">${marketSymbolOptions(state)}</select></label>
      <label>測試期間<select name="range"><option value="90D">90 天</option><option value="180D">180 天</option><option value="1Y">1 年</option></select></label>
      <label>策略<select name="strategy"><option value="A">趨勢策略 · EMA20/50</option><option value="B">快速趨勢 · EMA10/30</option></select></label>
      <label>時間週期<select name="timeframe"><option value="1h">1 小時</option><option value="4h">4 小時</option></select></label>
    </form>
    <button class="primary-btn" data-backtest-run type="button" ${b.status==='LOADING'?'disabled':''}>開始歷史測試</button>
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
