import { familyPlan } from './strategy_families.js';
const H=3600000;
const blocked=reason=>({version:'coin-analysis-v1',status:'BLOCKED',reason,strategies:[]});
const average=a=>a.reduce((s,x)=>s+x,0)/a.length;
function ema(a,n){let e=average(a.slice(0,n));for(const v of a.slice(n))e+=(v-e)*2/(n+1);return e;}
function valid(rows,step,min,asOf){return rows.length>=min&&rows.every((r,i)=>[0,1,2,3,4,6].every(k=>r[k]!==null&&r[k]!==''&&Number.isFinite(+r[k]))&&Math.min(+r[1],+r[2],+r[3],+r[4])>0&&+r[2]>=Math.max(+r[1],+r[4])&&+r[3]<=Math.min(+r[1],+r[4])&&+r[0]%step===0&&+r[6]===+r[0]+step-1&&(!i||+r[0]===+rows[i-1][0]+step))&&+rows.at(-1)[0]===Math.floor(asOf/step)*step-step;}
export function pullbackReason(plan){
 return ({trendWait:'4 小時尚未形成明確趨勢，等待價格與 50／200 期均線同向',pullbackWait:'4 小時趨勢已成立；等待 1 小時觸及 20 期均線後收回，並以同向實體收盤',extendedWait:'回調條件成立，但收盤離 20 期均線超過 1 倍平均真實波幅，暫不追價',riskBlocked:'進場與止損距離異常，停止產生點位',dataBlocked:'完整收盤資料不足或異常，請重新分析'})[plan.diagnosticReason]||plan.reason||'等待研究條件';
}
export function analyzeCoin({hourly=[],fourHourly=[],pullback={},now=Date.now()}={}){
 const asOf=Math.floor(now/H)*H;
 if(!Number.isFinite(asOf)||!Array.isArray(hourly)||!Array.isArray(fourHourly))return blocked('資料格式異常');
 const h=hourly.filter(r=>Array.isArray(r)&&Number(r[6])<now),f=fourHourly.filter(r=>Array.isArray(r)&&Number(r[6])<now);
 if(!valid(h,H,200,asOf)||!valid(f,4*H,500,asOf)||pullback.status==='BLOCKED')return blocked(pullbackReason(pullback));
 const breakout=familyPlan(h,'breakout',asOf),reversion=familyPlan(h,'meanReversion',asOf);
 if(breakout.status==='BLOCKED'||reversion.status==='BLOCKED')return blocked('量能或收盤資料異常，停止三策略分析');
 const hc=h.map(r=>+r[4]),fc=f.map(r=>+r[4]);const price=hc.at(-1),h20=ema(hc,20),h50=ema(hc,50),f50=ema(fc,50),f200=ema(fc,200),fPrevious=ema(fc.slice(0,-3),50);
 const hourlyDirection=price>h20&&h20>h50?'LONG':price<h20&&h20<h50?'SHORT':'MIXED';
 const fourHourlyDirection=fc.at(-1)>f50&&f50>f200&&f50>fPrevious?'LONG':fc.at(-1)<f50&&f50<f200&&f50<fPrevious?'SHORT':'MIXED';
 const tr=h.slice(1).map((r,i)=>Math.max(+r[2]-r[3],Math.abs(+r[2]-h[i][4]),Math.abs(+r[3]-h[i][4])));
 let atr=average(tr.slice(0,14));for(const t of tr.slice(14))atr=(atr*13+t)/14;
 const volume=average(h.slice(-21,-1).map(r=>+r[5]));
 return {version:'coin-analysis-v1',status:'VALID',analyzedAt:now,closedAt:+h.at(-1)[6],validUntil:asOf+H,lastClose:price,
 hourlyDirection,fourHourlyDirection,aligned:hourlyDirection!=='MIXED'&&hourlyDirection===fourHourlyDirection,
 atrPct:atr/price*100,volumeRatio:volume>0?+h.at(-1)[5]/volume:null,emaDistanceAtr:atr>0?(price-h20)/atr:null,
 strategies:[{...pullback,key:'structured',reason:pullbackReason(pullback)},{...breakout,key:'breakout'},{...reversion,key:'meanReversion'}]};
}
export function coinCategory(row,now=Date.now()){
 const a=row.analysis;
 if(!a||a.status!=='VALID')return 'blocked';
 if(!Number.isFinite(a.validUntil)||a.validUntil<=now)return 'expired';
 const plans=a.strategies.filter(p=>p.status==='SETUP');
 if(new Set(plans.map(p=>p.side)).size>1)return 'conflict';
 return plans.length?'plan':'wait';
}
