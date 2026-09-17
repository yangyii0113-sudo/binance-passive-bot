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

function percent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
}

export function homePage(state) {
  const market = state.market;
  const coins = market.rows.map(([icon, symbol, price, change]) => {
    const hasChange = Number.isFinite(change);
    const changeText = hasChange ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—';
    const changeClass = !hasChange ? '' : change >= 0 ? 'up' : 'down';
    return `<div class="coin-row"><span class="coin-icon">${icon}</span><strong>${symbol}</strong><span>${price}</span><b class="${changeClass}">${changeText}</b></div>`;
  }).join('');

  const news = mock.news.map(([n, title, text, tag]) => `
    <article class="news-row">
      <div class="news-num">${n}</div>
      <div><h3>${title}</h3><p>${text}</p></div>
      ${badge(tag)}
    </article>`).join('');

  const strategy = state.strategy.items[0];
  const strategyContent = strategy
    ? `<div class="strategy-card"><div class="coin-icon large">₿</div><div class="strategy-main"><strong>${strategy.symbol}</strong><span>${strategy.strategy}</span><b>${strategy.direction}</b>${badge(strategy.statusLabel || strategy.status)}<p>${strategy.note || '等待下一步確認。'}</p></div></div>`
    : `<div class="empty-state"><strong>策略 Snapshot 尚未接入</strong><span>市場行情可獨立運作；策略服務失效時不影響首頁。</span></div>`;

  return `<div class="page-stack">
    ${section('市場脈動', `
      <div class="market-meta"><span>${market.source}</span>${badge(marketStatusLabel(market), market.status)}</div>
      <div class="market-summary">
        <div><span>市場方向</span><strong>${market.direction}</strong></div>
        <div><span>風險情緒</span><strong class="muted-strong">${market.sentiment}</strong></div>
      </div>
      <div class="tabs"><span>收藏</span><span class="active">熱門</span><span>漲幅</span><span>跌幅</span><span>成交額</span></div>
      <div class="table-head"><span>幣種</span><span>最新價格</span><span>24h</span></div>
      <div class="coin-list">${coins}</div>`, badge(market.status, market.status))}

    ${section('國際熱點', `
      <div class="tabs compact"><span class="active">新聞</span><span>經濟日曆</span></div>
      <div class="news-list">${news}</div>
      <div class="calendar-row"><span>▣</span><div><strong>重要事件日曆</strong><small>關注關鍵經濟數據與國際事件，掌握市場變化。</small></div><span>前值 —　預期 —　公布值 —　›</span></div>`)}

    ${section('策略機會', strategyContent, badge(state.strategy.status, state.strategy.status))}
  </div>`;
}

export function strategiesPage(state) {
  const cards = state.strategy.items.map((strategy) => `
    <article class="detail-card">
      <div class="row-between"><strong>${strategy.symbol}</strong>${badge(strategy.statusLabel || strategy.status)}</div>
      <h3>${strategy.strategy} · ${strategy.direction}</h3>
      <div class="mini-grid"><span>R:R<strong>${strategy.rr ?? '—'}</strong></span><span>信心<strong>${strategy.confidence ?? '—'}</strong></span><span>Entry<strong>${strategy.entry ?? '—'}</strong></span><span>Stop<strong>${strategy.stop ?? '—'}</strong></span></div>
      <p>${strategy.note || '策略 Snapshot'}</p>
    </article>`).join('');
  const content = cards || '<div class="empty-state"><strong>目前沒有策略 Snapshot</strong><span>Strategy Adapter 尚未接入；不影響 Market 模組。</span></div>';
  return `<div class="page-stack">${section('交易策略', `<div class="tabs"><span class="active">觀察中</span><span>等待進場</span><span>已失效</span></div><div class="cards-grid">${content}</div>`, badge(state.strategy.status, state.strategy.status))}</div>`;
}

export function ordersPage(state) {
  const summary = state.paper.summary;
  return `<div class="page-stack">${section('持倉訂單', `<div class="metric-grid">${metric('Paper NAV', money(summary.nav))}${metric('Cash', money(summary.cash))}${metric('Open Positions', summary.openPositions)}${metric('Pending Orders', summary.pendingOrders)}${metric('Unrealized PnL', money(summary.unrealizedPnl))}${metric('Portfolio Risk', percent(summary.portfolioRiskPct))}</div><div class="empty-state"><strong>目前沒有模擬持倉</strong><span>Paper Snapshot 尚未接入，平台其他模組仍可正常使用。</span></div>`, `${badge('PAPER ONLY')} ${badge('REAL ORDER LOCKED')} ${badge(state.paper.status, state.paper.status)}`)}</div>`;
}

export function resultsPage(state) {
  const summary = state.results.summary;
  return `<div class="page-stack">${section('交易結果', `<div class="metric-grid">${metric('Trades', summary.trades)}${metric('Win Rate', percent(summary.winRatePct))}${metric('Expectancy', summary.expectancyR == null ? '—' : `${summary.expectancyR}R`)}${metric('Profit Factor', summary.profitFactor ?? '—')}${metric('Net PnL', money(summary.netPnl))}${metric('Max Drawdown', percent(summary.maxDrawdownPct))}</div><div class="chart-placeholder"><span>NAV Curve</span><strong>等待 Forward Paper 資料</strong></div>`, `${badge('FORWARD PAPER')} ${badge(state.results.status, state.results.status)}`)}</div>`;
}

export function backtestPage(state) {
  return `<div class="page-stack">${section('策略測試', `<div class="form-grid"><label>幣種<select><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label><label>時間區間<select><option>1Y</option><option>180D</option><option>90D</option></select></label><label>策略<select><option>策略 A</option><option>策略 B</option></select></label><label>Timeframe<select><option>1H</option><option>4H</option></select></label></div><button class="primary-btn" type="button">開始測試</button><div class="empty-state"><strong>Backtest Adapter 尚未接入</strong><span>Historical Backtest 與 Forward Paper 保持完全分離。</span></div>`, `${badge('HISTORICAL BACKTEST')} ${badge(state.backtest.status, state.backtest.status)}`)}</div>`;
}

export const pages = Object.freeze({
  home: homePage,
  strategies: strategiesPage,
  orders: ordersPage,
  results: resultsPage,
  backtest: backtestPage
});
