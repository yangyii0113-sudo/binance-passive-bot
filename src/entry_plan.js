import { batchComparisonPanel } from './comparison_batch_view.js';
import { displayText } from './display.js';
const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = v => v!==null && v!==undefined && v!=='' && Number.isFinite(Number(v)) && Number(v)>0 ? Number(v) : null;
const quote = v => number(v)===null?'—':Number(v).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:Number(v)<1?8:3});
export function entryPlan(plan,{research=false}={}) {
  const entry=number(plan.entry), stop=number(plan.stop);
  const risk=entry&&stop?Math.abs(entry-stop)/entry*100:null;
  return `<div class="entry-plan" aria-label="進場、止盈與止損點位">
    <div class="entry-plan-primary"><span>${research?'進場點位 · 突破門檻':'進場點位 · 報價參考'}</span><strong>${quote(entry)} <small>USDT</small></strong><p>${research?'等待突破確認；此價格不是已成交價格':'即時報價估算，尚未確認可進場'}</p></div>
    <div class="entry-plan-exits">
      <div class="entry-plan-target"><span>第一止盈</span><strong>${quote(plan.tp1)} <small>USDT</small></strong><small>${research?`${plan.targetAnalysis?.tp1R?.toFixed(2)||'1'} 倍風險距離 · 規劃平倉 50%`:'固定百分比參考'}</small></div>
      <div class="entry-plan-target"><span>第二止盈</span><strong>${quote(plan.tp2)} <small>USDT</small></strong><small>${research?`${plan.targetAnalysis?.tp2R?.toFixed(2)||'2'} 倍風險距離 · 規劃平倉剩餘 50%`:'固定百分比參考'}</small></div>
      <div class="entry-plan-stop"><span>止損點</span><strong>${quote(stop)} <small>USDT</small></strong><small>${risk===null?'風險距離待確認':`距進場 ${risk.toFixed(2)}%`}</small></div>
    </div>
    ${plan.targetAnalysis?`<div class="target-analysis"><strong>止盈依據</strong><p>${escape(displayText(plan.targetAnalysis.basis))}</p><p>前方結構：${quote(plan.targetAnalysis.structure)} USDT · 平均真實波幅：${quote(plan.targetAnalysis.atr)}</p><p>分批淨風報比：${plan.targetAnalysis.netRewardRisk.toFixed(2)}（兩段止盈均成交的情境，非預期收益）</p><p>假設單邊手續費 0.05%＋滑價 0.02%，未含資金費率。</p><p>第一止盈後，剩餘部位從下一根起移至成本保護停損；跳空仍可能虧損。</p></div>`:''}
  </div>`;
}
export function pullbackPanel(state,now=Date.now()) {
  const snapshot=state.pullback||{};
  return `<section class="pullback-panel" aria-label="趨勢回調研究一號"><div class="pullback-heading"><div><span class="research-kicker">強勢前 10 檔 · 研究版 · 僅模擬</span><h3>趨勢回調研究一號 · 結構止盈</h3><p>4 小時辨識趨勢，1 小時等待回調收盤，再觀察突破進場。</p></div><button type="button" class="primary-btn" data-pullback-scan ${snapshot.loading||snapshot.comparing?'disabled':''}>${snapshot.loading?`分析中 ${snapshot.completed||0}／${snapshot.total||10}`:'分析強勢前 10 檔進場點位'}</button></div>
    <p class="strategy-note">每次分析先更新行情，從高流動性標的池選出上漲的加密貨幣永續合約，依市場強度排序，成交額作同分排序；排除 24 小時漲幅達 30% 及成交額低於 1,000 萬 USDT 的標的。不足 10 檔不補足，排名不代表可立即進場。</p>
    ${snapshot.error?`<p role="alert">${escape(displayText(snapshot.error))}</p>`:''}
    ${snapshot.scannedAt?`<p>行情時間：${escape(new Date(snapshot.scannedAt).toLocaleString('zh-TW'))} · 本次 ${snapshot.total} 檔</p>`:''}
    <p class="strategy-note">新增結構止盈、成本篩選與 90 天比較；尚未取得足夠績效證據，不列為「驗證通過」。止盈／止損為研究計畫，不會送出真實訂單。</p>
    ${snapshot.rows?.length?`<div class="cards-grid">${snapshot.rows.map(p=>{
      const expired=p.expiresAt&&p.expiresAt<=now;
      const ready=p.status==='SETUP'&&!expired;
      return `<article class="detail-card"><div class="strategy-card-head"><strong>${p.rank?`第 ${p.rank} 名 · `:''}${escape(p.symbol)}</strong><span class="signal-badge">${expired?'已過期，請重新分析':ready?'等待突破':p.status==='BLOCKED'?'資料不足／暫停':p.status==='SKIP'?'空間不足，略過':'等待條件'}</span></div>${Number.isFinite(p.strength)?`<p>市場強度 ${p.strength.toFixed(1)}／100 · 24 小時 +${p.change.toFixed(2)}%</p>`:''}<p>${ready?(p.side==='LONG'?'做多研究計畫':'做空研究計畫'):''}</p><p>${escape(expired?'此計畫已失效，不可沿用舊點位':displayText(p.reason))}</p>${ready?entryPlan(p,{research:true}):''}${ready?`<p class="strategy-note">有效期限：${new Date(p.expiresAt).toISOString().replace('T',' ').replace('.000Z',' 世界標準時間')}。止損先到、跳空越過門檻或逾時均取消；突破與成交尚未由系統追蹤。</p>`:''}</article>`;
    }).join('')}</div>`:'<div class="empty-state"><strong>尚未分析進場條件</strong><span>按上方按鈕讀取完整合約 K 線；未成立時不產生點位。</span></div>'}
    ${comparisonPanel(snapshot)}
  </section>`;
}

function comparisonPanel(snapshot){
  const r=snapshot.comparison;
  const n=v=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(2):'—';
  const table=(label,items)=>`<h4>${label}</h4><div class="comparison-scroll"><table><thead><tr><th>規則</th><th>筆數</th><th>淨損益 USDT</th><th>勝率 %</th><th>獲利因子</th><th>每筆均值 USDT</th><th>已平倉回撤 %</th></tr></thead><tbody>${items.map(([label,v])=>`<tr><th>${label}</th><td>${v.trades}</td><td>${n(v.netPnl)}</td><td>${n(v.winRate)}</td><td>${n(v.profitFactor)}</td><td>${n(v.avgPnl)}</td><td>${n(v.closedDrawdownPct)}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="exit-comparison"><h3>出場規則比較</h3><p>同一進場邏輯：原版 一倍／兩倍風險距離 對照結構止盈＋成本篩選＋第一止盈後保護。前 70% 與後 30% 分開計算，固定參數、不自動挑選勝者。</p><p>先分析強勢前 10 檔，再選擇其中一檔比較最近 90 天的出場規則。一次執行一檔；新上市或歷史資料不足時停止，不補造資料。目前強勢名單是事後選樣，本比較不代表整套選幣策略的歷史績效。</p><div class="comparison-actions">${(snapshot.rows||[]).map(item=>`<button type="button" class="primary-btn" data-pullback-compare="${escape(item.symbol)}" ${snapshot.comparing||snapshot.loading?'disabled':''}>${snapshot.comparing&&snapshot.comparingSymbol===item.symbol?`正在比較 ${escape(item.symbol)}…`:`比較 ${escape(item.symbol)} · 90 天`}</button>`).join('')||'<p>請先點上方「分析強勢前 10 檔進場點位」，產生可比較清單。</p>'}</div>
  ${batchComparisonPanel(snapshot)}
  ${snapshot.comparisonError?`<p role="alert">${escape(displayText(snapshot.comparisonError))}</p>`:''}
  ${r?`<h4>${escape(r.symbol)} · ${new Date(r.start).toISOString().slice(0,10)} 至 ${new Date(r.end).toISOString().slice(0,10)} 世界標準時間（結束不含）</h4>
  <p>各組起始 1,000 USDT，每筆風險預算 0.25%、名目本金上限 1 倍；單幣獨立研究。最長持有 48 根一小時 K 棒，同根衝突先止損，區段末強制平倉。</p>
  ${table('前段 70%：規則觀察',[['原版',r.development.baseline],['新版',r.development.enhanced]])}
  ${table('後段 30%：保留資料檢查',[['原版',r.holdout.baseline],['新版',r.holdout.enhanced],['新版 · 雙倍成本',r.holdout.stress]])}
  <p>新版後段訊號 ${r.holdout.enhanced.signals} 次，空間／成本篩選略過 ${r.holdout.enhanced.skipped} 次。${Object.entries(r.holdout.enhanced.skipReasons||{}).map(([reason,count])=>`${escape(displayText(reason))}：${count} 次`).join('；')}</p>
  <p class="comparison-verdict">${r.holdout.enhanced.trades<20?'樣本不足：新版後段未達 20 筆，不判定盈利提升。':r.holdout.enhanced.netPnl<=r.holdout.baseline.netPnl?'本次後段新版淨損益未超過原版，不升格。':'本次後段新版淨損益較高；仍需跨期間及前向觀察，不能認定穩定提升。'}</p>
  <p>已平倉回撤不含持倉浮虧。資金費率、交易所數量精度尚未納入；未來真實滑價可能更高，結果不得列為驗證通過。沒有虧損交易時獲利因子顯示 —。</p>`:'<p>尚未執行比較；不顯示推估勝率或保證收益。</p>'}</div>`;
}
