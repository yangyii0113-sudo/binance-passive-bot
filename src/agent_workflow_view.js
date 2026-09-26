import { coinLogo } from './coin_logo.js';
import { adviceDisplayStatus } from './advice_display_status.js';
import { trendOutlookView } from './trend_outlook_view.js';
import { agentDecisionCard, agentActionLabel } from './agent_decision_view.js';
import { agentPlanStatus } from './agent_trade_plan.js';
import { FAMILY_NAMES } from './strategy_families.js';
import { escapeHtml as esc, displayDate } from './ui.js';
import { agentComparisonView } from './agent_comparison_view.js';
import { forwardTrackingBar } from './advice_forward_view.js';

export function agentAdvicePanel(state, now=Date.now(), {analysisForm=''}={}) {
  const records=Object.values(state.agents?.tradePlans || {}).filter(Boolean).sort((a,b)=>(b.checkedAt || 0)-(a.checkedAt || 0));
  const ready=records.filter(r=>agentPlanStatus(r,now).key==='plan');
  const filters=[['all','全部'],['plan','有計畫'],['wait','等條件'],['skip','略過／失效'],['attention','需處理']];
  const active=filters.some(([key])=>key===state.ui?.adviceFilter)?state.ui.adviceFilter:'all';
  const matches=(r,key)=>key==='all'||adviceDisplayStatus(r,now).group===key;
  const visible=records.filter(r=>matches(r,active));
  const selected=visible.find(r=>r.symbol===state.ui?.adviceSymbol) || visible.find(r=>agentPlanStatus(r,now).key==='plan') || visible[0];
  const symbol=esc(selected?.symbol || '');
  return `<section class="agent-panel-stack agent-advice-panel" aria-label="交易建議總覽">
    <div class="advice-intro"><strong>${records.length?`目前 ${ready.length} 檔有條件式模擬計畫`:'先選幣種，直接取得交易建議'}</strong><p>${records.length?'先選幣種，再看「目前建議」與點位。狀態不代表勝率或獲利排名。':'分析完成會直接顯示：現在該做什麼、進場條件、止盈、止損。條件不足時會清楚列出等待原因。'}</p></div>
    ${records.length?`<div class="advice-filters" role="group" aria-label="依建議狀態篩選">${filters.map(([key,label])=>`<button type="button" data-advice-filter="${key}" aria-pressed="${key===active}">${label}<span>${records.filter(r=>matches(r,key)).length}</span></button>`).join('')}</div>
      ${selected?`<div class="advice-symbols" role="group" aria-label="選擇要看的交易建議">${visible.map(r=>`<button type="button" class="advice-symbol-btn" data-agent-advice-symbol="${esc(r.symbol)}" data-advice-reason="${adviceDisplayStatus(r,now).code}" aria-pressed="${r===selected}"><span class="coin-identity">${coinLogo(r.symbol)}<strong>${esc(r.symbol)}</strong></span><span class="advice-symbol-status">${agentActionLabel(r,now)}</span></button>`).join('')}</div>
      <div class="advice-with-outlook" data-selected-advice="${symbol}">${agentDecisionCard(selected,{now})}${state.agents?.technical?.symbol===selected.symbol?trendOutlookView(state.agents.technical,selected,{now,compact:true}):''}</div>`:'<div class="empty-state"><strong>此分類目前沒有建議</strong><span>可切換全部，或分析其他幣種；不以其他分類的舊點位補足。</span><button type="button" class="secondary-btn" data-advice-filter="all">查看全部建議</button></div>'}
      <details class="core-disclosure" data-search="advice-new-analysis"><summary>分析其他幣種</summary>${analysisForm}</details>`:`<div class="advice-start">${analysisForm || '<button type="button" class="primary-inline-btn" data-agent-key="technical">開始分析</button>'}<p>尚無本次分析；歷史研究紀錄不會自動變成目前可用點位。</p></div>`}
    ${forwardTrackingBar(state)}
    <button type="button" class="secondary-btn" data-agent-key="planHistory">查看研究紀錄</button>
  </section>`;
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
