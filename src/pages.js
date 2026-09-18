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
function coinCode(symbol){
  const normalized = String(symbol || '').toUpperCase().replace(/[^A-Z]/g,'');
  if(normalized.startsWith('BTC')) return 'btc';
  if(normalized.startsWith('ETH')) return 'eth';
  if(normalized.startsWith('SOL')) return 'sol';
  return null;
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
  return (state.market?.rows || []).map((row,index)=>{
    const price = numberPrice(row[2]);
    const change = Number(row[3]);
    const symbol = String(row[1]).replace(/\s|\//g,'');
    const side = change < -1.5 ? 'SHORT' : 'LONG';
    const active = Number.isFinite(change) && Math.abs(change) >= 2;
    const stop = price ? price * (side === 'LONG' ? 0.988 : 1.012) : null;
    return {
      symbol,
      strategy:`Lite ${index === 0 ? 'A' : 'B'} · 24h heuristic`,
      direction: side === 'LONG' ? '偏多觀察' : '偏空觀察',
      status: active ? 'PENDING' : 'WATCH',
      statusLabel: active ? '等待進場' : '觀察中',
      entry: price,
      stop,
      tp1: price ? price * (side === 'LONG' ? 1.02 : 0.98) : null,
      tp2: price ? price * (side === 'LONG' ? 1.035 : 0.965) : null,
      rr: 1.67,
      confidence: Number.isFinite(change) ? (Math.abs(change) >= 2 ? '中' : '低') : '—',
      note:'Lite 臨時觀察訊號：僅依 24h 動能產生，非正式策略引擎。'
    };
  });
}
function strategyCards(state) {
  const all = derivedStrategies(state);
  const filter = state.ui?.strategyFilter || 'all';
  const items = filter === 'all' ? all : all.filter(item => item.status === filter);
  if (!items.length) return '<div class="empty-state"><strong>此分類目前沒有策略</strong><span>等待更多樣本或正式 Strategy Runtime。</span></div>';
  return `<div class="cards-grid">${items.map((strategy) => `
    <article class="detail-card strategy-detail-card" data-search="${strategy.symbol} ${strategy.strategy}">
      <div class="strategy-card-head">
        <div class="strategy-card-meta">
          <strong class="strategy-symbol">${strategy.symbol}</strong>
          <span class="strategy-name">${strategy.strategy}</span>
        </div>
        ${badge(strategy.statusLabel || strategy.status)}
      </div>
      <div class="strategy-direction">${strategy.direction}</div>
      <div class="mini-grid strategy-metrics">
        <span><em>R:R</em><strong>${valueOrDash(strategy.rr)}</strong></span>
        <span><em>信心</em><strong>${valueOrDash(strategy.confidence)}</strong></span>
        <span><em>Entry</em><strong>${price(strategy.entry)}</strong></span>
        <span><em>Stop</em><strong>${price(strategy.stop)}</strong></span>
        <span><em>TP1</em><strong>${price(strategy.tp1)}</strong></span>
        <span><em>TP2</em><strong>${price(strategy.tp2)}</strong></span>
      </div>
      <p class="strategy-note">${strategy.note || '策略快照僅供觀察，不提供真實下單。'}</p>
    </article>`).join('')}</div>`;
}
function strategyOpportunity(state) {
  const strategy = derivedStrategies(state)[0];
  if (!strategy) return '<div class="empty-state"><strong>策略機會等待資料</strong></div>';
  return `<div class="strategy-card strategy-opportunity">
    ${coinLogo(strategy.symbol, strategy.symbol.startsWith('BTC') ? '₿' : '◇', true)}
    <div class="strategy-main">
      <div class="strategy-opportunity-top">
        <div><strong>${strategy.symbol}</strong><span>${strategy.strategy}</span></div>
        ${badge(strategy.statusLabel || strategy.status)}
      </div>
      <b class="strategy-direction">${strategy.direction}</b>
      <p class="strategy-note">${strategy.note}</p>
      <button class="text-btn" data-go-strategies type="button">查看條件與圖表 ›</button>
    </div>
  </div>`;
}
function sortedRows(state){
  const rows = [...(state.market?.rows || [])];
  const sort = state.ui?.marketSort || 'popular';
  if(sort === 'gain') rows.sort((a,b)=>(Number(b[3])||-999)-(Number(a[3])||-999));
  if(sort === 'loss') rows.sort((a,b)=>(Number(a[3])||999)-(Number(b[3])||999));
  return rows;
}
function tab(label,key,active,attr){
  return `<button type="button" class="tab-btn ${active===key?'active':''}" ${attr}="${key}">${label}</button>`;
}

export function homePage(state) {
  const market = state.market;
  const coins = sortedRows(state).map(([icon, symbol, price, change]) => {
    const hasChange = Number.isFinite(change);
    const changeText = hasChange ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—';
    const changeClass = !hasChange ? '' : change >= 0 ? 'up' : 'down';
    return `<div class="coin-row" data-search="${symbol}">
      ${coinLogo(symbol, icon)}
      <strong>${symbol}</strong>
      <span>${price}</span>
      <b class="${changeClass} change-pill">${changeText}</b>
    </div>`;
  }).join('');
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
      <div class="tabs interactive premium-tabs">
        ${tab('熱門','popular',sort,'data-market-sort')}
        ${tab('漲幅','gain',sort,'data-market-sort')}
        ${tab('跌幅','loss',sort,'data-market-sort')}
      </div>
      <div class="table-head"><span>幣種</span><span>最新價格</span><span>24h</span></div>
      <div class="coin-list">${coins}</div>
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
      ${strategyOpportunity(state)}
    </section>
  </div>`;
}

export function strategiesPage(state) {
  const filter = state.ui?.strategyFilter || 'all';
  return `<div class="page-stack">${messageBar(state)}${section('交易策略', `
    <div class="tabs interactive">
      ${tab('全部','all',filter,'data-strategy-filter')}
      ${tab('觀察中','WATCH',filter,'data-strategy-filter')}
      ${tab('等待進場','PENDING',filter,'data-strategy-filter')}
    </div>
    ${strategyCards(state)}`, badge(state.strategy?.items?.length ? state.strategy.status : 'LITE'))}</div>`;
}

function paperPositions(paper){
  if(!paper.positions?.length) return '<div class="empty-state"><strong>目前沒有模擬持倉</strong><span>建立 PAPER 倉位後會顯示於此。</span></div>';
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
      ${metric('Paper NAV', money(summary.nav))}${metric('Cash', money(summary.cash))}
      ${metric('Open Positions', summary.openPositions)}${metric('Unrealized PnL', money(summary.unrealizedPnl))}
      ${metric('Margin / NAV', pct(summary.portfolioRiskPct))}${metric('Mode', paper.local ? 'LOCAL' : 'RUNTIME')}
    </div>
    <form id="paper-order-form" class="form-grid compact-form">
      <label>幣種<select name="symbol"><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label>
      <label>方向<select name="side"><option value="LONG">LONG</option><option value="SHORT">SHORT</option></select></label>
      <label>槓桿<select name="leverage"><option value="5">5x</option><option value="8">8x</option><option value="10">10x</option></select></label>
      <label>模擬保證金 USDT<input name="margin" type="number" min="1" step="1" value="100" /></label>
    </form>
    <button class="primary-btn" data-paper-open type="button">建立 PAPER 倉位</button>
    <p class="guard-note">Lite Risk Guard：總模擬保證金 ≤ NAV 1.5%；不會送出任何真實訂單。</p>
    ${paperPositions(paper)}`, `${badge('PAPER ONLY')} ${badge('REAL ORDER LOCKED')}`)}</div>`;
}

function tradeRows(results){
  if(!results.recentTrades?.length) return '<div class="empty-state"><strong>尚無已平倉交易</strong><span>Paper 平倉後會自動進入 Results。</span></div>';
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
      ${metric('Trades', s.trades)}${metric('Win Rate', pct(s.winRatePct))}
      ${metric('Expectancy', s.expectancyR == null ? '—' : `${Number(s.expectancyR).toFixed(2)}R`)}
      ${metric('Profit Factor', s.profitFactor == null ? '—' : Number(s.profitFactor).toFixed(2))}
      ${metric('Net PnL', money(s.netPnl))}${metric('Max Drawdown', pct(s.maxDrawdownPct))}
    </div>
    ${tradeRows(results)}`, badge(results.local ? 'LOCAL FORWARD PAPER' : 'FORWARD PAPER'))}</div>`;
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
      <label>幣種<select name="symbol"><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label>
      <label>測試期間<select name="range"><option value="90D">90 天</option><option value="180D">180 天</option><option value="1Y">1 年</option></select></label>
      <label>策略<select name="strategy"><option value="A">策略 A · EMA20/50</option><option value="B">策略 B · EMA10/30</option></select></label>
      <label>時間週期<select name="timeframe"><option value="1h">1 小時</option><option value="4h">4 小時</option></select></label>
    </form>
    <button class="primary-btn" data-backtest-run type="button" ${b.status==='LOADING'?'disabled':''}>開始歷史測試</button>
    ${resultHtml}`, badge('歷史回測'))}</div>`;
}

export const pages = Object.freeze({ home: homePage, strategies: strategiesPage, orders: ordersPage, results: resultsPage, backtest: backtestPage });
