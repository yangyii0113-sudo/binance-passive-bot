import { agentPlanStatus } from './agent_trade_plan.js';
const KEY='foxyya.agent-plan.history.v1', LIMIT=50;
const text=value=>typeof value==='string'?value.slice(0,500):'';
const finite=value=>typeof value==='number' && Number.isFinite(value);
function compact(run) {
  if (!run || typeof run.id!=='string' || !run.id || run.id.length>100 || !/^[\p{L}\p{N}]+USDT$/u.test(run.symbol) || !finite(run.savedAt) || !Array.isArray(run.strategies) || run.strategies.length>3 || !['plan','wait','blocked','expired','conflict'].includes(run.verdict)) throw new Error('交易研究紀錄格式無效');
  return {id:run.id,symbol:run.symbol,savedAt:run.savedAt,historical:true,paperOnly:true,realOrderLocked:true,
    origin:text(run.origin),consensus:text(run.consensus),verdict:run.verdict,label:text(run.label),reason:text(run.reason),
    checkedAt:finite(run.checkedAt)?run.checkedAt:null,closedAt:finite(run.closedAt)?run.closedAt:null,
    strategies:run.strategies.map(p=>{
      if (!['structured','breakout','meanReversion'].includes(p.key) || !['SETUP','WAIT','SKIP','BLOCKED'].includes(p.status)) throw new Error('策略紀錄格式無效');
      return {key:p.key,status:p.status,side:['LONG','SHORT'].includes(p.side)?p.side:null,reason:text(p.reason)};
    })};
}
export function loadAgentPlanHistory(storage) {
  try {
    const raw=(storage??localStorage).getItem(KEY);
    if (!raw) return {runs:[],error:null};
    if (raw.length>1000000) throw new Error('紀錄過大');
    const data=JSON.parse(raw);
    if (data.version!==1 || !Array.isArray(data.runs) || data.runs.length>LIMIT) throw new Error('格式無效');
    return {runs:data.runs.map(compact),error:null};
  } catch { return {runs:[],error:'無法讀取交易研究紀錄；原資料未被覆寫。'}; }
}
export function saveAgentPlanHistory(record, {storage, now=Date.now(), id=crypto.randomUUID(), origin='重新核對', consensus='未提供'}={}) {
  const result=agentPlanStatus(record,now);
  if (['empty','loading'].includes(result.key)) throw new Error('分析尚未完成，不能保存為結果');
  const previous=loadAgentPlanHistory(storage);
  if (previous.error) throw new Error(previous.error);
  // Conclusions only: old prices cannot reappear as current recommendations.
  const run=compact({id,symbol:record.symbol,savedAt:now,checkedAt:record.checkedAt,closedAt:record.row?.analysis?.closedAt,
    origin,consensus,verdict:result.key,label:result.label,reason:result.reason,strategies:record.row?.analysis?.strategies || []});
  const runs=[run,...previous.runs.filter(item=>item.id!==run.id)].slice(0,LIMIT);
  try { (storage??localStorage).setItem(KEY,JSON.stringify({version:1,runs})); }
  catch { throw new Error('分析完成，但紀錄未保存：瀏覽器空間不足或禁止儲存。'); }
  return {runs,error:null};
}
