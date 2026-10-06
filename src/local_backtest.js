import { EXIT_COSTS } from './target_analysis.js';
import { STATUS } from './status.js';
import { BACKTEST_CAPITAL, BACKTEST_VERSION } from './backtest_amounts.js';

const FUTURES_BASE = 'https://fapi.binance.com/fapi/v1/klines';
const SPOT_PUBLIC_BASE = 'https://data-api.binance.vision/api/v3/klines';
function netTradeReturn(entry,exit,side){
 const fillEntry=entry*(1+side*EXIT_COSTS.slippage),fillExit=exit*(1-side*EXIT_COSTS.slippage);
 return Math.max(-1,(side*(fillExit-fillEntry)-EXIT_COSTS.fee*(fillEntry+fillExit))/fillEntry);
}

export const BACKTEST_RANGE_OPTIONS = Object.freeze({
  '15m': [['30D','30 天'],['90D','90 天'],['180D','180 天']],
  '1h': [['90D','90 天'],['180D','180 天'],['1Y','1 年']],
  '4h': [['180D','180 天'],['1Y','1 年'],['2Y','2 年']],
  '12h': [['1Y','1 年'],['2Y','2 年'],['3Y','3 年']],
  '1d': [['1Y','1 年'],['3Y','3 年'],['5Y','5 年'],['10Y','10 年']],
  '1w': [['3Y','3 年'],['5Y','5 年'],['10Y','10 年']],
  '1M': [['5Y','5 年'],['10Y','10 年']]
});

const RANGE_DAYS = Object.freeze({
  '30D': 30,
  '90D': 90,
  '180D': 180,
  '1Y': 365,
  '2Y': 730,
  '3Y': 1095,
  '5Y': 1825,
  '10Y': 3650
});

function ema(values, period){
  const out = Array(values.length).fill(null);
  if(values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for(let i=0;i<period;i++) seed += values[i];
  let prev = seed / period;
  out[period-1] = prev;
  for(let i=period;i<values.length;i++){
    prev = values[i] * k + prev * (1-k);
    out[i] = prev;
  }
  return out;
}
function maxBatches(interval, days){
  const candlesPerDay = {
    '15m': 96,
    '1h': 24,
    '4h': 6,
    '12h': 2,
    '1d': 1,
    '1w': 1 / 7,
    '1M': 1 / 30
  };
  const estimate = Math.ceil((days * (candlesPerDay[interval] || 24)) / 1000) + 2;
  return Math.min(40, Math.max(2, estimate));
}
export function normalizeTimeframe(value){
  const raw = String(value || '1h').trim();
  if(raw === '1M') return '1M';
  const lower = raw.toLowerCase();
  return ['15m','1h','4h','12h','1d','1w'].includes(lower) ? lower : '1h';
}
function resolveRange(interval, range){
  const allowed = BACKTEST_RANGE_OPTIONS[interval] || BACKTEST_RANGE_OPTIONS['1h'];
  const allowedKeys = allowed.map(([key])=>key);
  const requested = String(range || '').toUpperCase();
  if(!allowedKeys.includes(requested)){
    throw new Error(`${interval.toUpperCase()} 不支援 ${requested || '未指定'} 回測範圍；可選：${allowedKeys.join(' / ')}`);
  }
  return { range: requested, days: RANGE_DAYS[requested] };
}
function classifyValidation(samples, trades){
  if(samples < 60) return { level:'INSUFFICIENT_BARS', label:'K 線樣本不足', reliable:false };
  if(trades < 20) return { level:'INSUFFICIENT_TRADES', label:'交易樣本不足', reliable:false };
  if(trades < 50) return { level:'PRELIMINARY', label:'Preliminary', reliable:false };
  if(trades < 100) return { level:'INITIAL', label:'可初步分析', reliable:false };
  return { level:'REFERENCE', label:'較有統計參考性', reliable:true };
}
async function requestKlines(base, symbol, interval, cursor, end){
  const url = `${base}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&startTime=${cursor}&endTime=${end}&limit=1000`;
  return fetch(url,{cache:'no-store'});
}
async function fetchKlines(symbol, interval, days){
  const end = Date.now();
  const start = end - days * 86400000;
  let cursor = start;
  const rows = [];
  let guard = 0;
  const guardLimit = maxBatches(interval, days);
  let base = FUTURES_BASE;
  let source = 'Binance USD-M public klines';
  while(cursor < end && guard < guardLimit){
    guard++;
    let response = await requestKlines(base, symbol, interval, cursor, end);
    if(!response.ok && base === FUTURES_BASE && [403,451].includes(response.status)){
      base = SPOT_PUBLIC_BASE;
      source = 'Binance Spot public klines · fallback';
      rows.length=0;cursor=start;guard=1; // A fallback must restart the complete window, never mix markets.
      response = await requestKlines(base, symbol, interval, cursor, end);
    }
    if(!response.ok) throw new Error(`Kline HTTP ${response.status} · ${source}`);
    const batch = await response.json();
    if(!Array.isArray(batch) || !batch.length) break;
    for(const k of batch){
      if(!Array.isArray(k)||[0,1,2,3,4,6].some(i=>k[i]==null||k[i]===''||!Number.isFinite(+k[i]))||Math.min(+k[1],+k[2],+k[3],+k[4])<=0||+k[2]<Math.max(+k[1],+k[4])||+k[3]>Math.min(+k[1],+k[4]))throw new Error('歷史 OHLC 價格或時間異常，停止回測');
      const closeTime = Number(k[6]);
      if(!(closeTime < end)) continue;
      rows.push({
        time:Number(k[0]),
        closeTime,
        open:Number(k[1]),
        high:Number(k[2]),
        low:Number(k[3]),
        close:Number(k[4])
      });
    }
    const next = Number(batch[batch.length-1][0]) + 1;
    if(!Number.isFinite(next) || next <= cursor) break;
    cursor = next;
    if(batch.length < 1000) break;
  }
  const seen = new Set();
  return {
    rows: rows.filter(r => Number.isFinite(r.close) && !seen.has(r.time) && seen.add(r.time)),
    source
  };
}
function simulate(candles, strategy){
  if(candles.length < 60) throw new Error('歷史樣本不足');
  const closes = candles.map(c=>c.close);
  const fast = ema(closes, strategy === 'B' ? 10 : 20);
  const slow = ema(closes, strategy === 'B' ? 30 : 50);
  let side = 0;
  let entry = null;
  let equity = 1;
  let peak = 1;
  let maxDd = 0, closedPeak = 1, closedDd = 0;
  // OHLC extrema cannot reveal intrabar order: report a conservative adverse-path bound.
  const mark = candle => {
    if(!side || !entry)return;
    const best=equity*(1+netTradeReturn(entry,side===1?candle.high:candle.low,side));
    const worst=equity*(1+netTradeReturn(entry,side===1?candle.low:candle.high,side));
    peak=Math.max(peak,best);maxDd=Math.max(maxDd,(peak-worst)/peak);
  };
  const trades = [];
  const curve = [{time:candles[0].time,balance:BACKTEST_CAPITAL}];
  for(let i=1;i<candles.length;i++){
    const signalIndex = i - 1;
    if(fast[signalIndex] == null || slow[signalIndex] == null) continue;
    const nextSide = fast[signalIndex] > slow[signalIndex] ? 1 : fast[signalIndex] < slow[signalIndex] ? -1 : side;
    const fill = Number(candles[i].open);
    if(!Number.isFinite(fill) || !(fill > 0)) continue;
    if(side === 0 && nextSide !== 0){
      side = nextSide;
      entry = fill;
      mark(candles[i]);
      continue;
    }
    if(nextSide !== side){
      const exit = fill;
      const ret = netTradeReturn(entry,exit,side);
      const netPnl=BACKTEST_CAPITAL*equity*ret;
      equity *= 1 + ret;
      trades.push({entry,exit,side:side===1?'LONG':'SHORT',returnPct:ret*100,netPnl,time:candles[i].time});
      closedPeak=Math.max(closedPeak,equity);closedDd=Math.max(closedDd,(closedPeak-equity)/closedPeak);
      peak = Math.max(peak,equity);
      maxDd = Math.max(maxDd,(peak-equity)/peak);
      curve.push({time:candles[i].time,balance:BACKTEST_CAPITAL*equity});
      if (equity === 0) { side = 0; entry = null; break; }
      side = nextSide;
      entry = fill;
    }
    mark(candles[i]);
  }
  if(side !== 0 && entry){
    const exit = candles[candles.length-1].close;
    const ret = netTradeReturn(entry,exit,side);
    const netPnl=BACKTEST_CAPITAL*equity*ret;
    equity *= 1 + ret;
    trades.push({entry,exit,side:side===1?'LONG':'SHORT',returnPct:ret*100,netPnl,time:candles[candles.length-1].time});
    closedPeak=Math.max(closedPeak,equity);closedDd=Math.max(closedDd,(closedPeak-equity)/closedPeak);
    peak = Math.max(peak,equity);
    maxDd = Math.max(maxDd,(peak-equity)/peak);
    curve.push({time:candles[candles.length-1].time,balance:BACKTEST_CAPITAL*equity});
  }
  const positives = trades.filter(t=>t.returnPct>0).map(t=>t.netPnl);
  const negatives = trades.filter(t=>t.returnPct<0).map(t=>t.netPnl);
  const grossWin = positives.reduce((a,b)=>a+b,0);
  const grossLoss = Math.abs(negatives.reduce((a,b)=>a+b,0));
  const avgTradePct = trades.length ? trades.reduce((s,t)=>s+t.returnPct,0)/trades.length : null;
  return {
    trades: trades.length,
    winRatePct: trades.length ? positives.length/trades.length*100 : null,
    expectancyR: null,
    avgTradePct,
    profitFactor: grossLoss > 0 ? grossWin/grossLoss : null,
    netReturnPct: (equity-1)*100,
    netPnl: BACKTEST_CAPITAL*(equity-1),
    finalEquity: BACKTEST_CAPITAL*equity,
    capitalExhausted: equity === 0,
    maxDrawdownPct: maxDd*100,
    closedDrawdownPct:closedDd*100,
    drawdownMethod:'OHLC_CONSERVATIVE_BOUND',
    tradesList: trades,
    equityCurve: curve
  };
}
export async function runLiteBacktest({symbol='BTCUSDT',range='90D',strategy='A',timeframe='1h'} = {}){
  const interval = normalizeTimeframe(timeframe);
  const resolved = resolveRange(interval, range);
  const fetched = await fetchKlines(symbol,interval,resolved.days);
  const candles = fetched.rows;
  const result = simulate(candles,strategy);
  const validation = classifyValidation(candles.length, result.trades);
  return {
    status: STATUS.LIVE,
    updatedAt: new Date().toISOString(),
    local: true,
    input:{actualStart:candles[0]?.time,actualEnd:candles.at(-1)?.closeTime,symbol,range:resolved.range,strategy,timeframe:interval,samples:candles.length,dataSource:fetched.source,costModel:'單邊費率 0.05%＋滑價 0.02%；依成交名目計算，未含資金費率',executionModel:'Fully Closed Signal → Next Bar Open',initialCapital:BACKTEST_CAPITAL,currency:'USDT',calculationVersion:BACKTEST_VERSION},
    result:{
      trades:result.trades,
      winRatePct:result.winRatePct,
      expectancyR:result.expectancyR,
      avgTradePct:result.avgTradePct,
      profitFactor:result.profitFactor,
      netReturnPct:result.netReturnPct,
      netPnl:result.netPnl,
      finalEquity:result.finalEquity,
      capitalExhausted:result.capitalExhausted,
      maxDrawdownPct:result.maxDrawdownPct,
      closedDrawdownPct:result.closedDrawdownPct,
      drawdownMethod:result.drawdownMethod,
      validation
    },
    equityCurve:result.equityCurve,
    recentTrades:result.tradesList.slice(-10).reverse()
  };
}
