import { emptyForwardBook, FORWARD_VERSION, FORWARD_LIMIT, activeForward, samplePnl } from './advice_forward.js';
import { FAMILY_VERSION } from './strategy_families.js';
import { researchRiskScenario } from './research_risk_view.js';
import { EXIT_COSTS } from './target_analysis.js';

export const FORWARD_STORAGE_KEY='foxyya.advice.forward.v1';
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-9;
const states=['PENDING','OPEN','PARTIAL','CLOSED','GAP','EXPIRED','CANCELLED','NOT_TRACKED','NO_SETUP'];
export function validateForwardBook(book){
  if(!book||book.version!==FORWARD_VERSION||!Number.isSafeInteger(book.revision)||book.revision<0||book.canonical!==false||book.paperOnly!==true||book.realOrderLocked!==true||book.noBackfill!==true||!Array.isArray(book.rows)||book.rows.length>FORWARD_LIMIT)throw new Error('前向紀錄格式異常；保留原資料，停止追蹤');
  const ids=new Set();
  for(const r of book.rows){
    const check=ok=>{if(!ok)throw new Error('前向紀錄內容不完整；保留原資料，停止追蹤');};
    check(r&&typeof r.id==='string'&&r.id.length<250&&!ids.has(r.id)&&/^[\p{L}\p{N}]+USDT$/u.test(r.symbol)&&r.symbol.length<60&&r.version===FORWARD_VERSION&&r.strategyVersion===FAMILY_VERSION&&positive(r.createdAt)&&states.includes(r.status)&&typeof r.reason==='string'&&r.reason.length<=500);
    ids.add(r.id);
    check(r.costs?.fee===EXIT_COSTS.fee&&r.costs?.slippage===EXIT_COSTS.slippage&&r.referenceCapital===1000&&r.riskFraction===.0025);
    check(Array.isArray(r.events)&&r.events.length>0&&r.events.length<=24&&r.events[0].type==='REGISTERED'&&Array.isArray(r.fills)&&r.fills.length<=3);
    for(const e of r.events)check(e&&typeof e.type==='string'&&positive(e.at)&&typeof e.reason==='string');
    if(!r.plan){check(r.status==='NO_SETUP'&&r.fills.length===0);continue;}
    check(['structured','breakout','meanReversion'].includes(r.plan.key)&&researchRiskScenario(r.plan)&&positive(r.plan.signalAt)&&positive(r.plan.expiresAt)&&positive(r.entryUntil)&&r.entryUntil<=r.plan.expiresAt&&positive(r.checkedAt)&&r.entryUntil<=r.checkedAt+60000);
    check(r.status!=='NO_SETUP');
    if(activeForward(r))check(r.cursor&&Number.isSafeInteger(r.cursor.id)&&r.cursor.id>=0&&positive(r.cursor.time)&&positive(r.cursor.receivedAt)&&positive(r.cursor.price));
    const entry=r.fills[0],s=r.plan.side==='LONG'?1:-1;
    for(let i=0;i<r.fills.length;i++){
      const f=r.fills[i];
      check(f&&positive(f.price)&&positive(f.rawPrice)&&positive(f.qty)&&positive(f.at)&&positive(f.receivedAt)&&Number.isSafeInteger(f.aggregateId)&&f.aggregateId>=0&&near(f.price,f.rawPrice*(1+(i===0?s:-s)*r.costs.slippage))&&near(f.fee,f.price*f.qty*r.costs.fee));
      check(i===0?f.kind==='ENTRY':['TP1','TP2','STOP','TIME'].includes(f.kind));
      if(i>0)check(f.at>=entry.at&&f.aggregateId>=entry.aggregateId);
    }
    if(entry){
      const risk=researchRiskScenario({...r.plan,entry:entry.rawPrice});
      check(risk&&near(entry.qty,risk.quantity)&&near(r.initialRisk,risk.stopLoss)&&near(r.entry,entry.price)&&near(r.qty,entry.qty)&&positive(r.deadline)&&positive(r.stop));
      check(['OPEN','PARTIAL','CLOSED','GAP'].includes(r.status));
      const remaining=entry.qty-r.fills.slice(1).reduce((n,f)=>n+f.qty,0);
      check(remaining>=-1e-9&&near(r.remaining,Math.max(0,remaining)));
      if(r.status==='CLOSED')check(r.fills.length>=2&&near(remaining,0)&&Number.isFinite(samplePnl(r))&&r.events.at(-1).type==='CLOSED');
      if(r.status==='OPEN')check(r.fills.length===1);
      if(r.status==='PARTIAL')check(r.fills.length===2&&r.fills[1].kind==='TP1'&&near(r.remaining,r.qty/2));
    }else check(!['OPEN','PARTIAL','CLOSED'].includes(r.status));
    if(!activeForward(r))check(positive(r.endedAt)&&r.events.at(-1).type===r.status);
  }
  return book;
}

// A comparison guard supplements the session's Web Lock. Never replace malformed data.
export function createForwardStore(storage){
  let token,revision;
  return {
    load(){
      if(!storage)throw new Error('本機儲存不可用，停止追蹤');
      token=undefined;revision=undefined;
      const raw=storage.getItem(FORWARD_STORAGE_KEY);
      if(raw===null){token=null;revision=0;return emptyForwardBook();}
      if(raw.length>5000000)throw new Error('前向紀錄過大；保留原資料，停止追蹤');
      try{const book=validateForwardBook(JSON.parse(raw));token=raw;revision=book.revision;return book;}
      catch(error){throw new Error(`無法讀取前向紀錄：${error.message}`);}
    },
    save(book){
      validateForwardBook(book);
      if(token===undefined||book.revision!==revision||storage.getItem(FORWARD_STORAGE_KEY)!==token)throw new Error('另一個頁面已變更紀錄或讀取異常，停止寫入以免覆蓋');
      const next={...book,revision:book.revision+1},raw=JSON.stringify(next);
      if(raw.length>5000000)throw new Error('儲存容量上限已到；停止追蹤，請匯出既有資料');
      try{storage.setItem(FORWARD_STORAGE_KEY,raw);}
      catch{throw new Error('前向紀錄未保存；本機儲存不足或不允許寫入，停止追蹤');}
      token=raw;revision=next.revision;book.revision=next.revision;
    }
  };
}
export function exportForwardBook(book,now=Date.now()){
  validateForwardBook(book);
  return {filename:`foxyya-forward-${new Date(now).toISOString().slice(0,10)}.json`,mime:'application/json',text:JSON.stringify({exportedAt:now,notice:'本機獨立研究樣本，非正式帳本、非實單、非投組報酬；未含資金費率與深度；紀錄未經外部認證。缺漏不補算。',...book},null,2)};
}
