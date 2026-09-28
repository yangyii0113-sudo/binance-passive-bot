import { strategyFamilyPanel } from './strategy_family_view.js';
import { escapeHtml as esc, displayDate } from './ui.js';
import { comparisonEvidence, familyAssessment } from './strategy_performance.js';
import { FAMILY_NAMES } from './strategy_families.js';

export function agentComparisonView(comparison, symbol, {allowed=false,busy=false,compact=false,now=Date.now()}={}) {
  const loading=comparison?.status==='LOADING';
  const r=comparison?.result;
  const evidence=comparisonEvidence(comparison,symbol,now),valid=evidence.valid;
  const metrics=m=>`<dl class="analysis-metrics"><div><dt>後段每筆平均淨損益</dt><dd>${m.avgPnl===null?'尚無樣本':`${m.avgPnl.toFixed(2)} USDT`}</dd></div><div><dt>後段成本後報酬率</dt><dd>${m.trades?`${m.netReturnPct.toFixed(2)}%`:'尚無樣本'}</dd></div><div><dt>後段已平倉回撤</dt><dd>${m.trades?`${m.closedDrawdownPct.toFixed(2)}%`:'尚無樣本'}</dd></div><div><dt>後段獲利因子</dt><dd>${m.profitFactor===null?'無法估計':m.profitFactor.toFixed(2)}</dd></div></dl>`;
  const compactRows=valid?`<div class="profitability-rows">${evidence.rows.map(row=>`<details class="profitability-row" data-search="profitability-${esc(symbol)}-${row.key}"><summary><strong>${FAMILY_NAMES[row.key]}</strong><span>${familyAssessment(row)} · 後段 ${row.holdout.trades} 筆</span></summary>${metrics(row.holdout)}<p>雙倍成本淨損益 ${row.stress.trades?`${row.stress.netPnl.toFixed(2)} USDT`:'尚無樣本'}，${row.stress.trades} 筆。${row.key==='structured'?'此組會重新套用成本篩選，樣本可能不同。':'固定規則重算成本，不調整目前進場條件。'}</p><p>20 筆只是樣本不足的標記門檻；達到不等於驗證通過。獲利因子缺少虧損分母時無法估計；回撤僅按已平倉權益計算。</p></details>`).join('')}</div>`:'';
  return `<section class="agent-plan-comparison" aria-label="${esc(symbol)} 策略績效證據">
    <div class="agent-plan-heading"><h4>${compact?'獲利能力 · 歷史證據':'相同策略基礎規則 · 90 天比較'}</h4><button type="button" class="secondary-btn" data-agent-plan-compare="${esc(symbol)}" ${!allowed||busy||loading?'disabled':''}>${loading?'比較中…':valid?'重新比較近 90 天':'比較近 90 天三策略'}</button></div>
    ${valid?`<p>${comparison.historical?'歷史比較（唯讀）':'比較完成'}：${displayDate(comparison.updatedAt)}。${new Date(r.start).toISOString().slice(0,10)} 至 ${new Date(r.end).toISOString().slice(0,10)} 世界標準時間（結束不含）。前 70% 與後 30% 分開計算。</p>${compact?compactRows:`<details class="core-disclosure" data-search="${esc(symbol)} 相同策略績效"><summary>查看報酬、勝率、樣本與回撤</summary>${strategyFamilyPanel(r)}</details>`}`:`<p role="${comparison?.status==='ERROR'?'alert':'status'}">${esc(evidence.reason)}</p>`}
    ${comparison?.storageError?`<p role="alert">${esc(comparison.storageError)}</p>`:''}
    <p class="guard-note">${compact?'評估重點是成本後每筆損益、樣本與回撤，沒有獲利證據時不給成功率。每組獨立本金 1,000 USDT，未含資金費率。':''}本比較不重播每次即時行情核對或盤中取消操作；歷史表現不代表目前訊號勝率，也不解除進場與資料完整性檢查。</p>
  </section>`;
}

export function restoredAgentComparisons(history) {
  const records={};
  for(const run of history?.runs || []) for(const row of run.rows || []) {
    if(row.status==='DONE' && row.result?.families && !records[row.symbol]) records[row.symbol]={status:'LIVE',historical:true,updatedAt:run.updatedAt,result:row.result};
  }
  return records;
}
