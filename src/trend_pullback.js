import { analyzeCoin } from './coin_analysis.js';
import { refineTargets } from './target_analysis.js';
// TP01 is an isolated research scanner. No order or production execution calls.
const H = 3600000;
function closed(rows, step, count, now) {
  const data = rows.filter(r => Number(r[6]) < now);
  if(data.length < count) throw new Error('歷史資料不足');
  for(let i=0;i<data.length;i++) {
    const r=data[i];
    if([0,1,2,3,4,6].some(k=>r[k]===null||r[k]===''||!Number.isFinite(Number(r[k]))) ||
      Math.min(+r[1],+r[2],+r[3],+r[4])<=0 || +r[2]<Math.max(+r[1],+r[4]) ||
      +r[3]>Math.min(+r[1],+r[4]) || +r[0]%step!==0 || +r[6]!==+r[0]+step-1 ||
      (i && +r[0]-Number(data[i-1][0])!==step)) throw new Error('K 線缺漏或格式異常');
  }
  if(+data.at(-1)[0]!==Math.floor(now/step)*step-step) throw new Error('收盤資料已過期');
  return data.map(r=>({time:+r[0],open:+r[1],high:+r[2],low:+r[3],close:+r[4],end:+r[6]}));
}
function ema(values,n){let e=values.slice(0,n).reduce((a,b)=>a+b,0)/n;for(const v of values.slice(n))e+=(v-e)*2/(n+1);return e;}
function atr(bars){const tr=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));let v=tr.slice(0,14).reduce((a,b)=>a+b,0)/14;for(const t of tr.slice(14))v=(v*13+t)/14;return v;}
export function pullbackPlan({hourly=[],fourHourly=[],now=Date.now()}={}) {
  try {
    const h=closed(hourly,H,200,now), f=closed(fourHourly,4*H,500,now);
    const fc=f.map(b=>b.close), hc=h.map(b=>b.close), b=h.at(-1);
    const fast=ema(fc,50), slow=ema(fc,200), prev=ema(fc.slice(0,-3),50);
    const side=fc.at(-1)>fast&&fast>slow&&fast>prev?'LONG':fc.at(-1)<fast&&fast<slow&&fast<prev?'SHORT':null;
    const mid=ema(hc,20), volatility=atr(h), sign=side==='LONG'?1:-1;
    const pullback=side==='LONG'?b.low<=mid&&b.close>mid&&b.close>b.open:b.high>=mid&&b.close<mid&&b.close<b.open;
    if(!side||!pullback||Math.abs(b.close-mid)>volatility) return {status:'WAIT',diagnosticReason:!side?'trendWait':!pullback?'pullbackWait':'extendedWait',reason:'等待 4 小時趨勢與 1 小時回調收盤確認'};
    const entry=(sign===1?b.high:b.low)+sign*volatility*.1;
    const stop=(sign===1?Math.min(...h.slice(-5).map(x=>x.low)):Math.max(...h.slice(-5).map(x=>x.high)))-sign*volatility*.2;
    const risk=Math.abs(entry-stop);
    if(!Number.isFinite(risk)||risk<=0||entry<=0||stop<=0||entry+sign*2*risk<=0) return {status:'BLOCKED',diagnosticReason:'riskBlocked',reason:'風險距離無效'};
    return {status:'SETUP',side,entry,stop,atr:volatility,tp1:entry+sign*risk,tp2:entry+sign*2*risk,signalAt:b.end,expiresAt:b.end+1+H,reason:'研究條件成立；等待下一根 1 小時 K 線突破進場門檻，尚未確認成交'};
  } catch(e) {return {status:'BLOCKED',diagnosticReason:'dataBlocked',reason:e.message};}
}
// Rank only fresh, rising crypto perpetuals; never fill gaps with cached/mock rows.
export function strongPullbackCandidates(market, contracts, now=Date.now()) {
  const age=now-Date.parse(market?.updatedAt);
  if(market?.status!=='LIVE'||!Number.isFinite(age)||age<0||age>120000) throw new Error('市場資料尚未更新，請稍後重新分析');
  if(!Array.isArray(contracts?.symbols)) throw new Error('無法確認加密貨幣合約清單');
  const eligible=new Set(contracts.symbols.filter(x=>x.status==='TRADING'&&x.contractType==='PERPETUAL'&&x.quoteAsset==='USDT'&&x.underlyingType==='COIN').map(x=>x.symbol));
  const seen=new Set();
  return (market.universeRows||[]).flatMap(row=>{
    const symbol=String(row?.[1]||'').replace(/\s|\//g,'');
    const change=Number(row?.[3]),volume=Number(row?.[4]),strength=Number(row?.[5]);
    if(seen.has(symbol)||!eligible.has(symbol)||row?.[5]==null||![change,volume,strength].every(Number.isFinite)||change<=0||change>=30||volume<10000000||strength<0||strength>100)return [];
    seen.add(symbol);return [{symbol,change,volume,strength}];
  }).sort((a,b)=>b.strength-a.strength||b.volume-a.volume||a.symbol.localeCompare(b.symbol)).slice(0,10).map((x,i)=>({...x,rank:i+1}));
}
export async function scanPullbacks(candidates=[],{fetcher=fetch,onProgress=()=>{}}={}){
  if(!Array.isArray(candidates)||candidates.length>10||new Set(candidates.map(x=>x.symbol)).size!==candidates.length)throw new Error('分析清單無效');
  const results=new Array(candidates.length);let cursor=0,completed=0;
  async function worker(){
    while(cursor<candidates.length){
      const index=cursor++,candidate=candidates[index],symbol=candidate.symbol;
      try {
        if(!/^[\p{L}\p{N}]+USDT$/u.test(symbol))throw new Error('合約代碼無效');
        const rows=await Promise.all(['1h','4h'].map(async interval=>{
          const response=await fetcher(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=601`,{signal:AbortSignal.timeout(15000)});
          if(!response.ok)throw new Error(`合約資料讀取失敗（${response.status}）`);
          const data=await response.json();if(!Array.isArray(data))throw new Error('資料格式異常');return data;
        }));
        const now=Date.now();
        const plan=pullbackPlan({hourly:rows[0],fourHourly:rows[1],now});
        if(plan.status!=='SETUP')results[index]={...candidate,...plan};
        else {
          const enhanced=refineTargets(plan,rows[0].filter(r=>+r[6]<now),plan.atr);
          results[index]={...candidate,...enhanced,status:enhanced.targetAnalysis.accepted?'SETUP':'SKIP',reason:enhanced.targetAnalysis.reason};
        }
        const analysis=analyzeCoin({hourly:rows[0],fourHourly:rows[1],pullback:results[index],now});
        results[index].analysis=analysis;
        if(analysis.status==='BLOCKED')results[index]={...candidate,status:'BLOCKED',reason:analysis.reason,analysis};
      } catch {results[index]={...candidate,status:'BLOCKED',reason:'無法取得完整合約 K 線，請稍後重新分析'};}
      onProgress(++completed,candidates.length);
    }
  }
  await Promise.all(Array.from({length:Math.min(2,candidates.length)},worker));
  return results;
}
