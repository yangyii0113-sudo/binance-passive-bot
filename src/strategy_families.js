import { EXIT_COSTS } from './target_analysis.js';
// Isolated fixed-rule research. Inputs contain only fully closed one-hour bars.
const H=3600000;
export const FAMILY_VERSION='families-v1';
export const FAMILY_NAMES=Object.freeze({pullback:'趨勢回調 · 原版',structured:'趨勢回調 · 結構止盈',breakout:'區間突破',meanReversion:'均值回歸'});
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const wait=reason=>({status:'WAIT',diagnosticReason:'pullbackWait',reason});
export function familyPlan(rows,kind,now){
 if(!['breakout','meanReversion'].includes(kind))throw new Error('未知研究策略');
 if(!Array.isArray(rows)||rows.length<60||rows.some((r,i)=>[0,1,2,3,4,5,6].some(k=>r[k]===null||r[k]===''||!Number.isFinite(+r[k]))||Math.min(+r[1],+r[2],+r[3],+r[4])<=0||+r[5]<0||+r[2]<Math.max(+r[1],+r[4])||+r[3]>Math.min(+r[1],+r[4])||+r[0]%H||+r[6]!==+r[0]+H-1||(i&&+r[0]!==+rows[i-1][0]+H))||+rows.at(-1)[6]!==now-1)return {status:'BLOCKED',diagnosticReason:'dataBlocked',reason:'完整收盤資料不足或異常'};
 const last=rows.at(-1),prev=rows.at(-2);
 const atr=mean(rows.slice(-14).map((r,i)=>Math.max(+r[2]-r[3],Math.abs(+r[2]-rows[rows.length-15+i][4]),Math.abs(+r[3]-rows[rows.length-15+i][4]))));
 if(!(atr>0))return wait('波動不足');
 let side,center;
 if(kind==='breakout'){
  const channel=rows.slice(-21,-1),upper=Math.max(...channel.map(r=>+r[2])),lower=Math.min(...channel.map(r=>+r[3]));
  const averageVolume=mean(channel.map(r=>+r[5]));
  side=+last[4]>upper?'LONG':+last[4]<lower?'SHORT':null;
  if(!side)return wait('尚未收盤突破前 20 根最高／最低價');
  if(averageVolume<=0||+last[5]<averageVolume*1.5)return wait('收盤已突破區間；等待訊號棒成交量達前 20 根均量的 1.5 倍');
 }else{
  // Freeze the band before the excursion/reclaim pair: neither bar alters its own threshold.
  const base=rows.slice(-22,-2).map(r=>+r[4]);center=mean(base);
  const sd=Math.sqrt(mean(base.map(x=>(x-center)**2)));
  const recent=mean(rows.slice(-20).map(r=>+r[4])),slow=mean(rows.slice(-50).map(r=>+r[4]));
  if(sd<=0||Math.abs(recent-slow)>atr*.5)return wait('等待均線靠攏的震盪區間');
  side=+prev[4]<center-2*sd&&+last[4]>center-2*sd&&+last[4]<center?'LONG':+prev[4]>center+2*sd&&+last[4]<center+2*sd&&+last[4]>center?'SHORT':null;
  if(!side)return wait('等待偏離兩倍標準差後收回區間');
 }
 const sign=side==='LONG'?1:-1;
 const entry=(sign===1?+last[2]:+last[3])+sign*atr*.1;
 const stop=(sign===1?Math.min(...rows.slice(-5).map(r=>+r[3])):Math.max(...rows.slice(-5).map(r=>+r[2])))-sign*atr*.2;
 const risk=sign*(entry-stop);
 const tp2=kind==='meanReversion'?center:entry+sign*2*risk;
 const tp1=kind==='meanReversion'?entry+(tp2-entry)*.5:entry+sign*risk;
 if(!(risk>0)||Math.min(entry,stop,tp1,tp2)<=0||sign*(tp1-entry)<=0)return wait('目標已越過進場點，取消計畫');
 // Net full-target reward / stop risk at base costs; no threshold optimisation.
 const {fee,slippage}=EXIT_COSTS;
 const fill=entry*(1+sign*slippage);
 const net=target=>{const exit=target*(1-sign*slippage);return sign*(exit-fill)-fee*(fill+exit);};
 if((net(tp1)+net(tp2))/2/(-net(stop))<1)return {status:'SKIP',reason:'扣除基本成本後，分批目標風報比不足 1'};
 return {status:'SETUP',side,entry,stop,tp1,tp2,atr,signalAt:+last[6],expiresAt:now+H};
}
