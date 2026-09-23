const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = v => v!==null && v!==undefined && v!=='' && Number.isFinite(Number(v)) && Number(v)>0 ? Number(v) : null;
const quote = v => number(v)===null?'—':Number(v).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:Number(v)<1?8:3});
export function entryPlan(plan,{research=false}={}) {
  const entry=number(plan.entry), stop=number(plan.stop);
  const risk=entry&&stop?Math.abs(entry-stop)/entry*100:null;
  return `<div class="entry-plan" aria-label="進場、止盈與止損點位">
    <div class="entry-plan-primary"><span>${research?'進場點位 · 突破門檻':'進場點位 · 報價參考'}</span><strong>${quote(entry)} <small>USDT</small></strong><p>${research?'等待突破確認；此價格不是已成交價格':'即時報價估算，尚未確認可進場'}</p></div>
    <div class="entry-plan-exits">
      <div class="entry-plan-target"><span>第一止盈</span><strong>${quote(plan.tp1)} <small>USDT</small></strong><small>${research?'1R · 規劃平倉 50%':'固定百分比參考'}</small></div>
      <div class="entry-plan-target"><span>第二止盈</span><strong>${quote(plan.tp2)} <small>USDT</small></strong><small>${research?'2R · 規劃平倉剩餘 50%':'固定百分比參考'}</small></div>
      <div class="entry-plan-stop"><span>止損點</span><strong>${quote(stop)} <small>USDT</small></strong><small>${risk===null?'風險距離待確認':`距進場 ${risk.toFixed(2)}%`}</small></div>
    </div>
  </div>`;
}
export function pullbackPanel(state,now=Date.now()) {
  const snapshot=state.pullback||{};
  return `<section class="pullback-panel" aria-label="TP01 趨勢回調研究"><div class="pullback-heading"><div><span class="research-kicker">BTC / ETH · 研究版 · 僅模擬</span><h3>TP01 趨勢回調策略</h3><p>4 小時辨識趨勢，1 小時等待回調收盤，再觀察突破進場。</p></div><button type="button" class="primary-btn" data-pullback-scan ${snapshot.loading?'disabled':''}>${snapshot.loading?'分析中…':'分析 BTC／ETH 進場點位'}</button></div>
    <p class="strategy-note">尚未完成歷史回測與樣本外驗證，不列為「驗證通過」。止盈／止損為研究計畫，不會送出真實訂單。</p>
    ${snapshot.rows?.length?`<div class="cards-grid">${snapshot.rows.map(p=>{
      const expired=p.expiresAt&&p.expiresAt<=now;
      const ready=p.status==='SETUP'&&!expired;
      return `<article class="detail-card"><div class="strategy-card-head"><strong>${escape(p.symbol)}</strong><span class="signal-badge">${expired?'已過期，請重新分析':ready?'等待突破':p.status==='BLOCKED'?'資料不足／暫停':'等待條件'}</span></div><p>${ready?(p.side==='LONG'?'做多研究計畫':'做空研究計畫'):''}</p><p>${escape(expired?'此計畫已失效，不可沿用舊點位':p.reason)}</p>${ready?entryPlan(p,{research:true}):''}${ready?`<p class="strategy-note">有效期限：${new Date(p.expiresAt).toISOString().replace('T',' ').replace('.000Z',' UTC')}。止損先到、跳空越過門檻或逾時均取消；突破與成交尚未由系統追蹤。</p>`:''}</article>`;
    }).join('')}</div>`:'<div class="empty-state"><strong>尚未分析進場條件</strong><span>按上方按鈕讀取完整合約 K 線；未成立時不產生點位。</span></div>'}
  </section>`;
}
