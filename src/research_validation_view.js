import { researchExtension } from './research_validation.js';
import { FAMILY_NAMES } from './strategy_families.js';
const n=v=>Number.isFinite(v)?v.toFixed(2):'無法估計';
const date=v=>new Date(v).toISOString().slice(0,10);
export function researchValidationView(result){
 let extension;try{extension=researchExtension(result);}catch{return '<p role="alert">分期／回踩研究數據不一致；請重新比較，不顯示推估績效。</p>';}
 if(!extension)return '<p>此筆舊紀錄尚無分期與回踩比較；重新研究才產生，不回填。</p>';
 const {validation,entryStudy}=extension;
 return `<details class="core-disclosure" data-search="temporal-entry-study"><summary>分期穩定性與突破／回踩進場比較</summary><p>後 30% 再分為三個連續時段；每期重新以 1,000 USDT 起算，不跨期持倉、不調參。這是固定規則分期檢查，未完成滾動訓練、跨幣或前向驗證。</p>
 <div class="comparison-scroll" role="region" aria-label="分期研究表，可左右滑動" tabindex="0"><table><thead><tr><th>期間</th><th>策略</th><th>樣本</th><th>淨損益 USDT</th><th>平均淨損益</th><th>獲利因子</th><th>已平倉回撤 %</th></tr></thead><tbody>${validation.folds.flatMap(f=>f.rows.map(r=>`<tr><td>${date(f.start)} 至 ${date(f.end)}（末端不含）</td><th>${FAMILY_NAMES[r.key]}</th><td>${r.metrics.trades}</td><td>${n(r.metrics.netPnl)}</td><td>${n(r.metrics.avgPnl)}</td><td>${n(r.metrics.profitFactor)}</td><td>${n(r.metrics.closedDrawdownPct)}</td></tr>`)).join('')}</tbody></table></div>
 <h4>區間突破 · 進場位置研究</h4><p>固定同一後段資料比較。回踩版最多等 3 根收盤棒觸及突破區間邊界、收回且實體同向；再由下一根突破回踩棒極值 ±0.1 ATR。原止損與目標不變；先碰止損、逾時、跳空或成本後風報不足即取消。研究版不接入即時 Gate，不可直接啟用。</p>
 <dl class="analysis-metrics">${[['原版突破',entryStudy.immediate],['回踩確認',entryStudy.retest],['回踩雙倍成本',entryStudy.retestStress]].map(([label,m])=>`<div><dt>${label} · ${m.trades} 筆</dt><dd>淨損益 ${n(m.netPnl)} USDT</dd><small>平均 ${n(m.avgPnl)} · PF ${n(m.profitFactor)} · 回撤 ${n(m.closedDrawdownPct)}%</small></div>`).join('')}</dl><p>兩版本成交樣本可能不同，不能把差額視為同一批交易改善。少樣本、單期盈利或較高報酬均不代表可盈利；未含資金費率與額外跳空。</p></details>`;
}
