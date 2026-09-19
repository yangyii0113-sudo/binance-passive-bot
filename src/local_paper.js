import { STATUS } from './status.js';

const KEY = 'foxyya.paper.local.v1';
const INITIAL_CASH = 100000;
const MAX_MARGIN_PCT = 1.5;

function now(){ return new Date().toISOString(); }
function num(value, fallback = 0){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function loadBook(){
  try{
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    if(parsed && Array.isArray(parsed.positions) && Array.isArray(parsed.trades)) return parsed;
  }catch(_){}
  return { cash: INITIAL_CASH, positions: [], trades: [], createdAt: now() };
}
function saveBook(book){
  localStorage.setItem(KEY, JSON.stringify(book));
}
export function marketPrice(rows, symbol){
  const display = symbol.replace('USDT',' / USDT');
  const row = (rows || []).find((item) => item?.[1] === display || String(item?.[1] || '').replace(/\s|\//g,'') === symbol);
  if(!row) return null;
  const n = Number(String(row[2]).replace(/,/g,''));
  return Number.isFinite(n) ? n : null;
}
function positionPnl(position, price){
  if(!Number.isFinite(price)) return 0;
  const direction = position.side === 'SHORT' ? -1 : 1;
  return (price - position.entry) * position.qty * direction;
}
function enrich(book, marketRows){
  return book.positions.map((position) => {
    const mark = marketPrice(marketRows, position.symbol) ?? position.entry;
    const unrealizedPnl = positionPnl(position, mark);
    return { ...position, mark, unrealizedPnl };
  });
}
export function localPaperSnapshot(marketRows = []){
  const book = loadBook();
  const positions = enrich(book, marketRows);
  const unrealizedPnl = positions.reduce((sum,p)=>sum+p.unrealizedPnl,0);
  const nav = book.cash + unrealizedPnl;
  const marginUsed = positions.reduce((sum,p)=>sum + num(p.margin),0);
  return {
    status: STATUS.LIVE,
    updatedAt: now(),
    local: true,
    summary: {
      nav,
      cash: book.cash,
      openPositions: positions.length,
      pendingOrders: 0,
      unrealizedPnl,
      marginUsagePct: nav > 0 ? (marginUsed / nav) * 100 : 0,
      portfolioRiskPct: nav > 0 ? (marginUsed / nav) * 100 : 0,
      riskProxy: 'MARGIN_USAGE'
    },
    positions,
    pending: []
  };
}
export function localResultsSnapshot(){
  const book = loadBook();
  const trades = book.trades.filter(t => t.closed === true);
  const pnls = trades.map(t => num(t.netPnl));
  const wins = pnls.filter(v=>v>0);
  const losses = pnls.filter(v=>v<0);
  const grossWin = wins.reduce((a,b)=>a+b,0);
  const grossLoss = Math.abs(losses.reduce((a,b)=>a+b,0));
  const rValues = trades.map(t=>num(t.realizedR,0));
  let equity = INITIAL_CASH;
  let peak = equity;
  let maxDd = 0;
  const navCurve = [{time: book.createdAt || now(), nav: equity}];
  for(const trade of trades){
    equity += num(trade.netPnl);
    peak = Math.max(peak,equity);
    if(peak > 0) maxDd = Math.max(maxDd,(peak-equity)/peak*100);
    navCurve.push({time:trade.closedAt,nav:equity});
  }
  return {
    status: STATUS.LIVE,
    updatedAt: now(),
    local: true,
    summary: {
      trades: trades.length,
      winRatePct: trades.length ? wins.length / trades.length * 100 : null,
      expectancyR: null,
      profitFactor: grossLoss > 0 ? grossWin/grossLoss : null,
      netPnl: pnls.reduce((a,b)=>a+b,0),
      maxDrawdownPct: trades.length ? maxDd : null
    },
    navCurve,
    recentTrades: trades.slice(-20).reverse()
  };
}
export function openLocalPaperPosition({symbol, side, leverage, margin, marketRows}){
  const price = marketPrice(marketRows, symbol);
  if(!price) throw new Error('目前沒有可用市場價格');
  const book = loadBook();
  const snapshot = localPaperSnapshot(marketRows);
  const lev = [5,8,10].includes(Number(leverage)) ? Number(leverage) : 5;
  const m = num(margin);
  if(!(m > 0)) throw new Error('請輸入模擬保證金');
  const maxMargin = Math.max(1, snapshot.summary.nav * MAX_MARGIN_PCT / 100);
  const used = book.positions.reduce((sum,p)=>sum+num(p.margin),0);
  if(used + m > maxMargin + 1e-9){
    throw new Error(`Lite Risk Guard：總模擬保證金不可超過 NAV 的 ${MAX_MARGIN_PCT}%（目前上限約 $${maxMargin.toFixed(2)}）`);
  }
  const notional = m * lev;
  const position = {
    id: crypto?.randomUUID ? crypto.randomUUID() : `p-${Date.now()}`,
    symbol,
    side: side === 'SHORT' ? 'SHORT' : 'LONG',
    leverage: lev,
    margin: m,
    notional,
    qty: notional / price,
    entry: price,
    openedAt: now()
  };
  book.positions.push(position);
  saveBook(book);
  return position;
}
export function closeLocalPaperPosition(id, marketRows = []){
  const book = loadBook();
  const index = book.positions.findIndex(p=>p.id === id);
  if(index < 0) throw new Error('找不到模擬持倉');
  const position = book.positions[index];
  const exit = marketPrice(marketRows, position.symbol) ?? position.entry;
  const grossPnl = positionPnl(position, exit);
  const fee = position.notional * 0.0008;
  const netPnl = grossPnl - fee;
  book.cash += netPnl;
  const trade = {
    ...position,
    closed: true,
    exit,
    grossPnl,
    fee,
    netPnl,
    realizedR: null,
    returnOnMarginPct: position.margin > 0 ? (netPnl / position.margin) * 100 : null,
    closedAt: now()
  };
  book.positions.splice(index,1);
  book.trades.push(trade);
  saveBook(book);
  return trade;
}
export function resetLocalPaper(){
  localStorage.removeItem(KEY);
}
