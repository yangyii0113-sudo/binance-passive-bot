import { frameOutlookEvidence } from './trend_outlook.js';
const FUTURES_BASE = 'https://fapi.binance.com/fapi/v1/klines';
const SPOT_PUBLIC_BASE = 'https://data-api.binance.vision/api/v3/klines';

const FRAMES = Object.freeze([
  ['15m','15分'],
  ['1h','1H'],
  ['4h','4H'],
  ['12h','12H'],
  ['1d','日線'],
  ['1w','週線'],
  ['1M','月線']
]);

function ema(values, period){
  if(values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = values.slice(0,period).reduce((sum,v)=>sum+v,0) / period;
  for(let i=period;i<values.length;i++) prev = values[i] * k + prev * (1-k);
  return prev;
}
async function fetchClosed(symbol, interval){
  const makeUrl = (base) => `${base}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=160`;
  let response = await fetch(makeUrl(FUTURES_BASE),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  let source = 'Binance USD-M public klines';
  if(!response.ok && [403,451].includes(response.status)){
    response = await fetch(makeUrl(SPOT_PUBLIC_BASE),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    source = 'Binance Spot public klines · fallback';
  }
  if(!response.ok) throw new Error(`${interval} Kline HTTP ${response.status}`);
  const payload = await response.json();
  if(!Array.isArray(payload)) throw new Error(`${interval} Kline payload invalid`);
  const now = Date.now();
  const number=v=>v===null||v===undefined||v===''?NaN:Number(v);
  return {
    checkedAt:now,
    candles: payload
      .filter(k => Number(k?.[6]) < now)
      .map(k => ({
        openTime:Number(k[0]),
        closeTime:Number(k[6]),
        open:number(k[1]),high:number(k[2]),low:number(k[3]),volume:number(k[5]),
        close:Number(k[4])
      }))
      .filter(k => Number.isFinite(k.close)),
    source
  };
}
function analyzeFrame(interval,label,candles){
  const closes = candles.map(c=>c.close);
  if(closes.length < 55){
    return { interval,label,status:'EMPTY',direction:'資料不足',samples:closes.length };
  }
  const last = closes[closes.length-1];
  const e20 = ema(closes,20);
  const e50 = ema(closes,50);
  const priorIndex = Math.max(0,closes.length-6);
  const prior = closes[priorIndex];
  const momentumPct = prior > 0 ? (last/prior-1)*100 : null;
  let direction = '中性';
  let score = 50;
  if(e20 > e50 && last > e20){
    direction = '偏多';
    score = 70 + Math.min(20,Math.max(0,Number(momentumPct)||0)*2);
  } else if(e20 < e50 && last < e20){
    direction = '偏空';
    score = 30 - Math.min(20,Math.max(0,-(Number(momentumPct)||0))*2);
  } else if(last > e20){
    direction = '中性偏多';
    score = 58;
  } else if(last < e20){
    direction = '中性偏空';
    score = 42;
  }
  return {
    interval,label,status:'LIVE',direction,
    score:Math.round(score),
    last,ema20:e20,ema50:e50,momentumPct,
    samples:closes.length,
    closedAt:candles[candles.length-1]?.closeTime || null
  };
}
export async function analyzeMultiTimeframe(symbol){
  const clean = String(symbol || '').toUpperCase().replace(/\s|\//g,'');
  if(!clean) throw new Error('缺少分析標的');
  const settled = await Promise.all(FRAMES.map(async ([interval,label])=>{
    try{
      const fetched = await fetchClosed(clean,interval);
      return { ...analyzeFrame(interval,label,fetched.candles), source:fetched.source,
        outlook:frameOutlookEvidence(fetched.candles,interval,fetched.checkedAt) };
    }catch(error){
      return {interval,label,status:'ERROR',direction:'錯誤',error:String(error?.message||error)};
    }
  }));
  const live = settled.filter(x=>x.status==='LIVE');
  const bullish = live.filter(x=>x.direction.includes('多')).length;
  const bearish = live.filter(x=>x.direction.includes('空')).length;
  let consensus = '中性';
  if(bullish >= 5 && bullish > bearish) consensus = '多週期偏多';
  else if(bearish >= 5 && bearish > bullish) consensus = '多週期偏空';
  else if(bullish >= 4 && bullish > bearish) consensus = '偏多';
  else if(bearish >= 4 && bearish > bullish) consensus = '偏空';
  return {
    symbol:clean,
    status:live.length ? 'LIVE' : 'ERROR',
    updatedAt:new Date().toISOString(),
    consensus,
    bullish,
    bearish,
    frames:settled,
    source: settled.some(frame => String(frame.source || '').includes('Spot'))
      ? 'Binance Spot public klines · fallback · Fully Closed Bar'
      : 'Binance USD-M public klines · Fully Closed Bar'
  };
}
export { FRAMES as TECHNICAL_TIMEFRAMES };
