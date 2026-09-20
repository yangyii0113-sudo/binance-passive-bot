import { escapeHtml, displayDate, finiteNumber } from './ui.js';
import { displayStatus, displayStrategyMatch, displayTimeframe, displayRange } from './display.js';

const number = value => finiteNumber(value)?.toLocaleString('zh-TW',{maximumFractionDigits:2}) ?? '—';
const percent = value => number(value) === '—' ? '—' : `${number(value)}%`;

export function researchHistoryPanel(history, selectedId) {
  const runs = Array.isArray(history?.runs) ? history.runs : [];
  const selected = runs.find(run=>run.id===selectedId) || runs[0];
  const rows = selected?.rows || [];
  return `<details class="research-history">
    <summary>研究歷史 <span>最近 ${runs.length} 次</span></summary>
    <p class="guard-note">歷史快照僅供唯讀查閱，並非目前行情或可直接下單的訊號。只儲存於此瀏覽器，最多保留 20 次。</p>
    ${selected ? `<label class="history-select">選擇研究紀錄<select data-research-history-select aria-label="選擇研究紀錄">
      ${runs.map(run=>`<option value="${escapeHtml(run.id)}" ${selected.id===run.id?'selected':''}>${escapeHtml(displayDate(run.completedAt))} · ${run.rows?.length || 0} 個標的</option>`).join('')}
    </select></label>` : '<p class="history-empty">尚無研究歷史，完成一次全套驗證後即可查閱。</p>'}
    <div class="history-actions">
      <button type="button" class="secondary-btn" data-history-export="csv" ${selected?'':'disabled'}>匯出此筆 CSV</button>
      <button type="button" class="secondary-btn" data-history-export="json" ${selected?'':'disabled'}>匯出全部 JSON</button>
    </div>
    <div class="history-rows">${rows.map(item=>{
      const result = item.backtest?.result || {};
      const input = item.backtest?.input || {};
      const field = (label,value) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
      return `<article class="history-row">
        <header><strong>${escapeHtml(item.symbol)}</strong><span>${escapeHtml(displayStatus(item.decision?.label || item.status))}</span></header>
        <dl>
          ${field('研究評分',number(item.researchScore))}${field('技術結論',item.technical?.consensus || '—')}
          ${field('策略匹配',displayStrategyMatch(item.strategyMatch))}${field('曝險檢查',displayStatus(item.risk?.status))}
          ${field('回測週期',displayTimeframe(input.timeframe))}${field('回測期間',displayRange(input.range))}
          ${field('交易筆數',number(result.trades))}${field('勝率',percent(result.winRatePct))}
          ${field('獲利因子',number(result.profitFactor))}${field('淨報酬率',percent(result.netReturnPct))}
          ${field('最大回撤',percent(result.maxDrawdownPct))}
        </dl>
      </article>`;
    }).join('')}</div>
  </details>`;
}
