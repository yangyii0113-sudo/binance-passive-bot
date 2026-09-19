import { STATUS } from './status.js';

const BASE = 'https://fapi.binance.com/fapi/v1/klines';
const COST_PER_TRADE = 0.0008;

export const BACKTEST_RANGE_OPTIONS = Object.freeze({
  '15m': [['30D','30 天'],['90D','90 天'],['180D','180 天']],
  '1h': [['90D','90 天'],['180D','180 天'],['1Y','1 年']],
  '4h': [['180D','180 天'],['1Y','1 年'],['2Y','2 年']],
  '12h': [['1Y','1 年'],['2Y','2 年'],['3Y','3 年']],
  '1d': [['1Y','1 年'],['3Y','3 年'],['5Y','5 年'],['MAX','MAX']],
  '1w': [['3Y','3 年'],['5Y','5 年'],['10Y','10 年'],['MAX','MAX']],
  '1M': [['5Y','5 年'],['10Y','10 年'],['MAX','MAX']]
});

const RANGE_DAYS = Object.freeze({
  '30D': 30,
  '90D': 90,
  '180D': 180,
  '1Y': 365,
  '2Y': 730,
  '3Y': 1095,
  '5Y': 1825,
  '10Y': 3650,
  'MAX': 3650
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
async function fetchKlines(symbol, interval, days){
  const end = Date.now();
  const start = end - days * 86400000;
  let cursor = start;
  const rows = [];
  let guard = 0;
  const guardLimit = maxBatches(interval, days);
  while(cursor < end && guard < guardLimit){
    guard++;
    const url = `${BASE}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&startTime=${cursor}&endTime=${end}&limit=1000`;
    const response = await fetch(url,{cache:'no-store'});
    if(!response.ok) throw new Error(`Kline HTTP ${response.status}`);
    const batch = await response.json();
    if(!Array.isArray(batch) || !batch.length) break;
    for(const k of batch){
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
  return rows.filter(r => Number.isFinite(r.close) && !seen.has(r.time) && seen.add(r.time));
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
  let maxDd = 0;
  const trades = [];
  const curve = [{time:candles[0].time,balance:1000}];
  for(let i=1;i<candles.length;i++){
    if(fast[i] == null || slow[i] == null || fast[i-1] == null || slow[i-1] == null) continue;
    const nextSide = fast[i] > slow[i] ? 1 : fast[i] < slow[i] ? -1 : side;
    if(side === 0 && nextSide !== 0){
      side = nextSide;
      entry = candles[i].close;
      continue;
    }
    if(nextSide !== side){
      const exit = candles[i].close;
      const raw = side === 1 ? exit / entry - 1 : entry / exit - 1;
      const ret = raw - COST_PER_TRADE;
      equity *= Math.max(0.01,1 + ret);
      trades.push({entry,exit,side:side===1?'LONG':'SHORT',returnPct:ret*100,time:candles[i].time});
      peak = Math.max(peak,equity);
      maxDd = Math.max(maxDd,(peak-equity)/peak);
      curve.push({time:candles[i].time,balance:1000*equity});
      side = nextSide;
      entry = exit;
    }
  }
  if(side !== 0 && entry){
    const exit = candles[candles.length-1].close;
    const raw = side === 1 ? exit / entry - 1 : entry / exit - 1;
    const ret = raw - COST_PER_TRADE;
    equity *= Math.max(0.01,1 + ret);
    trades.push({entry,exit,side:side===1?'LONG':'SHORT',returnPct:ret*100,time:candles[candles.length-1].time});
    peak = Math.max(peak,equity);
    maxDd = Math.max(maxDd,(peak-equity)/peak);
    curve.push({time:candles[candles.length-1].time,balance:1000*equity});
  }
  const positives = trades.filter(t=>t.returnPct>0).map(t=>t.returnPct);
  const negatives = trades.filter(t=>t.returnPct<0).map(t=>t.returnPct);
  const grossWin = positives.reduce((a,b)=>a+b,0);
  const grossLoss = Math.abs(negatives.reduce((a,b)=>a+b,0));
  return {
    trades: trades.length,
    winRatePct: trades.length ? positives.length/trades.length*100 : null,
    expectancyR: trades.length ? trades.reduce((s,t)=>s+t.returnPct,0)/trades.length/1.5 : null,
    profitFactor: grossLoss > 0 ? grossWin/grossLoss : null,
    netReturnPct: (equity-1)*100,
    maxDrawdownPct: maxDd*100,
    tradesList: trades,
    equityCurve: curve
  };
}
export async function runLiteBacktest({symbol='BTCUSDT',range='90D',strategy='A',timeframe='1h'} = {}){
  const interval = normalizeTimeframe(timeframe);
  const resolved = resolveRange(interval, range);
  const candles = await fetchKlines(symbol,interval,resolved.days);
  const result = simulate(candles,strategy);
  const validation = classifyValidation(candles.length, result.trades);
  return {
    status: STATUS.LIVE,
    updatedAt: new Date().toISOString(),
    local: true,
    input:{symbol,range:resolved.range,strategy,timeframe:interval,samples:candles.length,costModel:'單次來回成本 0.08%'},
    result:{
      trades:result.trades,
      winRatePct:result.winRatePct,
      expectancyR:result.expectancyR,
      profitFactor:result.profitFactor,
      netReturnPct:result.netReturnPct,
      maxDrawdownPct:result.maxDrawdownPct,
      validation
    },
    equityCurve:result.equityCurve,
    recentTrades:result.tradesList.slice(-10).reverse()
  };
}
