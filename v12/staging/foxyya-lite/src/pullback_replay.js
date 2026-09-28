import { familyPlan, FAMILY_VERSION } from './strategy_families.js';
import { pullbackPlan } from './trend_pullback.js';
import { refineTargets, EXIT_COSTS } from './target_analysis.js';
const H=3600000;
export function replayTrade(plan, bars, {fee=EXIT_COSTS.fee,slippage=EXIT_COSTS.slippage,protect=false}={}) {
  const sign=plan.side==='LONG'?1:-1, first=bars[0];
  if(!first)return {filled:false,bars:0,reason:'missingFuture'};
  const hit=(b,p,favourable)=>favourable?(sign===1?+b[2]>=p:+b[3]<=p):(sign===1?+b[3]<=p:+b[2]>=p);
  // Cancel opening gaps. If entry and stop both occur intrabar, assume entry then loss.
  if(sign*(+first[1]-plan.entry)>0||sign*(+first[1]-plan.stop)<=0||!hit(first,plan.entry,true))return {filled:false,bars:1,reason:sign*(+first[1]-plan.entry)>0?'entryGap':sign*(+first[1]-plan.stop)<=0?'stopGap':'noBreakout'};
  const entry=plan.entry*(1+sign*slippage);
  let stop=plan.stop,remaining=1,pnl=-entry*fee,partial=false;
  function exit(price,quantity){const fill=price*(1-sign*slippage);pnl+=quantity*(sign*(fill-entry)-fill*fee);remaining-=quantity;}
  const protectStop=sign===1?entry*(1+fee)/((1-slippage)*(1-fee)):entry*(1-fee)/((1+slippage)*(1+fee));
  for(let i=0;i<Math.min(bars.length,48);i++){
    const b=bars[i];
    if(hit(b,stop,false)) {exit(sign===1?Math.min(+b[1],stop):Math.max(+b[1],stop),remaining);return {filled:true,returnPerUnit:pnl,entry,bars:i+1,reason:'STOP'};}
    if(!partial&&hit(b,plan.tp1,true)){exit(plan.tp1,.5);partial=true;}
    if(hit(b,plan.tp2,true)){exit(plan.tp2,remaining);return {filled:true,returnPerUnit:pnl,entry,bars:i+1,reason:'TP2'};}
    // Never move the stop retroactively within the TP1 bar.
    if(protect&&partial) stop=sign===1?Math.max(stop,protectStop):Math.min(stop,protectStop);
  }
  const used=Math.min(bars.length,48);exit(+bars[used-1][4],remaining);
  return {filled:true,returnPerUnit:pnl,entry,bars:used,reason:used===48?'TIME':'END'};
}
export function comparePlans({hourly,fourHourly,start,end}) {
  const split=start+Math.floor((end-start)*.7/H)*H;
  function run(from,to,enhanced,multiplier=1,family=null){
    let balance=1000,peak=1000,dd=0,wins=0,grossWin=0,grossLoss=0,count=0,signals=0,skipped=0;
    const skipReasons={};
    const diagnostics={evaluated:0,dataBlocked:0,trendWait:0,pullbackWait:0,extendedWait:0,riskBlocked:0,noEntry:0,entryGap:0,stopGap:0,noBreakout:0,missingFuture:0};
    const ledger=[];const costs={fee:EXIT_COSTS.fee*multiplier,slippage:EXIT_COSTS.slippage*multiplier};
    for(let i=200;i<hourly.length;i++){
      const time=+hourly[i][0];if(time<from||time>=to)continue;
      const history=hourly.slice(Math.max(0,i-600),i);
      const higher=fourHourly.filter(r=>+r[6]<time).slice(-600);
      let plan=family?familyPlan(history,family,time):pullbackPlan({hourly:history,fourHourly:higher,now:time});
      diagnostics.evaluated++;
      if(plan.status==='SKIP'){signals++;skipped++;skipReasons[plan.reason]=(skipReasons[plan.reason]||0)+1;continue;}
      if(plan.status!=='SETUP'){diagnostics[plan.diagnosticReason||'dataBlocked']++;continue;}signals++;
      if(enhanced){plan=refineTargets(plan,history,plan.atr,costs);if(!plan.targetAnalysis.accepted){skipped++;skipReasons[plan.targetAnalysis.reason]=(skipReasons[plan.targetAnalysis.reason]||0)+1;continue;}}
      const future=hourly.slice(i,i+48).filter(r=>+r[0]<to);
      const result=replayTrade(plan,future,{...costs,protect:enhanced});if(!result.filled){diagnostics.noEntry++;diagnostics[result.reason]++;continue;}
      const riskPerUnit=Math.abs(result.entry-plan.stop)+costs.slippage*plan.stop+costs.fee*(result.entry+plan.stop);
      const qty=Math.min(balance*.0025/riskPerUnit,balance/result.entry);
      const pnl=qty*result.returnPerUnit;balance+=pnl;count++;if(pnl>0){wins++;grossWin+=pnl;}else grossLoss-=pnl;
      peak=Math.max(peak,balance);dd=Math.max(dd,(peak-balance)/peak*100);
      ledger.push({entryTime:time,exitTime:+future[result.bars-1][6],side:plan.side,entry:result.entry,qty,pnl,balance,reason:result.reason});
      i+=result.bars-1;
    }
    return {trades:count,signals,skipped,skipReasons,diagnostics,netPnl:balance-1000,netReturnPct:(balance/1000-1)*100,winRate:count?wins/count*100:null,profitFactor:grossLoss?grossWin/grossLoss:null,avgPnl:count?(balance-1000)/count:null,closedDrawdownPct:dd,ledger};
  }
  const development={baseline:run(start,split,false),enhanced:run(start,split,true)};
  const holdout={baseline:run(split,end,false),enhanced:run(split,end,true),stress:run(split,end,true,2)};
  const families={version:FAMILY_VERSION,rows:[
    {key:'pullback',development:development.baseline,holdout:holdout.baseline,stress:run(split,end,false,2)},
    {key:'structured',development:development.enhanced,holdout:holdout.enhanced,stress:holdout.stress},
    ...['breakout','meanReversion'].map(key=>({key,development:run(start,split,false,1,key),holdout:run(split,end,false,1,key),stress:run(split,end,false,2,key)}))
  ]};
  return {start,end,split,version:'TP01-S1',fundingIncluded:false,development,holdout,families};
}
async function history(symbol,interval,start,end,fetcher){
  const rows=[];let cursor=start;
  for(let batch=0;cursor<end&&batch<20;batch++){
    const r=await fetcher(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&startTime=${cursor}&endTime=${end-1}&limit=1000`,{signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw new Error(`合約歷史資料讀取失敗（${r.status}）`);
    const data=await r.json();if(!Array.isArray(data)||!data.length)throw new Error('歷史資料不完整');
    const next=Number(data.at(-1)[6])+1;if(next<=cursor)throw new Error('歷史資料時間異常');rows.push(...data);cursor=next;
  }
  const step=interval==='1h'?H:4*H;
  if(rows.length!==(end-start)/step)throw new Error('歷史 K 線數量不完整');
  for(let i=0;i<rows.length;i++){
    const r=rows[i];if(+r[0]!==start+i*step||+r[6]!==start+(i+1)*step-1||[1,2,3,4].some(k=>r[k]===null||r[k]===''||!Number.isFinite(+r[k])||+r[k]<=0)||+r[2]<Math.max(+r[1],+r[4])||+r[3]>Math.min(+r[1],+r[4]))throw new Error('歷史 K 線缺漏或價格異常');
  }
  return rows;
}
export async function runPullbackComparison(symbol,{fetcher=fetch,end=Math.floor(Date.now()/(4*H))*4*H}={}){
  if(typeof symbol!=='string'||! /^[\p{L}\p{N}]+USDT$/u.test(symbol))throw new Error('請選擇有效的加密貨幣合約');
  const response=await fetcher('https://fapi.binance.com/fapi/v1/exchangeInfo',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('無法確認合約狀態，已停止比較');
  const contracts=await response.json();
  if(!contracts?.symbols?.some(x=>x.symbol===symbol&&x.status==='TRADING'&&x.contractType==='PERPETUAL'&&x.quoteAsset==='USDT'&&x.underlyingType==='COIN'))throw new Error('此標的不是可交易的加密貨幣永續合約');
  if(!Number.isSafeInteger(end)||end%(4*H)!==0||end>Math.floor(Date.now()/(4*H))*4*H)throw new Error('比較期間無效');
  const start=end-90*24*H;
  const [hourly,fourHourly]=await Promise.all([history(symbol,'1h',start-600*H,end,fetcher),history(symbol,'4h',start-600*4*H,end,fetcher)]);
  return {symbol,...comparePlans({hourly,fourHourly,start,end})};
}
