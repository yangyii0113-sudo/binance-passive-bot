import { strategyFamilyPanel } from './strategy_family_view.js';
import { escapeHtml as esc, displayDate } from './ui.js';

export function agentComparisonView(comparison, symbol, {allowed=false,busy=false}={}) {
  const loading=comparison?.status==='LOADING';
  const r=comparison?.result;
  const valid=comparison?.status==='LIVE' && r?.symbol===symbol && r.version==='TP01-S1' && r.families?.version==='families-v1';
  return `<section class="agent-plan-comparison" aria-label="${esc(symbol)} 策略績效證據">
    <div class="agent-plan-heading"><h4>相同策略基礎規則 · 90 天比較</h4><button type="button" class="secondary-btn" data-agent-plan-compare="${esc(symbol)}" ${!allowed||busy||loading?'disabled':''}>${loading?'比較中…':valid?'重新比較近 90 天':'比較近 90 天三策略'}</button></div>
    ${loading?'<p role="status">正在讀取完整歷史並計算成本後績效，完成前不顯示推估結果。</p>':comparison?.status==='ERROR'?`<p role="alert">${esc(comparison.error || '比較未完成，請稍後重試')}</p>`:valid?`<p>${comparison.historical?'歷史比較（唯讀）':'比較完成'}：${displayDate(comparison.updatedAt)}。${new Date(r.start).toISOString().slice(0,10)} 至 ${new Date(r.end).toISOString().slice(0,10)} 世界標準時間（結束不含）。</p><details class="core-disclosure" data-search="${esc(symbol)} 相同策略績效"><summary>查看報酬、勝率、樣本與回撤</summary>${strategyFamilyPanel(r)}</details>`:'<p>尚無相同策略的績效證據；其他均線基準的勝率不套用到本計畫。</p>'}
    ${comparison?.storageError?`<p role="alert">${esc(comparison.storageError)}</p>`:''}
    <p class="guard-note">本比較不重播每次即時行情核對或盤中取消操作；歷史表現不代表目前訊號勝率，也不解除進場與資料完整性檢查。</p>
  </section>`;
}

export function restoredAgentComparisons(history) {
  const records={};
  for(const run of history?.runs || []) for(const row of run.rows || []) {
    if(row.status==='DONE' && row.result?.families && !records[row.symbol]) records[row.symbol]={status:'LIVE',historical:true,updatedAt:run.updatedAt,result:row.result};
  }
  return records;
}
