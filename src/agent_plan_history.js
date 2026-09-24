import { agentPlanStatus } from './agent_trade_plan.js';
import { FAMILY_NAMES } from './strategy_families.js';
const KEY='foxyya.agent-plan.history.v1', LIMIT=50;
const text=value=>typeof value==='string'?value.slice(0,500):'';
const finite=value=>typeof value==='number' && Number.isFinite(value);
function compact(run) {
  if (!run || typeof run.id!=='string' || !run.id || run.id.length>100 || !/^[\p{L}\p{N}]+USDT$/u.test(run.symbol) || !finite(run.savedAt) || !Array.isArray(run.strategies) || run.strategies.length>3 || !['plan','wait','blocked','expired','conflict'].includes(run.verdict)) throw new Error('交易研究紀錄格式無效');
  return {id:run.id,symbol:run.symbol,savedAt:run.savedAt,historical:true,paperOnly:true,realOrderLocked:true,
    origin:text(run.origin),consensus:text(run.consensus),technicalAt:finite(run.technicalAt)?run.technicalAt:null,verdict:run.verdict,label:text(run.label),reason:text(run.reason),
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
export function saveAgentPlanHistory(record, {storage, now=Date.now(), id=crypto.randomUUID(), origin='重新核對', consensus='未提供',technicalAt=null}={}) {
  const result=agentPlanStatus(record,now);
  if (['empty','loading'].includes(result.key)) throw new Error('分析尚未完成，不能保存為結果');
  const previous=loadAgentPlanHistory(storage);
  if (previous.error) throw new Error(previous.error);
  // Conclusions only: old prices cannot reappear as current recommendations.
  const run=compact({id,symbol:record.symbol,savedAt:now,checkedAt:record.checkedAt,closedAt:record.row?.analysis?.closedAt,
    origin,consensus,technicalAt,verdict:result.key,label:result.label,reason:result.reason,strategies:record.row?.analysis?.strategies || []});
  const runs=[run,...previous.runs.filter(item=>item.id!==run.id)].slice(0,LIMIT);
  try { (storage??localStorage).setItem(KEY,JSON.stringify({version:1,runs})); }
  catch { throw new Error('分析完成，但紀錄未保存：瀏覽器空間不足或禁止儲存。'); }
  return {runs,error:null};
}

function csvCell(value) {
  let valueText=String(value ?? '');
  if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(valueText)) valueText="'"+valueText;
  return `"${valueText.replaceAll('"','""')}"`;
}
export function exportAgentPlanHistory(history, {format='csv',now=Date.now()}={}) {
  if (history?.error) throw new Error('紀錄讀取異常，請先確認原始資料');
  if (!Array.isArray(history?.runs) || !history.runs.length) throw new Error('尚無交易研究紀錄可匯出');
  if (history.runs.length>LIMIT || !finite(now)) throw new Error('匯出資料格式無效');
  const runs=history.runs.map(compact);
  if(format==='json') return {filename:'foxyya-trade-research.json',mime:'application/json;charset=utf-8',text:JSON.stringify({schema:'foxyya-trade-research/1',exportedAt:new Date(now).toISOString(),historical:true,canonical:false,paperOnly:true,realOrderLocked:true,noBackfill:true,containsFills:false,runs},null,2)};
  if(format!=='csv') throw new Error('不支援的匯出格式');
  const rows=[['紀錄編號','紀錄時間（世界標準時間）','幣種','篩選來源','技術分析時間（世界標準時間）','技術結論','歷史研究結論','策略','方向','當時策略狀態','原因','資料性質']];
  const date=value=>finite(value)?new Date(value).toISOString():'';
  for(const run of runs) for(const p of run.strategies.length?run.strategies:[{}]) rows.push([
    run.id,date(run.savedAt),run.symbol,run.origin,date(run.technicalAt),run.consensus,run.label,FAMILY_NAMES[p.key] || '',p.side==='LONG'?'偏多':p.side==='SHORT'?'偏空':'待確認',
    ({SETUP:'研究條件成立',WAIT:'等待條件',SKIP:'略過',BLOCKED:'阻擋'})[p.status] || '',p.reason || run.reason,'歷史研究；非成交；不可直接下單'
  ]);
  return {filename:'foxyya-trade-research.csv',mime:'text/csv;charset=utf-8',text:'\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')};
}
