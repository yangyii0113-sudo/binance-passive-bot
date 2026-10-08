import {TECH_WINDOW,TECH_VARIANTS,TECH_VERSION,technicalFilter} from './technical_confirmation.js';
import { HORIZONS,HORIZON_VERSION,FRAME_MS,horizonSignals,horizonDeadline,frameOpen,validHorizonBars } from './horizon_strategies.js';
import { replayTrade } from './pullback_replay.js';
import { EXIT_COSTS } from './target_analysis.js';
const DAY=86400000;
export const HORIZON_DAYS=Object.freeze({day:90,week:365,month:1095});
export function compareHorizons({frames,horizon,start,end,source,symbol}){
 const c=HORIZONS[horizon],step=FRAME_MS[c?.trigger];
 if(!c||source!=='Binance USD-M public klines'||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||frameOpen(start,c.trigger)!==start||frameOpen(end,c.trigger)!==end)throw new Error('週期、來源或研究區間異常');
 const data={};for(const f of [c.trigger,c.context,c.regime]){
  data[f]=(frames[f]||[]).filter(r=>+r[6]<end);
  if(!validHorizonBars(data[f],f,end,{latest:false})||+data[f][0][0]>frameOpen(start,f)-60*FRAME_MS[f]||+data[f].at(-1)[0]<frameOpen(end,f)-FRAME_MS[f])throw new Error(`${f} 缺少完整研究區間或暖機資料`);
 }
 const trigger=data[c.trigger],split=start+Math.floor((end-start)*.7/step)*step;
 if(split<=start||split>=end)throw new Error('分段資料不足');
 const signalCache=new Map();
 function run(key,from,to,multiplier=1,variant=null){
  let balance=1000,peak=1000,dd=0,signals=0,incomplete=0,waiting=0,blocked=0,noEntry=0,confirmationMissing=0,confirmationRejected=0;
  const ledger=[],costs={fee:EXIT_COSTS.fee*multiplier,slippage:EXIT_COSTS.slippage*multiplier};
  for(let i=60;i<trigger.length;i++){
   const at=+trigger[i][0];if(at<from||at>=to)continue;
   if(!signalCache.has(at)){const history=Object.fromEntries(Object.entries(data).map(([f,rows])=>[f,rows.filter(r=>+r[6]<at).slice(-TECH_WINDOW)]));signalCache.set(at,horizonSignals({horizon,frames:history,now:at}));}
   const result=signalCache.get(at);
   if(result.status!=='VALID'){blocked++;continue;}
   const plan=result.strategies.find(p=>p.key===key);if(plan?.status!=='SETUP'){waiting++;continue;}
   if(variant){const confirmation=technicalFilter(result.evidence?.technical,variant,plan.side);if(!confirmation.ready){confirmationMissing++;continue;}if(!confirmation.pass){confirmationRejected++;continue;}}signals++;
   const maxBars=Math.ceil((horizonDeadline(horizon,at)-at)/step),future=trigger.slice(i,i+maxBars).filter(r=>+r[6]<to);
   const trade=replayTrade(plan,future,{...costs,protect:key==='structured',maxBars});
   if(!trade.filled){noEntry++;continue;}
   // Censor open samples at the segment boundary; do not fabricate forced liquidation or carry them into holdout.
   if(trade.reason==='END'){incomplete++;break;}
   const sign=plan.side==='LONG'?1:-1,stopFill=plan.stop*(1-sign*costs.slippage);
   const unitRisk=sign*(trade.entry-stopFill)+costs.fee*(trade.entry+stopFill);
   const qty=Math.min(balance*.0025/unitRisk,balance/trade.entry),pnl=qty*trade.returnPerUnit;
   balance+=pnl;peak=Math.max(peak,balance);dd=Math.max(dd,(peak-balance)/peak*100);
   ledger.push({horizon,key,signalAt:plan.signalAt,entryTime:at,exitTime:+future[trade.bars-1][6],side:plan.side,pnl,netR:pnl/(qty*unitRisk),balance,reason:trade.reason});i+=trade.bars-1;
  }
  const gains=ledger.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0),losses=-ledger.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0);
  return {from,to,trades:ledger.length,signals,incomplete,waiting,blocked,noEntry,confirmationMissing,confirmationRejected,netPnl:balance-1000,netReturnPct:(balance/1000-1)*100,averageNetR:ledger.length?ledger.reduce((s,t)=>s+t.netR,0)/ledger.length:null,profitFactor:losses?gains/losses:null,closedDrawdownPct:dd,ledger};
 }
 return {version:HORIZON_VERSION,horizon,symbol,source,start,end,split,initialCapital:1000,riskFraction:.0025,fundingIncluded:false,executionModel:'OHLC_RESEARCH_NOT_FORWARD_FILLS',validation:'EXPERIMENTAL_NOT_PROFITABILITY_PROOF',technicalVersion:TECH_VERSION,technicalRows:['breakout','structured'].flatMap(key=>Object.keys(TECH_VARIANTS).map(variant=>({key,variant,development:run(key,start,split,1,variant),holdout:run(key,split,end,1,variant),stress:run(key,split,end,2,variant)}))),rows:['breakout','structured'].map(key=>({key,development:run(key,start,split),holdout:run(key,split,end),stress:run(key,split,end,2)}))};
}
// Fixed window, complete futures history only; no spot fallback, no candidate discovery from future data.
export async function fetchHorizonHistory(symbol,horizon,{fetcher=fetch,clock=Date.now}={}){
 const c=HORIZONS[horizon];if(!c||!/^[\p{L}\p{N}]+USDT$/u.test(symbol))throw new Error('幣種或週期異常');
 const end=frameOpen(clock(),c.trigger),start=end-HORIZON_DAYS[horizon]*DAY,frames={};
 for(const f of [c.trigger,c.context,c.regime]){
  let cursor=frameOpen(start,f)-(f===c.trigger?TECH_WINDOW:60)*FRAME_MS[f],pages=0;const rows=[];
  while(cursor<end&&pages++<20){
   const res=await fetcher(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${f}&startTime=${cursor}&endTime=${end-1}&limit=1000`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!res.ok)throw new Error(`${f} 永續歷史 HTTP ${res.status}；未以現貨補足`);
   const batch=await res.json();if(!Array.isArray(batch)||!batch.length)break;rows.push(...batch.filter(r=>+r[6]<end));
   const next=+batch.at(-1)[0]+FRAME_MS[f];if(!(next>cursor))throw new Error('歷史資料游標異常');cursor=next;if(batch.length<1000)break;
  }
  frames[f]=rows;
 }
 return {symbol,horizon,frames,start,end,source:'Binance USD-M public klines'};
}
export async function runHorizonComparison(symbol,horizon,options={}){return compareHorizons(await fetchHorizonHistory(symbol,horizon,options));}
