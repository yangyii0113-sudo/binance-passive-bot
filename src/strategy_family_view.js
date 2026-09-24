import { FAMILY_NAMES } from './strategy_families.js';
const n=v=>Number.isFinite(v)?v.toFixed(2):'—';
export function familyAssessment(row){
 if(!row?.holdout||!row?.stress||!Number.isInteger(row.holdout.trades)||row.holdout.trades<0||![row.holdout.netPnl,row.stress.netPnl].every(Number.isFinite))return '資料不足';
 if(row.holdout.trades<20)return '樣本不足';
 if(row.holdout.netPnl<=0)return '後段未盈利';
 if(row.stress.netPnl<=0)return '成本壓力未通過';
 return '待跨期及前向驗證';
}
export function strategyFamilyPanel(result){
 const families=result?.families;
 if(!families)return '<p>此筆歷史未包含多策略比較；重新比較才會產生，不回填舊紀錄。</p>';
 return `<section aria-label="多策略研究比較"><h3>多策略研究比較</h3>
 <p>三個策略家族、四組固定規則：趨勢回調有原版與結構止盈兩個版本。各組使用同一幣種、同一資料區間與風險預算；沒有自動排名或啟用勝者。</p>
 <div class="family-summary">${families.rows.map(row=>`<article class="detail-card"><strong>${FAMILY_NAMES[row.key]}</strong><p class="guard-note">${familyAssessment(row)}</p><dl class="core-metrics"><div><dt>後段成本後報酬率</dt><dd>${n(row.holdout.netReturnPct)}%</dd></div><div><dt>後段已平倉樣本</dt><dd>${row.holdout.trades} 筆</dd></div><div><dt>每筆平均淨損益</dt><dd>${n(row.holdout.avgPnl)} USDT</dd></div><div><dt>已平倉回撤</dt><dd>${n(row.holdout.closedDrawdownPct)}%</dd></div></dl><p>雙倍成本淨損益 ${n(row.stress.netPnl)} USDT</p></article>`).join('')}</div>
 <details class="core-disclosure" data-search="family-rules"><summary>策略定義與完整比較表</summary><div class="diagnostic-grid">
 <article class="detail-card"><strong>區間突破 · 研究第一版</strong><p>1 小時收盤超過前 20 根最高／最低價，且成交量達前 20 根均量 1.5 倍。下一根突破訊號棒高／低點加 0.1 倍平均真實波幅才進場。</p><p>止損設於近 5 根極值外 0.2 倍平均真實波幅；1R／2R 各平倉一半。</p></article>
 <article class="detail-card"><strong>均值回歸 · 研究第一版</strong><p>20／50 根均價差不超過 0.5 倍平均真實波幅；收盤偏離事先固定的 20 根均價兩倍標準差，再收回區間。下一根突破確認才進場。</p><p>止損同樣採近 5 根極值；第二目標為訊號當時的固定均價，第一目標為進場到均價的中點，各平倉一半。</p></article></div>
 <p>新策略扣除基本成本後，分批目標風報比需至少 1；有效期限 1 根。跳空越過進場／止損、逾時未突破即取消；最長持有 48 根，同根衝突先止損。成本壓力測試固定相同新策略計畫，只將成交費用與滑價加倍。</p>
 <div class="comparison-scroll" role="region" aria-label="多策略績效，可左右滑動" tabindex="0"><table><thead><tr><th>策略</th><th>前段筆數</th><th>前段淨損益</th><th>後段筆數</th><th>後段勝率 %</th><th>後段淨損益</th><th>每筆均值</th><th>獲利因子</th><th>已平倉回撤 %</th><th>雙倍成本淨損益</th><th>判讀</th></tr></thead><tbody>${families.rows.map(row=>`<tr><th>${FAMILY_NAMES[row.key]}</th><td>${row.development.trades}</td><td>${n(row.development.netPnl)}</td><td>${row.holdout.trades}</td><td>${n(row.holdout.winRate)}</td><td>${n(row.holdout.netPnl)}</td><td>${n(row.holdout.avgPnl)}</td><td>${n(row.holdout.profitFactor)}</td><td>${n(row.holdout.closedDrawdownPct)}</td><td>${n(row.stress.netPnl)}</td><td>${familyAssessment(row)}</td></tr>`).join('')}</tbody></table></div>
 </details><p>金額單位 USDT；每組獨立起始 1,000，每筆風險預算 0.25%，名目上限 1 倍。前 70% 與後 30% 分開計算。20 筆只用於標記樣本不足，超過不等於驗證通過。缺少資金費率、跨期與前向證據，不宣稱最高勝率、最佳組合或穩定盈利。</p>
 <p>本表是單幣獨立策略比較，尚未計算策略間相關性與共同持倉風險，不能加總為投資組合績效。新策略另提供收盤快照條件分析，尚未追蹤即時成交或接入正式執行。</p></section>`;
}
