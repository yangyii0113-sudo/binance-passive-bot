import { agentPlanStatus } from './agent_trade_plan.js';
import { FAMILY_NAMES } from './strategy_families.js';
import { escapeHtml as esc, displayDate } from './ui.js';
import { agentComparisonView } from './agent_comparison_view.js';

export function agentAdvicePanel(state, now=Date.now()) {
  const records=Object.values(state.agents?.tradePlans || {});
  return `<section class="agent-panel-stack"><div class="agent-intro"><strong>交易建議 · 先確認能否形成計畫</strong><span>以資料完整性、進場條件、成本後空間與風險檢查作決定；目前只供模擬觀察，不代表可實盤下單。</span></div>${records.length?records.map(record=>{
    const result=agentPlanStatus(record,now);
    const waits=result.key==='wait'?(record.row?.analysis?.strategies || []).map(p=>`<li>${esc(FAMILY_NAMES[p.key] || '研究策略')}：${esc(p.reason || '等待條件成立')}</li>`).join(''):'';
    return `<article class="agent-trade-plan"><h3>${esc(record.symbol)} · ${result.label}</h3><p>${result.key==='plan'?'建議：僅列入條件式模擬觀察；觸發前不進場，不累加同幣多個方案。':'建議：暫不進場。'}${esc(result.reason)}</p>${result.plans.length?`<p>候選方案：${result.plans.map(p=>`${FAMILY_NAMES[p.key]}（${p.side==='LONG'?'做多':'做空'}）`).join('、')}</p>`:''}${waits?`<ul class="agent-plan-waits">${waits}</ul>`:''}<button type="button" class="primary-inline-btn" data-agent-plan-open="${esc(record.symbol)}">查看完整策略與點位</button></article>`;
  }).join(''):'<div class="empty-state"><strong>尚無交易建議</strong><span>先完成分析與策略擬定。</span><button type="button" class="primary-inline-btn" data-agent-key="technical">開始分析</button></div>'}</section>`;
}
export function agentHistoryPanel(state) {
  const history=state.agents?.planHistory || {runs:[]};
  const file=state.agents?.planExport;
  return `<section class="agent-panel-stack"><div class="agent-intro"><strong>交易研究紀錄 · ${history.runs.length} 筆</strong><span>自動保存最近 50 次的分析結論、策略狀態與等待原因，僅限目前瀏覽器。這是研究紀錄，沒有實際成交或損益；舊點位不保存、不沿用。</span></div>${history.error?`<p role="alert">${esc(history.error)}</p>`:''}
    <div class="history-actions"><button type="button" class="secondary-btn" data-agent-history-export="csv" ${!history.runs.length||history.error?'disabled':''}>匯出表格</button><button type="button" class="secondary-btn" data-agent-history-export="json" ${!history.runs.length||history.error?'disabled':''}>匯出完整資料</button></div>
    ${file?`<section class="agent-export-preview" aria-label="研究紀錄匯出預覽"><strong>${esc(file.filename)}</strong><p>先檢查內容，再下載或複製；此檔案不包含成交、實際損益或目前可用點位。</p><textarea aria-label="匯出內容" readonly rows="8">${esc(file.text)}</textarea><div class="history-actions"><button type="button" class="secondary-btn" data-agent-export-download>下載檔案</button><button type="button" class="secondary-btn" data-agent-export-copy>複製內容</button></div></section>`:''}
    ${history.runs.map(run=>`<details class="core-disclosure" data-search="${esc(run.id)} ${esc(run.symbol)} ${esc(run.label)}"><summary>${esc(run.symbol)} · ${esc(run.label)} · ${displayDate(run.savedAt)}</summary><p>歷史研究（唯讀） · ${esc(run.origin)} · 技術結論：${esc(run.consensus)}</p><p>技術分析時間：${run.technicalAt?displayDate(run.technicalAt):'未記錄，不能視為目前技術結論'}</p><p>${esc(run.reason)}</p><ul class="agent-plan-waits">${run.strategies.map(p=>`<li>${FAMILY_NAMES[p.key]} · ${p.side==='LONG'?'偏多':p.side==='SHORT'?'偏空':'待確認'}：${esc(p.reason || (p.status==='SETUP'?'當時符合研究條件，非成交紀錄':'當時條件未成立'))}</li>`).join('')}</ul><div class="history-actions"><button type="button" class="secondary-btn" data-agent-plan-refresh="${esc(run.symbol)}" ${state.agents?.tradePlans?.[run.symbol]?.status==='LOADING'?'disabled':''}>${state.agents?.tradePlans?.[run.symbol]?.status==='LOADING'?'核對中…':'重新核對目前行情'}</button><button type="button" class="secondary-btn" data-agent-plan-open="${esc(run.symbol)}" ${!state.agents?.tradePlans?.[run.symbol]?'disabled':''}>查看本次計畫</button></div></details>`).join('') || '<div class="empty-state"><strong>尚無紀錄</strong><span>每次擬定計畫完成後會自動保存；不補造過往交易。</span></div>'}
    <details class="core-disclosure" data-search="策略比較紀錄"><summary>已保存的策略比較 · ${Object.values(state.agents?.planComparisons || {}).filter(c=>c.status==='LIVE').length} 檔</summary>${Object.entries(state.agents?.planComparisons || {}).filter(([,c])=>c.status==='LIVE').map(([symbol,c])=>`<h4>${esc(symbol)}</h4>${agentComparisonView({...c,historical:true},symbol)}`).join('') || '<p>尚無策略比較紀錄；在完整交易計畫中執行近 90 天比較後會保存。</p>'}</details>
  </section>`;
}
