import { agentPlanStatus } from './agent_trade_plan.js';
import { escapeHtml as esc } from './ui.js';

// Keep exceptions and their recovery action visible when detailed research is folded.
export function researchSummaryView(state,now=Date.now(),{compact=false,showIssues=true}={}){
 const rows=Object.entries(state.agents?.tradePlans||{}).filter(([,r])=>r).map(([symbol,record])=>({record:{...record,symbol},status:record.symbol!==symbol||(record.row?.symbol&&record.row.symbol!==symbol)?{key:'blocked',reason:'研究身分不符，請重新核對。',plans:[]}:agentPlanStatus(record,now)}));
 const ready=rows.filter(x=>x.status.key==='plan').length;
 const issues=rows.flatMap(({record,status})=>{
  const reasons=['expired','blocked','conflict'].includes(status.key)?[status.reason]:[];
  if(status.key==='plan'||status.key==='wait')for(const p of record.row?.analysis?.strategies||[])if(p.status==='BLOCKED')reasons.push(p.reason||'部分策略資料不足');
  const comparison=state.agents?.planComparisons?.[record.symbol];
  if(comparison?.status==='ERROR')reasons.push(comparison.error||'回測未完成');
  return reasons.length?[{symbol:record.symbol,reason:[...new Set(reasons)].join('；')}]:[];
 });
 if(compact&&!issues.length)return '';
 return `<div class="research-summary">${compact?'':`<p>三策略研究 · ${rows.length} 檔已分析 · <strong>${ready} 檔有效計畫</strong>${issues.length?` · ${issues.length} 檔需處理`:''}</p>${ready?`<div class="research-ready-links" aria-label="已核對的有效機會">${rows.filter(x=>x.status.key==='plan').slice(0,3).map(({record,status})=>`<button type="button" class="secondary-btn" data-research-open="${esc(record.symbol)}"><strong>${esc(record.symbol)}</strong><span>${status.plans[0].side==='LONG'?'↗ 做多':'↘ 做空'} · 條件成立・待觸發 →</span></button>`).join('')}</div>${ready>3?'<p>其餘有效計畫保留於完整研究。</p>':''}`:''}`}${showIssues&&issues.length?`<ul class="research-exceptions" aria-label="研究待處理事項">${issues.map(x=>`<li><p><strong>${esc(x.symbol)}</strong> · ${esc(x.reason)}</p><button type="button" class="secondary-btn" data-research-open="${esc(x.symbol)}">查看並重新核對</button></li>`).join('')}</ul>`:''}</div>`;
}
