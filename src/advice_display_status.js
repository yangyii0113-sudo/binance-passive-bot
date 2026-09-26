import { agentPlanStatus } from './agent_trade_plan.js';
import { FAMILY_NAMES } from './strategy_families.js';

// Display-only explanations. The original gate remains the sole authority for
// levels, expiry and paper eligibility. Unknown reasons stay visible verbatim.
export function strategyWaitDetail(plan) {
  const reason=String(plan.reason || '等待收盤條件成立');
  let code='conditions',group='wait',label='等待條件',priority=90;
  let next='等新的完整收盤訊號，再重新核對。';
  const set=(c,g,l,p,n)=>{code=c;group=g;label=l;priority=p;next=n;};
  if(plan.status==='BLOCKED')set('data','attention','資料待核對',0,'重新取得完整行情後再核對，暫不沿用點位。');
  else if(reason.includes('已觸及失效止損')||reason.includes('目標已越過進場點'))set('invalidated','skip','計畫已失效',10,'取消該方案，等待新訊號；不沿用舊點位。');
  else if(reason.includes('本根已觸及進場門檻'))set('missed','skip','已錯過進場',20,'等待下一根完整收盤重新分析，不追已觸發的門檻。');
  else if(plan.status==='SKIP'&&/風報比|1R 空間/.test(reason))set('risk','skip','空間／風報不足',30,'略過該方案，等新結構提供足夠空間；不放寬止損。');
  else if(plan.status==='SKIP')set('skipped','skip','略過本次方案',35,'依該策略原因等待新方案，再重新核對。');
  else if(reason.includes('訊號棒成交量達前 20 根均量的 1.5 倍'))set('volume','wait','突破量能不足',40,'等新的收盤棒同時通過突破與量能條件，再重新核對。');
  else if(plan.key==='structured'&&(plan.diagnosticReason==='extendedWait'||reason.includes('收盤離 20 期均線超過')))set('extended','wait','離均線過遠',45,'等待新回調收盤，不追離均線過遠的價格。');
  else if(plan.key==='structured'&&(plan.diagnosticReason==='trendWait'||reason.includes('4 小時尚未形成明確趨勢')))set('trend','wait','趨勢未確認',50,'等待 4 小時收盤價格、50／200 期均線與斜率同向。');
  else if(plan.key==='structured'&&(plan.diagnosticReason==='pullbackWait'||reason.includes('4 小時趨勢已成立')))set('pullback','wait','回踩尚未確認',60,'等待 1 小時觸及 20 期均線後收回，並以同向實體收盤。');
  else if(plan.key==='breakout'&&reason.includes('尚未收盤突破前 20 根'))set('breakout','wait','尚未收盤突破',70,'等待 1 小時收盤突破區間並確認量能，盤中越過不算。');
  else if(plan.key==='meanReversion'&&reason.includes('均線靠攏'))set('range','wait','尚非震盪區間',80,'等待均線距離符合震盪條件，再檢查偏離與收回。');
  else if(plan.key==='meanReversion'&&reason.includes('兩倍標準差後收回'))set('reclaim','wait','尚未偏離收回',80,'等待偏離固定區間後收回的完整收盤組合。');
  else if(reason==='波動不足')set('volatility','wait','波動不足',85,'等待可計算有效風險距離的新收盤資料。');
  return {code,group,label,priority,next,reason,family:FAMILY_NAMES[plan.key] || '研究策略',familyKey:plan.key};
}

export function adviceDisplayStatus(record,now=Date.now()) {
  const gate=agentPlanStatus(record,now);
  const base={gate,group:gate.key==='plan'?'plan':'attention',code:gate.key,reason:gate.reason,next:'重新核對行情後，再決定是否建立計畫。',details:[],primary:null};
  if(gate.key!=='wait')return {...base,label:({empty:'尚未分析',loading:'分析核對中',blocked:'資料不足',expired:'請更新',conflict:'方向衝突',plan:'等待觸發 · 僅模擬'})[gate.key]};
  const details=record.row.analysis.strategies.map(strategyWaitDetail);
  const primary=[...details].sort((a,b)=>a.priority-b.priority)[0];
  return {...base,group:primary.group,code:primary.code,label:primary.label,reason:`${primary.family}：${primary.reason}`,next:primary.next,details,primary};
}
