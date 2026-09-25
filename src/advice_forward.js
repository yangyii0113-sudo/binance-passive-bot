import { agentPlanStatus } from './agent_trade_plan.js';
import { FAMILY_VERSION } from './strategy_families.js';
import { EXIT_COSTS } from './target_analysis.js';
import { researchRiskScenario } from './research_risk_view.js';

export const FORWARD_VERSION='advice-forward-v1';
export const FORWARD_LIMIT=500;
export const FEED_GAP_MS=10000;
const H=3600000, LAG_MS=3000;
export const activeForward=row=>['PENDING','OPEN','PARTIAL'].includes(row.status);
const finite=n=>typeof n==='number' && Number.isFinite(n);
const signOf=plan=>plan.side==='LONG'?1:-1;
const cleanText=x=>String(x || '').slice(0,500);
export function emptyForwardBook(){return {version:FORWARD_VERSION,revision:0,canonical:false,paperOnly:true,realOrderLocked:true,noBackfill:true,rows:[]};}

export function normalizeForwardTick(data,symbol,receivedAt) {
  if(!data || data.e!=='aggTrade' || data.s!==symbol || (data.st!=null&&data.st!==1) || !Number.isSafeInteger(data.a) || data.a<0 || !Number.isSafeInteger(data.T) || data.T<=0 || !Number.isSafeInteger(data.E) || !finite(receivedAt) || receivedAt<=0 || data.T>data.E || data.E>receivedAt+1000 || receivedAt-data.T>LAG_MS || data.T>receivedAt+1000 || data.p==null || data.p==='' || !(Number(data.p)>0) || !Number.isFinite(Number(data.p)))throw new Error('即時成交資料格式或時間異常');
  return {id:data.a,time:data.T,eventTime:data.E,receivedAt,price:Number(data.p)};
}
export function tickContinuity(previous,tick) {
  if(!previous)return 'first';
  if(tick.id===previous.id && tick.time===previous.time && tick.price===previous.price)return 'duplicate';
  if(tick.id!==previous.id+1 || tick.time<previous.time || tick.receivedAt<previous.receivedAt || tick.receivedAt-previous.receivedAt>FEED_GAP_MS)return 'gap';
  return 'next';
}
function event(row,type,at,reason,extra={}) {row.events.push({type,at,reason,...extra});}
function end(row,status,reason,now){row.status=status;row.reason=reason;row.endedAt=now;event(row,status,now,reason);}
function identity(symbol,key,signalAt){return `${FORWARD_VERSION}:${FAMILY_VERSION}:${symbol}:${key}:${signalAt}`;}

// Mutates the owned in-memory book only. Persistence and the single-writer lock live elsewhere.
export function registerForwardAdvice(book,record,{now=Date.now(),feed=null}={}) {
  const status=agentPlanStatus(record,now);
  if(!record?.symbol || ['empty','loading'].includes(status.key))return [];
  const signalAt=record.row?.analysis?.closedAt;
  const candidates=status.key==='plan'?status.plans:[null];
  const added=[];
  for(const candidate of candidates){
    const id=identity(record.symbol,candidate?.key || status.key,signalAt ?? record.checkedAt ?? now);
    if(book.rows.some(r=>r.id===id))continue;
    if(book.rows.length>=FORWARD_LIMIT)throw new Error('已達 500 筆上限，請先匯出；停止新增且不刪除既有紀錄');
    const plan=candidate?Object.fromEntries(['key','side','entry','stop','tp1','tp2','signalAt','expiresAt'].map(k=>[k,candidate[k]])):null;
    const row={id,symbol:record.symbol,version:FORWARD_VERSION,strategyVersion:FAMILY_VERSION,createdAt:now,checkedAt:record.checkedAt??null,
      status:plan?'PENDING':'NO_SETUP',reason:cleanText(status.reason),plan,costs:{...EXIT_COSTS},referenceCapital:1000,riskFraction:.0025,
      entryUntil:plan?Math.min(record.snapshotUntil,plan.expiresAt):null,events:[],fills:[],cursor:null,stop:plan?.stop??null};
    event(row,'REGISTERED',now,row.reason);
    if(plan){
      const s=signOf(plan);
      if(!feed?.last || !finite(feed.startedAt) || feed.startedAt>record.checkedAt || now-feed.last.receivedAt>LAG_MS || feed.last.receivedAt>now || !Number.isSafeInteger(feed.last.id))end(row,'NOT_TRACKED','登錄時沒有連續即時行情，未建立模擬持倉',now);
      else if(book.rows.some(r=>r.symbol===row.symbol&&r.plan?.key===plan.key&&['OPEN','PARTIAL'].includes(r.status)))end(row,'NOT_TRACKED','同幣同策略已有未完成樣本，不重疊新增',now);
      else if(book.rows.filter(activeForward).length>=12)end(row,'NOT_TRACKED','同時觀察上限已滿，未建立模擬持倉',now);
      else if(s*(feed.last.price-plan.entry)>=0 || s*(feed.last.price-plan.stop)<=0 || (feed.barOpen===Math.floor(now/H)*H && (s===1?feed.high>=plan.entry||feed.low<=plan.stop:feed.low<=plan.entry||feed.high>=plan.stop)))end(row,'CANCELLED','登錄前行情已觸及門檻或失效價，不追價',now);
      else {row.cursor={...feed.last};event(row,'WATCHING',now,'開始接收登錄後的連續行情',{tick:{...feed.last}});}
    }
    book.rows.push(row);added.push(row);
  }
  return added;
}

export function interruptForward(book,reason,now=Date.now(),symbol=null) {
  let changed=false;
  for(const row of book.rows)if(activeForward(row)&&(!symbol||row.symbol===symbol)){end(row,'GAP',cleanText(reason),now);changed=true;}
  return changed;
}
function fill(row,kind,rawPrice,qty,tick) {
  const s=signOf(row.plan),entry=kind==='ENTRY';
  const price=rawPrice*(1+(entry?s:-s)*row.costs.slippage),fee=price*qty*row.costs.fee;
  const f={kind,at:tick.time,receivedAt:tick.receivedAt,aggregateId:tick.id,rawPrice,price,qty,fee};
  row.fills.push(f);event(row,kind,tick.receivedAt,'依即時觀測與固定成本模擬',{tick:{...tick}});
  if(entry){row.entry=price;row.qty=qty;row.remaining=qty;row.deadline=(Math.floor(tick.time/H)+48)*H;row.status='OPEN';}
  else {row.remaining=Math.max(0,row.remaining-qty);if(row.remaining<row.qty*1e-10){row.remaining=0;end(row,'CLOSED',kind,tick.receivedAt);}}
}
function protectiveStop(row){
  const {fee,slippage}=row.costs,s=signOf(row.plan);
  const price=s===1?row.entry*(1+fee)/((1-slippage)*(1-fee)):row.entry*(1-fee)/((1+slippage)*(1+fee));
  return s===1?Math.max(row.plan.stop,price):Math.min(row.plan.stop,price);
}
export function advanceForward(book,symbol,tick) {
  let changed=false;
  for(const row of book.rows){
    if(row.symbol!==symbol||!activeForward(row))continue;
    const continuity=tickContinuity(row.cursor,tick);
    if(continuity==='duplicate')continue;
    if(continuity!=='next'){end(row,'GAP','成交序號或時間不連續，停止判定；不補算損益',tick.receivedAt);changed=true;continue;}
    row.cursor={...tick};
    const p=row.plan,s=signOf(p),before=row.events.length;
    if(row.status==='PENDING'){
      if(tick.receivedAt>=row.entryUntil || tick.time>=row.entryUntil)end(row,'EXPIRED','核對期限或訊號期限已到，未建立模擬持倉',tick.receivedAt);
      else if(s*(tick.price-p.stop)<=0)end(row,'CANCELLED','未進場已觸及失效價',tick.receivedAt);
      else if(s*(tick.price-p.entry)>=0){
        if(tick.time<row.createdAt)end(row,'CANCELLED','跨越門檻發生於登錄前，不補算成交',tick.receivedAt);
        else if(s*(tick.price-p.entry)>p.entry*row.costs.slippage)end(row,'CANCELLED','觀測價格已跳過可接受的進場範圍，不追價',tick.receivedAt);
        else {
          const risk=researchRiskScenario({...p,entry:tick.price});
          if(!risk || risk.netRewardRisk<1)end(row,'CANCELLED','觀測成交價格未通過原風險與成本條件',tick.receivedAt);
          else {row.initialRisk=risk.stopLoss;event(row,'TRIGGERED',tick.receivedAt,'登錄後觀測到進場條件',{tick:{...tick}});fill(row,'ENTRY',tick.price,risk.quantity,tick);}
        }
      }
    }else {
      if(row.protectAt && tick.time>=row.protectAt && !row.protected){row.stop=protectiveStop(row);row.protected=true;event(row,'PROTECTION',tick.receivedAt,'下一根起啟用成本保護止損');}
      if(s*(tick.price-row.stop)<=0)fill(row,'STOP',s===1?Math.min(tick.price,row.stop):Math.max(tick.price,row.stop),row.remaining,tick);
      else if(tick.time>=row.deadline)fill(row,'TIME',tick.price,row.remaining,tick);
      else {
        if(row.status==='OPEN'&&s*(tick.price-p.tp1)>=0){fill(row,'TP1',p.tp1,row.qty/2,tick);row.status='PARTIAL';if(p.key==='structured')row.protectAt=(Math.floor(tick.time/H)+1)*H;}
        if(s*(tick.price-p.tp2)>=0)fill(row,'TP2',p.tp2,row.remaining,tick);
      }
    }
    changed ||= row.events.length!==before;
  }
  return changed;
}
export function expireForward(book,now=Date.now()) {
  let changed=false;
  for(const row of book.rows)if(activeForward(row)){
    // Coverage loss wins over an expiry: we cannot claim it never triggered in a gap.
    if(!row.cursor || now-row.cursor.receivedAt>FEED_GAP_MS || now<row.cursor.receivedAt){end(row,'GAP','超過十秒未取得連續行情或本機時間異常',now);changed=true;}
    else if(row.status==='PENDING'&&now>=row.entryUntil){end(row,'EXPIRED','核對期限或訊號期限已到，未建立模擬持倉',now);changed=true;}
  }
  return changed;
}
export function samplePnl(row) {
  const entry=row.fills.find(f=>f.kind==='ENTRY');
  if(!entry || row.status!=='CLOSED')return null;
  const exits=row.fills.filter(f=>f.kind!=='ENTRY');
  if(Math.abs(exits.reduce((n,f)=>n+f.qty,0)-entry.qty)>entry.qty*1e-8)return null;
  const gross=exits.reduce((n,f)=>n+signOf(row.plan)*(f.price-entry.price)*f.qty,0);
  return gross-row.fills.reduce((n,f)=>n+f.fee,0);
}
export function forwardSummary(rows) {
  const values=rows.map(samplePnl).filter(finite),wins=values.filter(n=>n>0),losses=values.filter(n=>n<0);
  const sum=values.reduce((a,b)=>a+b,0),loss=-losses.reduce((a,b)=>a+b,0);
  return {total:rows.length,closed:values.length,pending:rows.filter(r=>r.status==='PENDING').length,open:rows.filter(r=>['OPEN','PARTIAL'].includes(r.status)).length,
    gap:rows.filter(r=>r.status==='GAP').length,notTracked:rows.filter(r=>r.status==='NOT_TRACKED').length,noSetup:rows.filter(r=>r.status==='NO_SETUP').length,cancelled:rows.filter(r=>['EXPIRED','CANCELLED'].includes(r.status)).length,
    netPnl:values.length?sum:null,average:values.length?sum/values.length:null,winRate:values.length?wins.length/values.length*100:null,profitFactor:loss?wins.reduce((a,b)=>a+b,0)/loss:null};
}
