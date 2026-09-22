import { mock } from './mock.js';
import { badge, metric, section } from './ui.js';
import { STATUS } from './status.js';
import { emptyPaperSnapshot, emptyResultsSnapshot } from './contracts.js';
import { createViewState, selectMarketRows, selectStrategyItems } from './view.js';

function filterButtons(action, selected, options, label) {
  return `<div class="tabs" role="group" aria-label="${label}">${options.map(([value, text]) =>
    `<button type="button" data-action="${action}" data-value="${value}" aria-pressed="${selected === value}">${text}</button>`).join('')}</div>`;
}

function marketStatusLabel(market) {
  const time = market.updatedAt
    ? new Date(market.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    : '尚未更新';
  return `${market.status} · ${time}`;
}

function money(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
}

function pct(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
}

function valueOrDash(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function snapshotNotice(snapshot) {
  if (snapshot.status === STATUS.LIVE) {
    return '唯讀快照已載入；正式交易帳本尚未驗證。數字不代表已完成帳本對帳。';
  }
  if (snapshot.status === STATUS.ERROR) {
    return '資料讀取失敗；目前資產、持倉與績效未知，不代表空倉或零損益。';
  }
  if (snapshot.status === STATUS.STALE) {
    return '快照已過期；等待更新與帳本驗證，暫不顯示目前資產或績效。';
  }
  return '資料尚未取得；目前資產、持倉與績效未知，等待唯讀快照與帳本驗證。';
}

function strategyCards(strategySnapshot, view) {
  if (!strategySnapshot.items.length) {
    const message = strategySnapshot.status === 'ERROR'
      ? '策略資料目前讀取失敗；可繼續查看公開行情。'
      : '等待策略資料來源提供唯讀快照；目前沒有可供篩選的資料。';
    return `<div class="empty-state"><strong>目前沒有策略快照</strong><span>${message}</span></div>`;
  }

  const selected = selectStrategyItems(strategySnapshot.items, view);
  if (!selected.length) return '<div class="empty-state" role="status"><strong>沒有符合條件的策略</strong><span>請清除搜尋或切換至「全部」。</span></div>';
  return `<p class="section-note" role="status">顯示 ${selected.length} / ${strategySnapshot.items.length} 筆快照；僅供觀察。</p><div class="cards-grid">${selected.map((strategy) => `
    <article class="detail-card">
      <div class="row-between"><strong>${strategy.symbol}</strong>${badge(strategy.statusLabel || strategy.status)}</div>
      <h3>${strategy.strategy} · ${strategy.direction}</h3>
      <div class="mini-grid">
        <span>R:R<strong>${valueOrDash(strategy.rr)}</strong></span>
        <span>信心<strong>${valueOrDash(strategy.confidence)}</strong></span>
        <span>Entry<strong>${valueOrDash(strategy.entry)}</strong></span>
        <span>Stop<strong>${valueOrDash(strategy.stop)}</strong></span>
        <span>TP1<strong>${valueOrDash(strategy.tp1)}</strong></span>
        <span>TP2<strong>${valueOrDash(strategy.tp2)}</strong></span>
      </div>
      <p>${strategy.note || '策略快照僅供觀察，不提供真實下單。'}</p>
    </article>`).join('')}</div>`;
}

function strategyOpportunity(strategySnapshot) {
  const strategy = strategySnapshot.items[0];
  if (!strategy) {
    return `<div class="empty-state"><strong>策略機會等待資料</strong><span>策略快照尚未取得；公開行情可獨立查看。</span></div>`;
  }

  return `<div class="strategy-card">
    <div class="coin-icon large">${strategy.symbol.startsWith('BTC') ? '₿' : '◇'}</div>
    <div class="strategy-main">
      <strong>${strategy.symbol}</strong><span>${strategy.strategy}</span><b>${strategy.direction}</b>${badge(strategy.statusLabel || strategy.status)}
      <p>${strategy.note || '等待策略條件進一步確認。'}</p>
    </div>
  </div>`;
}

export function homePage(state) {
  const market = state.market;
  const view = state.view || createViewState();
  const selectedRows = selectMarketRows(market.rows, view);
  const coins = selectedRows.map(([, symbol, price, change]) => {
    const hasChange = Number.isFinite(change);
    const changeText = hasChange ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—';
    const changeClass = !hasChange ? '' : change >= 0 ? 'up' : 'down';
    const favorite = view.favorites.includes(symbol);
    return `<div class="coin-row"><button type="button" class="favorite-toggle" data-action="favorite" data-value="${encodeURIComponent(symbol)}" aria-label="收藏 ${symbol}" aria-pressed="${favorite}">${favorite ? '★' : '☆'}</button><strong>${symbol}</strong><span>${price}</span><b class="${changeClass}">${changeText}</b></div>`;
  }).join('');

  const news = mock.news.map(([n, title, text, tag]) => `
    <article class="news-row">
      <div class="news-num">${n}</div>
      <div><h3>${title}</h3><p>${text}</p></div>
      ${badge(tag)}
    </article>`).join('');

  return `<div class="page-stack">
    ${section('市場脈動', `
      <div class="market-meta"><span>${market.source}</span>${badge(marketStatusLabel(market), market.status)}</div>
      <div class="market-summary">
        <div><span>市場方向</span><strong>${market.direction}</strong></div>
        <div><span>風險情緒</span><strong class="muted-strong">${market.sentiment}</strong></div>
      </div>
      ${filterButtons('market-filter', view.marketFilter, [['all', '全部'], ['favorites', '收藏'], ['gainers', '漲幅排序'], ['losers', '跌幅排序']], '行情分類')}
      <p class="section-note" role="status">顯示 ${selectedRows.length} / ${market.rows.length} 個幣種。成交額資料尚未提供。</p>
      <div class="table-head"><span>幣種</span><span>最新價格</span><span>24h</span></div>
      <div class="coin-list">${coins || `<div class="empty-state" role="status"><strong>${view.marketFilter === 'favorites' && !view.favorites.length ? '尚未收藏幣種' : '找不到符合條件的幣種'}</strong><span>可切換至「全部」、清除搜尋，或按星號加入收藏。</span></div>`}</div>
      ${view.preferenceNotice ? `<p class="section-note" role="status">${view.preferenceNotice}</p>` : ''}`, badge(market.status, market.status))}

    ${section('國際熱點', `
      ${filterButtons('event-tab', view.eventTab, [['news', '主題示意'], ['calendar', '經濟日曆']], '國際資訊分類')}
      ${view.eventTab === 'calendar'
        ? '<div class="empty-state"><strong>經濟日曆尚未接入</strong><span>目前沒有可驗證的事件時間、預期值或公布值。</span></div>'
        : `<p class="section-note">以下是版面示意文字，尚未接入即時新聞；不能用來判斷當前事件。</p><div class="news-list">${news}</div>`}`, badge('示意內容'))}

    ${section('策略機會', strategyOpportunity(state.strategy), '<a class="action-link" href="#/strategies">查看策略 ›</a>')}
  </div>`;
}

export function strategiesPage(state) {
  const view = state.view || createViewState();
  return `<div class="page-stack">${section('交易策略', `
    ${filterButtons('strategy-filter', view.strategyFilter, [['all', '全部'], ['watch', '觀察中'], ['pending', '等待進場'], ['invalid', '已失效']], '策略分類')}
    ${strategyCards(state.strategy, view)}`, badge(state.strategy.status))}</div>`;
}

export function ordersPage(state) {
  const paper = state.paper;
  const loaded = paper.status === STATUS.LIVE;
  const summary = loaded ? paper.summary : emptyPaperSnapshot().summary;
  const positionStatus = !loaded || summary.openPositions == null
    ? '持倉狀態尚未驗證'
    : summary.openPositions === 0
      ? '快照回報零持倉（尚未對帳）'
      : '快照回報有持倉（尚未對帳）';
  return `<div class="page-stack">${section('持倉訂單', `
    <div class="metric-grid">
      ${metric('Paper NAV', money(summary.nav))}
      ${metric('Cash', money(summary.cash))}
      ${metric('Open Positions', valueOrDash(summary.openPositions))}
      ${metric('Pending Orders', valueOrDash(summary.pendingOrders))}
      ${metric('Unrealized PnL', money(summary.unrealizedPnl))}
      ${metric('Portfolio Risk', pct(summary.portfolioRiskPct))}
    </div>
    <div class="empty-state" role="status"><strong>${positionStatus}</strong><span>${snapshotNotice(paper)}</span><span>PAPER_ONLY · REAL_ORDER_LOCK · No Backfill</span></div>`, badge('帳本尚未驗證'))}</div>`;
}

export function resultsPage(state) {
  const results = state.results;
  const loaded = results.status === STATUS.LIVE;
  const summary = loaded ? results.summary : emptyResultsSnapshot().summary;
  return `<div class="page-stack">${section('交易結果', `
    <div class="metric-grid">
      ${metric('Trades', valueOrDash(summary.trades))}
      ${metric('Win Rate', pct(summary.winRatePct))}
      ${metric('Expectancy', summary.expectancyR == null ? '—' : `${summary.expectancyR}R`)}
      ${metric('Profit Factor', valueOrDash(summary.profitFactor))}
      ${metric('Net PnL', money(summary.netPnl))}
      ${metric('Max Drawdown', pct(summary.maxDrawdownPct))}
    </div>
    <div class="empty-state" role="status"><strong>交易績效尚未完成帳本驗證</strong><span>${snapshotNotice(results)}</span></div>
    <div class="chart-placeholder"><span>NAV Curve</span><strong>${loaded && results.navCurve.length ? '已收到曲線資料，圖表尚未繪製' : '等待 Forward Paper 資料'}</strong></div>`, badge('FORWARD PAPER'))}</div>`;
}

export function backtestPage(state) {
  const backtest = state.backtest;
  return `<div class="page-stack">${section('策略測試', `
    <div class="form-grid">
      <label>幣種<select><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label>
      <label>時間區間<select><option>1Y</option><option>180D</option><option>90D</option></select></label>
      <label>策略<select><option>策略 A</option><option>策略 B</option></select></label>
      <label>Timeframe<select><option>1H</option><option>4H</option></select></label>
    </div>
    <button class="primary-btn" type="button" disabled aria-describedby="backtest-unavailable">開始測試（尚未開放）</button>
    <div class="empty-state" id="backtest-unavailable"><strong>${backtest.result ? 'Backtest Snapshot 已載入' : 'Backtest 尚未接入'}</strong><span>此頁尚未串接啟動回測功能；目前只能讀取既有快照。</span><span>Forward Paper 與 Historical Backtest 保持完全分離。</span></div>`, badge('HISTORICAL BACKTEST'))}</div>`;
}

export const pages = Object.freeze({
  home: homePage,
  strategies: strategiesPage,
  orders: ordersPage,
  results: resultsPage,
  backtest: backtestPage
});
