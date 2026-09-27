import { escapeHtml } from './ui.js';
import { displayText } from './display.js';
const n=v=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(2):'—';
export function comparisonAssessment(result) {
  const old=result?.holdout?.baseline, next=result?.holdout?.enhanced,stress=result?.holdout?.stress;
  if(!old||!next||!stress)return '資料不足';
  if(old.trades<20||next.trades<20)return '樣本不足';
  if(next.netPnl<=0)return '新版後段未盈利';
  if(next.netPnl<=old.netPnl)return '新版未優於原版';
  if(stress.netPnl<=0)return '成本壓力未通過';
  return '僅供後續驗證';
}
export function batchComparisonPanel(snapshot) {
  const rows=snapshot.batchRows||[],done=rows.filter(r=>r.status==='DONE').length,errors=rows.filter(r=>r.status==='ERROR').length;
  const running=rows.find(r=>r.status==='RUNNING');
  const busy=snapshot.comparing||snapshot.loading;
  return `<section class="batch-comparison" aria-label="強勢幣批次比較">
    <details class="core-disclosure" data-search="batch-history"><summary>批次比較紀錄 · ${snapshot.batchHistory?.length||0} 次</summary><p>批次比較歷史：${snapshot.batchHistory?.length||0} 次</p>
    ${snapshot.batchHistory?.length?`<label>選擇比較日期<select data-comparison-history-select aria-label="選擇比較日期" ${busy?'disabled':''}><option value="" ${!snapshot.batchHistoryId?'selected':''} disabled>目前分析</option>${snapshot.batchHistory.map(run=>`<option value="${escapeHtml(run.id)}" ${run.id===snapshot.batchHistoryId?'selected':''}>${escapeHtml(new Date(run.startedAt).toLocaleString('zh-TW'))} · ${run.rows.length} 檔 · ${run.status==='DONE'?'已結束':run.status==='RUNNING'?'部分紀錄':'已停止'}</option>`).join('')}</select></label>`:''}
    </details>
    ${snapshot.batchStorageError?`<p role="alert">${escapeHtml(snapshot.batchStorageError)}</p>`:''}
    ${snapshot.batchRecord?`<p class="guard-note">${snapshot.batchHistorical?'歷史比較（唯讀，非目前行情）':'本次比較'} · 執行時間 ${escapeHtml(new Date(snapshot.batchRecord.startedAt).toLocaleString('zh-TW'))}${snapshot.batchRecord.status==='INTERRUPTED'?' · 上次比較中斷，未完成幣種不會自動續跑':''}${!snapshot.batchHistorical&&snapshot.batchSaved&&!snapshot.batchStorageError?' · 已保存至此瀏覽器':''}</p>`:''}
    <div class="comparison-actions">${snapshot.rows?.length?`<button type="button" class="primary-btn" data-pullback-batch ${busy||!snapshot.rows?.length?'disabled':''}>一鍵比較本次 ${snapshot.rows?.length||0} 檔</button>`:''}${snapshot.batchRunning?`<button type="button" class="secondary-btn" data-pullback-batch-stop ${snapshot.batchStop?'disabled':''}>${snapshot.batchStop?'停止已排定':'目前幣種完成後停止'}</button>`:''}</div>
    ${rows.length?`<p role="status" aria-live="polite">完成 ${done}／${rows.length} 檔 · 失敗 ${errors} 檔${running?` · 正在比較 ${escapeHtml(running.symbol)}`:rows.some(r=>r.status==='CANCELLED')?' · 已停止':snapshot.batchRunning?' · 處理中':' · 本批已結束'}</p>
    <p>以下為後段 30% 保留資料結果，各幣獨立本金 1,000 USDT，不可加總成投資組合績效。批次期間固定；目前強勢名單有事後選樣限制，不代表選幣策略回測。最近 20 次批次紀錄保存在同一瀏覽器；不跨裝置同步，清除網站資料會移除紀錄。</p>
    <div class="comparison-scroll" role="region" aria-label="批次比較結果，可左右滑動" tabindex="0"><table><thead><tr><th>幣種</th><th>狀態／判讀</th><th>原版筆數</th><th>新版筆數</th><th>原版淨損益</th><th>新版淨損益</th><th>新版勝率 %</th><th>新版獲利因子</th><th>新版回撤 %</th><th>雙倍成本淨損益</th><th>詳情</th></tr></thead><tbody>${rows.map(row=>{
      const a=row.result?.holdout?.baseline,b=row.result?.holdout?.enhanced,c=row.result?.holdout?.stress;
      const label=row.status==='DONE'?comparisonAssessment(row.result):row.status==='ERROR'?displayText(row.error):({PENDING:'等待執行',RUNNING:'比較中',CANCELLED:'已取消'})[row.status]||'待檢查';
      return `<tr><th>${escapeHtml(row.symbol)}</th><td>${escapeHtml(label)}</td><td>${a?.trades??'—'}</td><td>${b?.trades??'—'}</td><td>${n(a?.netPnl)}</td><td>${n(b?.netPnl)}</td><td>${n(b?.winRate)}</td><td>${n(b?.profitFactor)}</td><td>${n(b?.closedDrawdownPct)}</td><td>${n(c?.netPnl)}</td><td>${row.result?`<button type="button" class="secondary-btn" data-pullback-batch-detail="${escapeHtml(row.symbol)}">查看 ${escapeHtml(row.symbol)}</button>`:'—'}</td></tr>`;
    }).join('')}</tbody></table></div>`:''}
  </section>`;
}
