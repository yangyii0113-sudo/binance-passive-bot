import { agentPlanStatus } from './agent_trade_plan.js';
import { FAMILY_NAMES } from './strategy_families.js';
import { escapeHtml as esc, displayDate } from './ui.js';

export function agentAdvicePanel(state, now=Date.now()) {
  const records=Object.values(state.agents?.tradePlans || {});
  return `<section class="agent-panel-stack"><div class="agent-intro"><strong>交易建議 · 先確認能否形成計畫</strong><span>以資料完整性、進場條件、成本後空間與風險檢查作決定；目前只供模擬觀察，不代表可實盤下單。</span></div>${records.length?records.map(record=>{
    const result=agentPlanStatus(record,now);
    return `<article class="agent-trade-plan"><h3>${esc(record.symbol)} · ${result.label}</h3><p>${result.key==='plan'?'建議：僅列入條件式模擬觀察；觸發前不進場，不累加同幣多個方案。':'建議：暫不進場。'}${esc(result.reason)}</p>${result.plans.length?`<p>候選方案：${result.plans.map(p=>`${FAMILY_NAMES[p.key]}（${p.side==='LONG'?'做多':'做空'}）`).join('、')}</p>`:''}<button type="button" class="primary-inline-btn" data-agent-plan-open="${esc(record.symbol)}">查看完整策略與點位</button></article>`;
  }).join(''):'<div class="empty-state"><strong>尚無交易建議</strong><span>先完成分析與策略擬定。</span><button type="button" class="primary-inline-btn" data-agent-key="technical">開始分析</button></div>'}</section>`;
}
export function agentHistoryPanel(state) {
  const history=state.agents?.planHistory || {runs:[]};
  return `<section class="agent-panel-stack"><div class="agent-intro"><strong>交易研究紀錄 · ${history.runs.length} 筆</strong><span>自動保存最近 50 次的分析結論、策略狀態與等待原因，僅限目前瀏覽器。這是研究紀錄，沒有實際成交或損益；舊點位不保存、不沿用。</span></div>${history.error?`<p role="alert">${esc(history.error)}</p>`:''}${history.runs.map(run=>`<details class="core-disclosure" data-search="${esc(run.id)}"><summary>${esc(run.symbol)} · ${esc(run.label)} · ${displayDate(run.savedAt)}</summary><p>歷史研究（唯讀） · ${esc(run.origin)} · 技術結論：${esc(run.consensus)}</p><p>${esc(run.reason)}</p><ul class="agent-plan-waits">${run.strategies.map(p=>`<li>${FAMILY_NAMES[p.key]} · ${p.side==='LONG'?'偏多':p.side==='SHORT'?'偏空':'待確認'}：${esc(p.reason || (p.status==='SETUP'?'當時符合研究條件，非成交紀錄':'當時條件未成立'))}</li>`).join('')}</ul><button type="button" class="secondary-btn" data-agent-plan-refresh="${esc(run.symbol)}">重新核對目前行情</button></details>`).join('') || '<div class="empty-state"><strong>尚無紀錄</strong><span>每次擬定計畫完成後會自動保存；不補造過往交易。</span></div>'}</section>`;
}
