import { evidenceModel } from './research_evidence.js';
import { escapeHtml as esc, displayDate } from './ui.js';

const direction={LONG:'偏多',SHORT:'偏空',MIXED:'方向未一致',UNKNOWN:'資料不足'};
const names={structured:'趨勢回調',breakout:'區間突破',meanReversion:'均值回歸'};
const states={SETUP:'收盤條件成立・待觸發',WAIT:'等待條件',SKIP:'略過本次方案',BLOCKED:'資料待核對',plan:'條件式研究計畫',wait:'等待條件',conflict:'方向衝突'};
const label=value=>direction[value]||states[value]||value;
export function researchEvidenceView(record,{history={runs:[]},now=Date.now()}={}){
 const m=evidenceModel(record,{history,now});
 if(!record)return '';
 const error=history.error?`<p class="evidence-storage-error" role="alert">${esc(history.error)}；前後比較暫停，目前分析仍可查看。</p>`:'';
 if(!m.available)return `<section class="research-evidence-panel" aria-label="市場觀點與證據"><h4>市場觀點與證據</h4><p role="status">${esc(m.reason)} 請重新核對後查看目前方向、來源與變化。</p>${error}</section>`;
 const s=m.snapshot;
 return `<section class="research-evidence-panel" aria-label="市場觀點與證據">
 <h4>市場觀點與證據</h4>
 <div class="evidence-overview"><div><span>可追溯來源</span><strong>1 個官方資料源</strong></div><div><span>多空分歧</span><strong>${m.conflict?'存在方向分歧':'未見相反方向'}</strong></div><div><span>觀點變化</span><strong>${history.error?'紀錄待處理':!m.previous?'尚無可比較紀錄':m.changes.length?`${m.changes.length} 項改變`:'與上次相同'}</strong></div></div>
 <p class="evidence-gate-reason">目前判定：${esc(s.reason)}</p>
 <p class="evidence-direction-summary">${s.directions.map(d=>`${esc(d.frame)} ${direction[d.direction]}`).join(' · ')}。${m.conflict?'分歧僅供研究；進場資格仍依本週期原有條件逐項核對。':'缺資料與等待條件不計入看多／看空。'}</p>
 <details class="core-disclosure" data-search="evidence-${esc(s.scope)}-${esc(s.symbol)}"><summary>查看來源、變化與分歧</summary>
 <p><strong>判定依據：</strong>Binance USD-M 公開 K 線，由平台計算週期方向及策略條件；不同週期不是不同的獨立消息來源。</p>
 <ul class="evidence-source-list">${m.sources.map(source=>`<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.frame)} 官方原始 K 線</a><span>截止 ${esc(displayDate(source.closedAt))}</span></li>`).join('')}</ul>
 <p>本次核對 ${esc(displayDate(s.checkedAt))}；連結重新請求截止當時的資料，不是原始回應封存。</p>
 <h5>前後變化</h5>${m.previous?`<p>比較 ${esc(displayDate(m.previous.checkedAt))} 的同幣、同研究週期紀錄；期間未觀察到的變化未知。</p>${m.changes.length?`<ul>${m.changes.map(change=>`<li>${change.kind==='reversal'?'方向反轉 · ':''}${esc(names[change.label]||change.label)}：${esc(label(change.before))} → ${esc(label(change.after))}${change.kind==='strategy'?`<small>方向：${esc(change.beforeSide?direction[change.beforeSide]:'未提供')} → ${esc(change.afterSide?direction[change.afterSide]:'未提供')}<br>原原因：${esc(change.beforeReason||'未提供')}<br>目前原因：${esc(change.afterReason||'未提供')}</small>`:''}</li>`).join('')}</ul>`:'<p>目前保留的方向及策略條件與上次相同。</p>'}`:'<p>尚無同幣、同研究週期的較早紀錄；不借用其他週期補足。</p>'}
 <h5>策略支持與等待原因</h5><ul class="evidence-reasons">${s.strategies.map(p=>`<li><strong>${esc(names[p.key])} · ${esc(p.status==='SETUP'&&s.verdict!=='plan'?'收盤條件成立・本次不進場':states[p.status])}${p.side?' · '+direction[p.side]:''}</strong><span>${esc(p.reason||'未提供分項理由，請查看完整策略核對。')}</span></li>`).join('')}</ul>
 <p class="evidence-social-note">社群觀點尚未接入；未提及不算中立，社群共識與條件通過數都不是勝率。</p>
 <p>結論僅存於此瀏覽器：每幣每研究範圍最近 8 筆、總計最多 120 筆；不跨裝置同步，清除網站資料會移除。歷史結論不恢復交易點位。</p>
 </details>${error}</section>`;
}
