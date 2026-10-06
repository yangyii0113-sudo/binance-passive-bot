import { EXIT_COSTS } from './target_analysis.js';
import { researchRiskScenario } from './research_risk_view.js';
import { fetchMarketJson } from './market_request.js';
export const HORIZON_VERSION='horizons-v1';
export const HOUR=3600000;
export const FRAME_MS=Object.freeze({'15m':HOUR/4,'1h':HOUR,'4h':4*HOUR,'1d':24*HOUR,'1w':168*HOUR});
export const HORIZONS=Object.freeze(Object.fromEntries(Object.entries({
 day:{label:'日內機會',holding:'數小時～UTC 當日',trigger:'15m',context:'1h',regime:'4h',maxHoldMs:24*HOUR},
 week:{label:'週級波段',holding:'約 2～10 天',trigger:'1h',context:'4h',regime:'1d',maxHoldMs:240*HOUR},
 month:{label:'月級趨勢',holding:'約 2～8 週',trigger:'4h',context:'1d',regime:'1w',maxHoldMs:1344*HOUR}
}).map(([key,value])=>[key,Object.freeze(value)])));
export const HORIZON_NAMES=Object.freeze({breakout:'放量區間突破',structured:'順勢回調'});
const SOURCE='Binance USD-M public klines',TTL=60000;
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function frameOpen(now,frame){const step=FRAME_MS[frame],offset=frame==='1w'?4*24*HOUR:0;return Math.floor((now-offset)/step)*step+offset;}
export function validHorizonBars(rows,frame,now,{latest=true,min=60}={}){
 const step=FRAME_MS[frame];
 return !!step&&finite(now)&&Array.isArray(rows)&&rows.length>=min&&rows.every((r,i)=>Array.isArray(r)&&[0,1,2,3,4,5,6].every(k=>r[k]!==null&&r[k]!==''&&Number.isFinite(+r[k]))&&Math.min(+r[1],+r[2],+r[3],+r[4])>0&&+r[5]>=0&&+r[2]>=Math.max(+r[1],+r[4])&&+r[3]<=Math.min(+r[1],+r[4])&&+r[0]===frameOpen(+r[0],frame)&&+r[6]===+r[0]+step-1&&+r[6]<now&&(!i||+r[0]===+rows[i-1][0]+step))&&(!latest||+rows.at(-1)[0]===frameOpen(now,frame)-step);
}
function ema(a,n){let e=mean(a.slice(0,n));for(const v of a.slice(n))e+=(v-e)*2/(n+1);return e;}
function trend(rows){const c=rows.map(r=>+r[4]),fast=ema(c,20),slow=ema(c,50),prior=ema(c.slice(0,-3),20),price=c.at(-1);return price>fast&&fast>slow&&fast>prior?'LONG':price<fast&&fast<slow&&fast<prior?'SHORT':'MIXED';}
const wait=(key,reason,status='WAIT')=>({key,status,reason});
// Versioned research rules, independent of the original three-family control. Closed bars only.
export function horizonSignals({horizon,frames,now}){
 const c=HORIZONS[horizon];if(!c)return {status:'BLOCKED',reason:'未知策略週期',strategies:[]};
 const closed={};for(const f of [c.trigger,c.context,c.regime]){
  closed[f]=Array.isArray(frames?.[f])?frames[f].filter(r=>Array.isArray(r)&&+r[6]<now):[];
  if(!validHorizonBars(closed[f],f,now))return {status:'BLOCKED',reason:`${f} 完整收盤資料不足、過期或不連續`,strategies:[]};
  closed[f]=closed[f].slice(-60);
 }
 const rows=closed[c.trigger],last=rows.at(-1),side=trend(closed[c.context]),regime=trend(closed[c.regime]);
 const evidence={context:side,regime,trigger:c.trigger,contextFrame:c.context,regimeFrame:c.regime,closedAt:+last[6]};
 if(side==='MIXED'||regime==='MIXED'||side!==regime)return {status:'VALID',evidence,strategies:['breakout','structured'].map(k=>wait(k,side!==regime?'大週期方向衝突；等待同向收盤':'趨勢未成立；等待均線與斜率同向'))};
 const s=side==='LONG'?1:-1,closes=rows.map(r=>+r[4]),e20=ema(closes,20);
 const atr=mean(rows.slice(-14).map((r,i)=>Math.max(+r[2]-r[3],Math.abs(+r[2]-rows[rows.length-15+i][4]),Math.abs(+r[3]-rows[rows.length-15+i][4]))));
 const channel=rows.slice(-21,-1),upper=Math.max(...channel.map(r=>+r[2])),lower=Math.min(...channel.map(r=>+r[3])),vol=mean(channel.map(r=>+r[5]));
 Object.assign(evidence,{atr,atrMethod:'SMA-TR14',ema20:e20,volumeRatio:vol>0?+last[5]/vol:null,upper,lower});
 const strategies=['breakout','structured'].map(key=>{
  if(!(atr>0))return wait(key,'波動不足');
  if(key==='breakout'){
   if(!(s===1?+last[4]>upper:+last[4]<lower))return wait(key,'等待順勢收盤突破前 20 根區間');
   if(!(vol>0&&+last[5]>=vol*1.5))return wait(key,'等待訊號棒量能達前 20 根均量 1.5 倍');
  }else{
   if(!(s===1?+last[3]<=e20&&+last[4]>e20:+last[2]>=e20&&+last[4]<e20)||s*(+last[4]-last[1])<=0)return wait(key,'等待觸及 20 期均線後，同向實體收回');
   if(Math.abs(+last[4]-e20)>atr)return wait(key,'收盤離均線超過 1 ATR，暫不追價');
  }
  const entry=(s===1?+last[2]:+last[3])+s*.1*atr,stop=(s===1?Math.min(...rows.slice(-5).map(r=>+r[3])):Math.max(...rows.slice(-5).map(r=>+r[2])))-s*.2*atr,risk=s*(entry-stop);
  const plan={key,status:'SETUP',side,entry,stop,tp1:entry+s*risk,tp2:entry+s*2*risk,signalAt:+last[6],expiresAt:+last[6]+1+FRAME_MS[c.trigger],horizon,version:HORIZON_VERSION,intervalMs:FRAME_MS[c.trigger],maxHoldMs:c.maxHoldMs,atr};
  const cost=researchRiskScenario(plan);
  if(!cost||cost.netRewardRisk<1)return wait(key,'成本後分批目標風報不足 1，略過','SKIP');
  return plan;
 });
 return {status:'VALID',evidence,strategies};
}
export function analyzeHorizon({symbol,horizon,frames,now=Date.now(),requestedAt,receivedAt,contractVerifiedAt,source}={}){
 const c=HORIZONS[horizon],record={symbol,horizon,version:HORIZON_VERSION,status:'BLOCKED',checkedAt:now,source,contractVerifiedAt,strategies:[]};
 if(!c||!/^[\p{L}\p{N}]+USDT$/u.test(symbol||'')||source!==SOURCE||![now,requestedAt,receivedAt,contractVerifiedAt].every(finite)||requestedAt>receivedAt||receivedAt>now||contractVerifiedAt>now||now-contractVerifiedAt>=TTL||now-requestedAt>=TTL)return {...record,reason:'合約、來源或行情時間未通過核對'};
 const result=horizonSignals({horizon,frames,now});if(result.status!=='VALID')return {...record,...result};
 const current=frames[c.trigger].filter(r=>+r[0]===frameOpen(now,c.trigger));
 const q=current[0],step=FRAME_MS[c.trigger];
 const valid=current.length===1&&validHorizonBars([q],c.trigger,+q[0]+step,{min:1});
 return {...record,...result,status:'LIVE',snapshotUntil:requestedAt+TTL,validUntil:frameOpen(now,c.trigger)+step,
  snapshot:valid?{price:+q[4],high:+q[2],low:+q[3],barOpen:+q[0],requestedAt,receivedAt}:null};
}
export function horizonPlanStatus(r,now=Date.now()){
 const fail=(key,reason)=>({key,reason,plans:[]});const c=HORIZONS[r?.horizon];
 if(!r)return fail('empty','選擇幣種後核對此週期');
 if(r.status==='LOADING')return fail('loading','正在核對合約及三個週期的完整行情');
 if(!c||r.status!=='LIVE'||r.historical||r.version!==HORIZON_VERSION||r.source!==SOURCE)return fail('blocked',r.reason||'研究資料未通過核對');
 if(![r.checkedAt,r.snapshotUntil,r.validUntil,r.contractVerifiedAt].every(finite)||r.checkedAt>now||r.contractVerifiedAt>r.checkedAt||r.checkedAt-r.contractVerifiedAt>=TTL||r.snapshotUntil>r.checkedAt+TTL||r.validUntil!==frameOpen(r.checkedAt,c.trigger)+FRAME_MS[c.trigger])return fail('blocked','研究版本或時間不一致');
 if(now>=Math.min(r.snapshotUntil,r.validUntil)||now-r.contractVerifiedAt>=TTL)return fail('expired','核對已到期；重新取得行情，舊點位不沿用');
 if(!Array.isArray(r.strategies)||r.strategies.length!==2||r.strategies.map(p=>p?.key).sort().join(',')!=='breakout,structured'||r.strategies.some(p=>!['SETUP','WAIT','SKIP'].includes(p.status)))return fail('blocked','週期策略結果缺漏或異常');
 const plans=r.strategies.filter(p=>p.status==='SETUP');
 if(new Set(plans.map(p=>p.side)).size>1)return fail('conflict','策略方向衝突');
 if(!plans.length)return fail('wait',r.strategies.map(p=>p.reason).filter((v,i,a)=>a.indexOf(v)===i).join('；'));
 if(!['LONG','SHORT'].includes(r.evidence?.context)||r.evidence.context!==r.evidence.regime||plans.some(p=>p.side!==r.evidence.context))return fail('conflict','大週期方向未一致');
 const q=r.snapshot;
 if(!q||![q.price,q.high,q.low,q.barOpen,q.requestedAt,q.receivedAt].every(finite)||q.price<=0||q.low<=0||q.low>q.price||q.high<q.price||q.barOpen!==frameOpen(now,c.trigger)||q.requestedAt<q.barOpen||q.requestedAt>q.receivedAt||q.receivedAt>r.checkedAt||r.snapshotUntil>q.requestedAt+TTL)return fail('blocked','缺少有效當根行情，無法確認是否已錯過進場');
 if(plans.some(p=>p.horizon!==r.horizon||p.version!==HORIZON_VERSION||p.intervalMs!==FRAME_MS[c.trigger]||p.maxHoldMs!==c.maxHoldMs||p.signalAt!==q.barOpen-1||p.expiresAt!==r.validUntil||!researchRiskScenario(p)||researchRiskScenario(p).netRewardRisk<1))return fail('blocked','點位、成本或週期身分未通過核對');
 if(plans.some(p=>p.side==='LONG'?q.high>=p.entry||q.low<=p.stop:q.low<=p.entry||q.high>=p.stop))return fail('wait','本根已觸及進場或失效價；等待新收盤訊號，不追價');
 return {key:'plan',reason:'條件成立・待觸發；研究方案，尚未成交',plans};
}
export function horizonDeadline(horizon,entryAt){const c=HORIZONS[horizon];if(!c||!finite(entryAt))throw new Error('未知研究週期');return horizon==='day'?frameOpen(entryAt,'1d')+24*HOUR:frameOpen(entryAt,c.trigger)+c.maxHoldMs;}
export async function fetchHorizonFrames(symbol,horizon,{fetcher=fetch,clock=Date.now,limit=600}={}){
 const c=HORIZONS[horizon];if(!c)throw new Error('未知策略週期');
 const requestedAt=clock();
 const entries=await Promise.all([c.trigger,c.context,c.regime].map(async frame=>{
  const response=await fetcher(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${frame}&limit=${limit}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`${frame} 行情 HTTP ${response.status}`);const rows=await response.json();if(!Array.isArray(rows))throw new Error(`${frame} 行情格式異常`);return [frame,rows];
 }));
 return {frames:Object.fromEntries(entries),requestedAt,receivedAt:clock(),source:SOURCE};
}
export async function generateHorizonPlan(symbol,horizon,{fetcher=fetch,clock=Date.now}={}){
 try{
  if(!/^[\p{L}\p{N}]+USDT$/u.test(symbol||'')||!HORIZONS[horizon])throw new Error('幣種或週期無效');
  const started=clock(),contracts=await fetchMarketJson('contracts',{fetcher});
  if(!contracts.symbols.some(c=>c.symbol===symbol&&c.status==='TRADING'&&c.contractType==='PERPETUAL'&&c.quoteAsset==='USDT'&&c.underlyingType==='COIN'))throw new Error('未確認為有效 USDT 永續合約');
  const data=await fetchHorizonFrames(symbol,horizon,{fetcher,clock});
  return analyzeHorizon({symbol,horizon,...data,now:clock(),contractVerifiedAt:started});
 }catch(e){return {symbol,horizon,version:HORIZON_VERSION,status:'BLOCKED',reason:`暫停判定：${e.message}`,strategies:[]};}
}
