const STATUS = Object.freeze({ LIVE:'LIVE', STALE:'STALE', ERROR:'ERROR', LOADING:'LOADING', EMPTY:'EMPTY' });

const MARKET_SYMBOLS = [
  { symbol:'BTCUSDT', icon:'₿', display:'BTC / USDT' },
  { symbol:'ETHUSDT', icon:'◆', display:'ETH / USDT' },
  { symbol:'SOLUSDT', icon:'S', display:'SOL / USDT' }
];
const MARKET_CACHE_KEY = 'foxyya.market.v1';
const MARKET_REFRESH_MS = 30000;

const mock = {
  news: [
    ['01','通膨與利率走向','關注主要經濟體通膨數據與利率政策動向，影響市場風險偏好。','BTC / 美元'],
    ['02','地緣局勢與能源風險','地緣政治緊張情勢持續，能源供應與價格波動備受關注。','黃金 / 原油'],
    ['03','全球經濟與資金流向','全球經濟成長前景與資金流向變化，影響多類資產表現。','ETH / 美股']
  ],
  strategies: [
    {symbol:'BTC / USDT', strategy:'策略 A', direction:'偏多觀察', status:'等待確認', rr:'1.8R', confidence:'中'},
    {symbol:'ETH / USDT', strategy:'策略 B', direction:'中性觀察', status:'觀察中', rr:'1.4R', confidence:'中'}
  ]
};

const marketState = {
  status: STATUS.LOADING,
  source: 'BINANCE USD-M',
  updatedAt: null,
  direction: '讀取中',
  sentiment: '讀取中',
  rows: MARKET_SYMBOLS.map(({icon,display}) => [icon, display, '—', null])
};

const badge = (text, tone='') => `<span class="status-badge ${tone ? `status-${tone.toLowerCase()}` : ''}">${text}</span>`;
const section = (title, content, action='') => `<section class="panel"><div class="section-head"><div class="section-title"><span class="accent-bar"></span>${title}</div>${action}</div>${content}</section>`;
const metric = (label, value) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;

function formatPrice(value){
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = n >= 1000 ? 2 : n >= 1 ? 3 : 5;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function deriveMarketSummary(rows){
  const changes = rows.map(row => row[3]).filter(Number.isFinite);
  if (!changes.length) return { direction:'無資料', sentiment:'無資料' };
  const avg = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  return {
    direction: avg > 1.5 ? '偏多' : avg < -1.5 ? '偏空' : '震盪',
    sentiment: avg > 1 ? '積極' : avg < -1 ? '謹慎' : '中性'
  };
}

function readMarketCache(){
  try {
    const parsed = JSON.parse(localStorage.getItem(MARKET_CACHE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.rows) || !parsed.updatedAt) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeMarketCache(snapshot){
  try { localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(snapshot)); } catch (_) {}
}

function marketStatusLabel(){
  const time = marketState.updatedAt
    ? new Date(marketState.updatedAt).toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' })
    : '尚未更新';
  return `${marketState.status} · ${time}`;
}

async function fetchTicker(symbol){
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, {
      method:'GET',
      cache:'no-store',
      signal:controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const lastPrice = Number(data.lastPrice);
    const priceChangePercent = Number(data.priceChangePercent);
    if (!Number.isFinite(lastPrice) || !Number.isFinite(priceChangePercent)) throw new Error('Invalid ticker payload');
    return { symbol, lastPrice, priceChangePercent };
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshMarket(){
  try {
    const tickers = await Promise.all(MARKET_SYMBOLS.map(item => fetchTicker(item.symbol)));
    const rows = MARKET_SYMBOLS.map(item => {
      const ticker = tickers.find(t => t.symbol === item.symbol);
      return [item.icon, item.display, formatPrice(ticker.lastPrice), ticker.priceChangePercent];
    });
    const summary = deriveMarketSummary(rows);
    Object.assign(marketState, {
      status: STATUS.LIVE,
      updatedAt: new Date().toISOString(),
      rows,
      direction: summary.direction,
      sentiment: summary.sentiment
    });
    writeMarketCache({ updatedAt:marketState.updatedAt, rows, direction:marketState.direction, sentiment:marketState.sentiment });
  } catch (error) {
    const cached = readMarketCache();
    if (cached) {
      Object.assign(marketState, {
        status: STATUS.STALE,
        updatedAt: cached.updatedAt,
        rows: cached.rows,
        direction: cached.direction || deriveMarketSummary(cached.rows).direction,
        sentiment: cached.sentiment || deriveMarketSummary(cached.rows).sentiment
      });
    } else {
      Object.assign(marketState, {
        status: STATUS.ERROR,
        updatedAt: null,
        direction: '無資料',
        sentiment: '無資料',
        rows: MARKET_SYMBOLS.map(({icon,display}) => [icon, display, '—', null])
      });
    }
    console.warn('[FOXYYA] market refresh failed', error);
  }
  render();
}

function home(){
  const coins = marketState.rows.map(([icon,symbol,price,change]) => {
    const hasChange = Number.isFinite(change);
    const changeText = hasChange ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—';
    const changeClass = !hasChange ? '' : change >= 0 ? 'up' : 'down';
    return `<div class="coin-row"><span class="coin-icon">${icon}</span><strong>${symbol}</strong><span>${price}</span><b class="${changeClass}">${changeText}</b></div>`;
  }).join('');
  const news = mock.news.map(([n,title,text,tag]) => `<article class="news-row"><div class="news-num">${n}</div><div><h3>${title}</h3><p>${text}</p></div>${badge(tag)}</article>`).join('');
  const s = mock.strategies[0];
  return `<div class="page-stack">
    ${section('市場脈動', `<div class="market-meta"><span>${marketState.source}</span>${badge(marketStatusLabel(), marketState.status)}</div><div class="market-summary"><div><span>市場方向</span><strong>${marketState.direction}</strong></div><div><span>風險情緒</span><strong class="muted-strong">${marketState.sentiment}</strong></div></div><div class="tabs"><span>收藏</span><span class="active">熱門</span><span>漲幅</span><span>跌幅</span><span>成交額</span></div><div class="table-head"><span>幣種</span><span>最新價格</span><span>24h</span></div><div class="coin-list">${coins}</div>`, badge(marketState.status, marketState.status))}
    ${section('國際熱點', `<div class="tabs compact"><span class="active">新聞</span><span>經濟日曆</span></div><div class="news-list">${news}</div><div class="calendar-row"><span>▣</span><div><strong>重要事件日曆</strong><small>關注關鍵經濟數據與國際事件，掌握市場變化。</small></div><span>前值 —　預期 —　公布值 —　›</span></div>`)}
    ${section('策略機會', `<div class="strategy-card"><div class="coin-icon large">₿</div><div class="strategy-main"><strong>${s.symbol}</strong><span>${s.strategy}</span><b>${s.direction}</b>${badge(s.status)}<p>綜合技術面與市場情緒，關注關鍵位置，等待進一步確認。</p></div></div>`, '<span class="action-link">查看條件與圖表 ›</span>')}
  </div>`;
}

function strategies(){
  const cards = mock.strategies.map(s => `<article class="detail-card"><div class="row-between"><strong>${s.symbol}</strong>${badge(s.status)}</div><h3>${s.strategy} · ${s.direction}</h3><div class="mini-grid"><span>R:R<strong>${s.rr}</strong></span><span>信心<strong>${s.confidence}</strong></span><span>Entry<strong>—</strong></span><span>Stop<strong>—</strong></span></div><p>第一版僅呈現策略快照，不提供真實下單。</p></article>`).join('');
  return `<div class="page-stack">${section('交易策略', `<div class="tabs"><span class="active">觀察中</span><span>等待進場</span><span>已失效</span></div><div class="cards-grid">${cards}</div>`, badge('MOCK'))}</div>`;
}

function orders(){
  return `<div class="page-stack">${section('持倉訂單', `<div class="metric-grid">${metric('Paper NAV','$100,000')}${metric('Cash','$100,000')}${metric('Open Positions','0')}${metric('Pending Orders','0')}${metric('Unrealized PnL','$0')}${metric('Portfolio Risk','0.00%')}</div><div class="empty-state"><strong>目前沒有模擬持倉</strong><span>Paper snapshot 尚未接入，平台仍可正常使用。</span></div>`, `${badge('PAPER ONLY')} ${badge('REAL ORDER LOCKED')}`)}</div>`;
}

function results(){
  return `<div class="page-stack">${section('交易結果', `<div class="metric-grid">${metric('Trades','0')}${metric('Win Rate','—')}${metric('Expectancy','—')}${metric('Profit Factor','—')}${metric('Net PnL','$0')}${metric('Max Drawdown','0.00%')}</div><div class="chart-placeholder"><span>NAV Curve</span><strong>等待 Forward Paper 資料</strong></div>`, badge('FORWARD PAPER'))}</div>`;
}

function backtest(){
  return `<div class="page-stack">${section('策略測試', `<div class="form-grid"><label>幣種<select><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option></select></label><label>時間區間<select><option>1Y</option><option>180D</option><option>90D</option></select></label><label>策略<select><option>策略 A</option><option>策略 B</option></select></label><label>Timeframe<select><option>1H</option><option>4H</option></select></label></div><button class="primary-btn" type="button">開始測試</button><div class="empty-state"><strong>Backtest 尚未接入</strong><span>Forward Paper 與 Historical Backtest 將保持完全分離。</span></div>`, badge('HISTORICAL BACKTEST'))}</div>`;
}

const routes = { home, strategies, orders, results, backtest };
function currentRoute(){
  const path = location.hash.replace(/^#\/?/, '');
  return path || 'home';
}
function render(){
  const route = currentRoute();
  const view = routes[route] || routes.home;
  document.getElementById('app').innerHTML = view();
  document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (routes[route] ? route : 'home')));
}
function init(){
  const cached = readMarketCache();
  if (cached) {
    Object.assign(marketState, {
      status: STATUS.STALE,
      updatedAt: cached.updatedAt,
      rows: cached.rows,
      direction: cached.direction || deriveMarketSummary(cached.rows).direction,
      sentiment: cached.sentiment || deriveMarketSummary(cached.rows).sentiment
    });
  }
  render();
  refreshMarket();
  setInterval(refreshMarket, MARKET_REFRESH_MS);
}
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', init);
