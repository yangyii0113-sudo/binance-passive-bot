import { marketHealth } from './market_health_view.js';
import { agentPlanStatus } from './agent_trade_plan.js';
import { adviceDisplayStatus } from './advice_display_status.js';
import { escapeHtml as esc, displayDate } from './ui.js';

// Current research only. Counts never infer results for unanalysed coins.
export function researchPipelineStatus(state, selection, now=Date.now()) {
  const health=marketHealth(state.market,now);
  if(health.key!=='fresh')return {key:'data',title:'行情未通過核對・無法判定交易機會',reason:health.reason,rows:[],counts:{},next:'先取得完整新行情與合約清單，再核對策略；沒有固定恢復時間。'};
  const symbols=[...new Set(selection.rows.map(r=>r.symbol))];
  const selected=state.ui?.adviceSymbol;
  if(selected && state.agents?.tradePlans?.[selected] && !symbols.includes(selected))symbols.push(selected);
  const rows=symbols.map(symbol=>{
    const record=state.agents?.tradePlans?.[symbol];
    const mismatch=record && (record.symbol!==symbol || record.row?.symbol && record.row.symbol!==symbol);
    const gate=mismatch?{key:'blocked',reason:'分析標的與本幣不符，請重新核對。',plans:[]}:agentPlanStatus(record,now);
    const display=mismatch?{group:'attention',label:'資料待核對',reason:gate.reason,next:'重新核對本幣行情。'}:adviceDisplayStatus(record,now);
    // Partial research is visible even when another independent plan passes.
    const partial=record?.row?.analysis?.strategies?.some(p=>p.status==='BLOCKED')===true;
    const key=gate.key==='wait'?(partial?'blocked':display.group==='skip'?'skip':'wait'):gate.key;
    return {symbol,key,label:display.label,reason:display.reason,next:display.next,partial};
  });
  const counts=Object.fromEntries(['plan','wait','skip','blocked','conflict','expired','empty','loading'].map(key=>[key,rows.filter(r=>r.key===key).length]));
  const complete=counts.plan+counts.wait+counts.skip+counts.conflict;
  const unfinished=counts.empty+counts.loading+counts.blocked+counts.expired;
  const key=counts.plan?'plan':unfinished?'incomplete':rows.length?'no-plan':'no-candidate';
  const title={plan:`目前 ${counts.plan} 檔有有效模擬計畫・待觸發`,incomplete:'核對尚未完成・不能認定沒有交易機會','no-plan':'本輪已核對幣種尚無有效新計畫','no-candidate':'行情可用・本輪沒有符合選幣條件的候選'}[key];
  const next=key==='plan'?'查看有效計畫與期限，觀察啟用後的新觸發；尚未成交。':key==='incomplete'?'重新核對未分析、缺資料或已過期的幣種；暫不提供其點位。':key==='no-candidate'?'等待名單更新，或到交易建議選擇其他合約分析；不補足名額。':'查看逐幣條件，等新的完整收盤訊號再核對；不保證下一根成立。';
  return {key,title,rows,counts,complete,next,reason:`本輪候選 ${selection.rows.length} 檔${symbols.length>selection.rows.length?'，另含所選幣種':''}；目前完整且未過期 ${complete} 檔。`,nextClose:counts.wait||counts.skip?Math.floor(now/3600000)*3600000+3600000:null};
}
export function researchPipelineView(state,selection,now=Date.now()) {
  const m=researchPipelineStatus(state,selection,now);
  return `<section class="market-health research-pipeline" data-research-pipeline="${m.key}" aria-label="策略核對進度"><strong>${esc(m.title)}</strong><p>${esc(m.reason)}</p>${m.rows.length?`<p>有效 ${m.counts.plan} · 等條件 ${m.counts.wait} · 略過／失效 ${m.counts.skip} · 方向衝突 ${m.counts.conflict}<br>未分析 ${m.counts.empty} · 核對中 ${m.counts.loading} · 資料受阻 ${m.counts.blocked} · 已過期 ${m.counts.expired}</p>`:''}<p><b>下一步</b> ${esc(m.next)}</p>${m.nextClose?`<small>下個 1 小時收盤核對時間：${esc(displayDate(m.nextClose))}；4 小時趨勢仍依其完整收盤。這是核對時間，不是預定成交時間。</small>`:''}<details data-search="research-pipeline-evidence"><summary>查看本輪範圍與未成立原因</summary><p>自動選幣只掃高流動性候選池內，24 小時漲幅大於 0%、小於 30%、成交額至少 1,000 萬 USDT 的強勢前 10 檔；不是全市場掃描，未涵蓋全部下跌幣。入選幣仍可由既有策略判定做多或做空。</p>${m.rows.length?`<ul>${m.rows.map(r=>`<li><strong>${esc(r.symbol)} · ${esc(r.label)}${r.partial?' · 部分策略缺資料':''}</strong><p>${esc(r.reason)}</p><small>${esc(r.next)}</small></li>`).join('')}</ul>`:'<p>沒有可核對的本輪結果；不能推算策略通過率或盈利能力。</p>'}<p>條件成立 → 有效計畫 → 新行情觸發 → 模擬成交，是不同階段。前景頁面每 30 秒重新核對；背景、鎖屏或離線停止。PAPER_ONLY · REAL_ORDER_LOCK · No Backfill。</p></details></section>`;
}
