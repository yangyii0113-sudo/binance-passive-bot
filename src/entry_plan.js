import { researchRiskView } from './research_risk_view.js';
import { coinAnalysisCards, coinHistoryPanel } from './coin_analysis_view.js';
import { strategyFamilyPanel } from './strategy_family_view.js';
import { comparisonDiagnostics } from './comparison_diagnostics.js';
import { batchComparisonPanel } from './comparison_batch_view.js';
import { displayText } from './display.js';
const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = v => v!==null && v!==undefined && v!=='' && Number.isFinite(Number(v)) && Number(v)>0 ? Number(v) : null;
const quote = v => number(v)===null?'—':Number(v).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:Number(v)<1?8:3});
export function entryPlan(plan,{research=false}={}) {
  const entry=number(plan.entry), stop=number(plan.stop);
  const risk=entry&&stop?Math.abs(entry-stop)/entry*100:null;
  const rewardR=target=>entry&&stop&&number(target)&&entry!==stop?(Math.abs(Number(target)-entry)/Math.abs(entry-stop)).toFixed(2):'—';
  return `<div class="entry-plan" aria-label="進場、止盈與止損點位">
    <div class="entry-plan-primary"><span>${research?`進場點位 · ${plan.side==='SHORT'?'跌破':'突破'}門檻`:'進場點位 · 報價參考'}</span><strong>${quote(entry)} <small>USDT</small></strong><p>${research?`等待${plan.side==='SHORT'?'向下跌破':'向上突破'}確認；此價格不是已成交價格`:'即時報價估算，尚未確認可進場'}</p></div>
    <div class="entry-plan-exits">
      <div class="entry-plan-target"><span>第一止盈</span><strong>${quote(plan.tp1)} <small>USDT</small></strong><small>${research?`${rewardR(plan.tp1)} 倍風險距離 · 規劃平倉 50%`:'固定百分比參考'}</small></div>
      <div class="entry-plan-target"><span>第二止盈</span><strong>${quote(plan.tp2)} <small>USDT</small></strong><small>${research?`${rewardR(plan.tp2)} 倍風險距離 · 規劃平倉剩餘 50%`:'固定百分比參考'}</small></div>
      <div class="entry-plan-stop"><span>止損點</span><strong>${quote(stop)} <small>USDT</small></strong><small>${risk===null?'風險距離待確認':`距進場 ${risk.toFixed(2)}%`}</small></div>
    </div>
    ${research?researchRiskView(plan):''}
    ${plan.targetAnalysis?`<div class="target-analysis"><strong>止盈依據</strong><p>${escape(displayText(plan.targetAnalysis.basis))}</p><p>前方結構：${quote(plan.targetAnalysis.structure)} USDT · 平均真實波幅：${quote(plan.targetAnalysis.atr)}</p><p>分批淨風報比：${plan.targetAnalysis.netRewardRisk.toFixed(2)}（兩段止盈均成交的情境，非預期收益）</p><p>假設單邊手續費 0.05%＋滑價 0.02%，未含資金費率。</p><p>第一止盈後，剩餘部位從下一根起移至成本保護停損；跳空仍可能虧損。</p></div>`:''}
  </div>`;
}
export function pullbackPanel(state,now=Date.now(),{renderMarket}={}) {
  const snapshot=state.pullback||{};
  return `<section id="coin-analysis" tabindex="-1" class="pullback-panel" aria-label="趨勢回調研究一號"><div class="pullback-heading"><div><span class="research-kicker">強勢前 10 檔 · 研究版 · 僅模擬</span><h3>強勢幣分析 · 三策略條件</h3><p>選幣 → 策略條件 → 進出場與風險 → 績效證據</p></div><button type="button" class="primary-btn" data-pullback-scan ${snapshot.loading||snapshot.comparing?'disabled':''}>${snapshot.loading?(snapshot.total?`分析中 ${snapshot.completed||0}／${snapshot.total}`:'正在更新行情…'):snapshot.analysisHistorical?'重新分析目前強勢幣':'分析強勢前 10 檔進場點位'}</button></div>
    <p class="guard-note">僅模擬研究 · 真實下單鎖定 · 排名與評分不代表勝率</p>
    ${snapshot.scannedAt?`<p class="strategy-note">${snapshot.analysisHistorical?'歷史行情':'行情更新'}：${escape(new Date(snapshot.scannedAt).toLocaleString('zh-TW'))} · ${snapshot.total} 檔</p>`:''}
    ${snapshot.analysisHistorical?'<p role="status">歷史分析（唯讀，非目前行情）；舊點位不沿用，請重新分析。</p>':''}
    ${snapshot.analysisStorageError?`<p role="alert">${escape(snapshot.analysisStorageError)}</p>`:''}
    <p class="risk-boundary">正式部位額度尚不可核對：缺少最新帳戶淨值與完整現有部位，無法確認組合風險 ≤1.5%；下方僅提供固定本金研究情境。</p>
    <div class="core-tools"><button type="button" class="secondary-btn" data-scroll-target="smc-reference">SMC 速查 ↓</button></div>
    <details class="core-disclosure" data-search="selection-rules"><summary>選幣規則與指標定義</summary><p>每次更新行情，從高流動性加密貨幣永續合約選出上漲標的，依市場強度、成交額排序。排除漲幅達 30% 或成交額低於 1,000 萬 USDT；不足 10 檔不補足。</p><p>三策略使用同一批完整收盤資料。相對量能對照前 20 根均量；波幅為 14 期平滑平均真實波幅；均線距離正值在上方、負值在下方。</p><p>研究條件成立不代表已成交或驗證通過，止盈／止損不會送出真實訂單。</p></details>
    <details class="core-disclosure" data-search="analysis-history"><summary>分析紀錄 · ${snapshot.analysisHistory?.length||0} 次</summary>${coinHistoryPanel({...snapshot,analysisStorageError:null})}</details>
    ${coinAnalysisCards(snapshot,now,entryPlan,renderMarket)}
    ${comparisonPanel(snapshot)}
  </section>`;
}

function comparisonPanel(snapshot){
  const r=snapshot.comparison;
  if(!snapshot.rows?.length&&!snapshot.batchHistory?.length&&!snapshot.batchRows?.length&&!r&&!snapshot.comparisonError&&!snapshot.batchStorageError)return '';
  const n=v=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(2):'—';
  const table=(label,items)=>`<h4>${label}</h4><div class="comparison-scroll"><table><thead><tr><th>規則</th><th>筆數</th><th>淨損益 USDT</th><th>勝率 %</th><th>獲利因子</th><th>每筆均值 USDT</th><th>已平倉回撤 %</th></tr></thead><tbody>${items.map(([label,v])=>`<tr><th>${label}</th><td>${v.trades}</td><td>${n(v.netPnl)}</td><td>${n(v.winRate)}</td><td>${n(v.profitFactor)}</td><td>${n(v.avgPnl)}</td><td>${n(v.closedDrawdownPct)}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="exit-comparison"><h3>策略績效比較</h3><p>上方幣種卡可比較近 90 天三策略；下方可批次比較。以成本後報酬、樣本與回撤共同判讀。</p><details class="core-disclosure" data-search="comparison-rules"><summary>比較方式與資料限制</summary><p>趨勢回調、區間突破、均值回歸固定參數；回調另比較原版一倍／兩倍風險距離與結構止盈。前 70% 與後 30% 分開計算，不自動挑選勝者。</p><p>目前強勢名單是事後選樣，不代表整套選幣策略的歷史績效。資料不足時停止，不補造資料。</p></details>
  ${batchComparisonPanel(snapshot.analysisHistorical?{...snapshot,rows:[]}:snapshot)}
  ${snapshot.comparisonError?`<p role="alert">${escape(displayText(snapshot.comparisonError))}</p>`:''}
  ${r?`<h4>${escape(r.symbol)} · ${new Date(r.start).toISOString().slice(0,10)} 至 ${new Date(r.end).toISOString().slice(0,10)} 世界標準時間（結束不含）</h4>
  <p>各組起始 1,000 USDT，每筆風險預算 0.25%、名目本金上限 1 倍；單幣獨立研究。最長持有 48 根一小時 K 棒，同根衝突先止損，區段末強制平倉。</p>
  ${strategyFamilyPanel(r)}
  <details class="core-disclosure" data-search="comparison-diagnostics"><summary>檢查訊號流失、原版／新版及成本明細</summary>${comparisonDiagnostics(r)}
  ${table('前段 70%：規則觀察',[['原版',r.development.baseline],['新版',r.development.enhanced]])}
  ${table('後段 30%：保留資料檢查',[['原版',r.holdout.baseline],['新版',r.holdout.enhanced],['新版 · 雙倍成本',r.holdout.stress]])}
  <p>新版後段訊號 ${r.holdout.enhanced.signals} 次，空間／成本篩選略過 ${r.holdout.enhanced.skipped} 次。${Object.entries(r.holdout.enhanced.skipReasons||{}).map(([reason,count])=>`${escape(displayText(reason))}：${count} 次`).join('；')}</p>
  </details><p class="comparison-verdict">${r.holdout.enhanced.trades<20?'樣本不足：新版後段未達 20 筆，不判定盈利提升。':r.holdout.enhanced.netPnl<=r.holdout.baseline.netPnl?'本次後段新版淨損益未超過原版，不升格。':'本次後段新版淨損益較高；仍需跨期間及前向觀察，不能認定穩定提升。'}</p>
  <p>已平倉回撤不含持倉浮虧。資金費率、交易所數量精度尚未納入；未來真實滑價可能更高，結果不得列為驗證通過。沒有虧損交易時獲利因子顯示 —。</p>`:snapshot.comparing?'<p role="status">正在計算策略績效，完成前不顯示推估結果。</p>':'<p>尚未執行比較；不顯示推估勝率或保證收益。</p>'}</div>`;
}
