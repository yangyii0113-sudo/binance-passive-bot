import { agentPlanStatus } from './agent_trade_plan.js';
import { strategyWaitDetail } from './advice_display_status.js';

// A display summary only; this never grants eligibility or changes strategy rules.
export function pullbackReadiness(record,now=Date.now()) {
  const gate=agentPlanStatus(record,now),a=record?.row?.analysis;
  if(!['plan','wait','conflict'].includes(gate.key)||record.row.symbol!==record.symbol)
    return {key:'unknown',complete:false,label:gate.key==='loading'?'平台核對中':'回踩狀態待核對',reason:gate.reason};
  const p=a.strategies.find(p=>p.key==='structured'),o=p?.observations;
  if(o?.version!=='strategy-conditions-v1'||o.closedAt!==a.closedAt||!['LONG','SHORT'].includes(o.side)||
    !['open','high','low','close','ema20'].every(k=>Number.isFinite(o[k])&&o[k]>0))
    return {key:'unknown',complete:false,label:'回踩尚未確認',reason:strategyWaitDetail(p).reason};
  const long=o.side==='LONG';
  const complete=(long?o.low<=o.ema20&&o.close>o.ema20&&o.close>o.open:o.high>=o.ema20&&o.close<o.ema20&&o.close<o.open);
  if(!complete)return {key:'waiting',complete:false,label:'回踩尚未完成',reason:strategyWaitDetail(p).label};
  if(gate.plans.some(p=>p.key==='structured'))return {key:'ready',complete:true,label:'回踩完成 · 計畫成立',reason:'完整核對通過；下方點位僅供等待新觸發的模擬計畫。'};
  return {key:'complete',complete:true,label:'回踩完成 · 暫不進場',reason:gate.key==='conflict'?gate.reason:strategyWaitDetail(p).label};
}
