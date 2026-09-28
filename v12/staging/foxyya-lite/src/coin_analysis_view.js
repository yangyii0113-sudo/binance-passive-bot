import { researchRiskScenario } from './research_risk_view.js';
import { displayText } from './display.js';
import { coinCategory } from './coin_analysis.js';
import { escapeHtml as esc } from './ui.js';
const names={structured:'趨勢回調 · 結構止盈',breakout:'區間突破',meanReversion:'均值回歸'};
const direction=v=>({LONG:'偏多',SHORT:'偏空',MIXED:'方向未一致'})[v]||'—';
const n=(v,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(d):'—';
const date=v=>Number.isFinite(v)?new Date(v).toLocaleString('zh-TW',{hour12:false}):'—';
const labels={historical:'歷史條件 · 唯讀',plan:'有研究計畫 · 等待突破',wait:'等待條件',conflict:'策略方向衝突 · 先觀察',blocked:'資料不足／異常',expired:'已過期，請重新分析'};
export function coinAnalysisCards(snapshot,now,renderPlan,renderMarket=()=> ''){
 const rows=snapshot.rows||[];
 if(!rows.length){
  const [title,detail]=snapshot.loading?['正在分析幣種條件','更新行情並核對完整收盤資料，請稍候。']:snapshot.error?['分析未完成',displayText(snapshot.error)]:snapshot.scannedAt?['本次沒有符合條件的強勢幣','行情已更新，但沒有標的通過選幣條件；不補足名額，也不產生進場點位。']:['尚未分析幣種條件','按上方按鈕讀取完整合約 K 線；未成立時不產生點位。'];
  return `<div class="empty-state" role="${snapshot.error?'alert':'status'}"><strong>${title}</strong><span>${esc(detail)}</span></div>`;
 }
 const historical=snapshot.analysisHistorical===true;
 const market=row=>historical?'':renderMarket(row);
 const compare=row=>`<div class="coin-card-actions"><button class="primary-inline-btn" type="button" data-agent-analyze="${esc(row.symbol)}" ${snapshot.loading||snapshot.comparing?'disabled':''}>${historical?'重新分析目前行情':'核對即時交易建議'}</button><button class="secondary-btn" type="button" data-pullback-compare="${esc(row.symbol)}" ${snapshot.loading||snapshot.comparing||historical?'disabled':''}>${snapshot.comparing&&snapshot.comparingSymbol===row.symbol?'正在比較…':`比較 ${esc(row.symbol)} 三策略 · 90 天`}</button></div>`;
 const category=row=>historical?'historical':coinCategory(row,now);
 const filters=[['all','全部'],['plan','有研究計畫'],['wait','等待條件'],['issue','資料／衝突／過期']];
 const matches=(row,key)=>key==='all'||(key==='issue'?['blocked','conflict','expired'].includes(category(row)):category(row)===key);
 const active=filters.some(([k])=>k===snapshot.analysisFilter)?snapshot.analysisFilter:'all';
 const visible=historical?rows:rows.filter(r=>matches(r,active));
 return `<div class="coin-overview"><strong>${historical?`歷史分析 ${rows.length} 檔 · 不提供目前進場判斷`:`本次 ${rows.length} 檔 · ${rows.filter(r=>category(r)==='plan').length} 檔有研究計畫`}</strong><p>${historical?'保留當時市場強度與策略條件，不代表目前排名；請重新分析後再執行比較。':'保留市場強度順序；排名與分數不是勝率。篩選只改變卡片顯示，90 天批次比較仍使用本次全部幣種。'}</p></div>
 ${historical?'':`<div class="coin-filters" role="group" aria-label="幣種分析篩選">${filters.map(([k,label])=>`<button type="button" class="secondary-btn" data-coin-filter="${k}" aria-pressed="${k===active}">${label} ${rows.filter(r=>matches(r,k)).length}</button>`).join('')}</div>`}
 <div class="cards-grid coin-analysis-grid">${visible.map(row=>{
  const a=row.analysis,categoryKey=category(row),expired=categoryKey==='expired';
  if(!a){const stale=historical||row.expiresAt&&row.expiresAt<=now;return `<article class="detail-card"><strong>${esc(row.symbol)}</strong><p>${stale?'已過期，請重新分析':esc(row.reason||'請重新分析以取得三策略條件')}</p>${!stale&&row.status==='SETUP'?renderPlan(row,{research:true}):''}${market(row)}${compare(row)}</article>`;}
  return `<article class="detail-card coin-analysis-card" aria-label="${esc(row.symbol)} 幣種分析">
  <div class="strategy-card-head"><strong>${row.rank?`第 ${row.rank} 名 · `:''}${esc(row.symbol)}</strong><span class="signal-badge">${labels[categoryKey]}</span></div>
  <p>市場強度 ${n(row.strength,1)}／100 · 24 小時 ${Number.isFinite(row.change)&&row.change>=0?'+':''}${n(row.change)}% · 成交額 ${Number.isFinite(row.volume)?`${(row.volume/1e6).toFixed(1)} 百萬 USDT`:'—'}</p>
  ${a.status!=='VALID'?`<p role="status">${esc(a.reason)}</p>`:`
  <p class="coin-reading">${historical?'歷史收盤條件，僅供回顧；舊進場點位未保存。':expired?'此分析已過期，舊點位已隱藏。':categoryKey==='conflict'?'不同策略給出相反方向，暫不列入有研究計畫。':a.aligned?`1 小時與 4 小時同向${direction(a.hourlyDirection)}；仍需逐項確認進場條件。`:'多週期方向尚未一致；各策略依自己的條件獨立判斷。'}</p>
  <details class="core-disclosure" data-search="facts-${esc(row.symbol)}"><summary>方向、量能與波動數據</summary><dl class="coin-facts"><div><dt>1 小時方向</dt><dd>${direction(a.hourlyDirection)}</dd></div><div><dt>4 小時方向</dt><dd>${direction(a.fourHourlyDirection)}</dd></div><div><dt>收盤棒相對量能</dt><dd>${n(a.volumeRatio)} 倍</dd></div><div><dt>1 小時平均波幅／收盤價</dt><dd>${n(a.atrPct)}%</dd></div><div><dt>收盤離 20 期均線</dt><dd>${n(a.emaDistanceAtr)} 倍波幅</dd></div><div><dt>完整收盤資料</dt><dd>${historical?'當時已檢查':'已檢查'}</dd></div></dl></details>
  <div class="coin-strategy-list">${a.strategies.map(p=>{
   const ready=p.status==='SETUP'&&!expired&&!historical,conflict=categoryKey==='conflict';
   const risk=ready&&!conflict?researchRiskScenario(p):null;
   const state=expired?'需重新分析':p.status==='SETUP'?`研究條件成立 · ${direction(p.side)}`:p.status==='SKIP'?'風報空間不足':p.status==='BLOCKED'?'資料異常':'等待條件';
   return `<details class="coin-strategy-detail" data-search="coin-${esc(row.symbol)}-${esc(p.key)}"><summary><strong>${names[p.key]||'研究策略'}</strong><span>${historical?'當時：':''}${state}${risk?` · 目標淨風報 ${risk.netRewardRisk.toFixed(2)}`:''}</span>${!expired&&!historical&&p.status!=='SETUP'&&p.reason?`<span class="condition-reason">${esc(p.reason)}</span>`:''}</summary><p>${esc(p.reason||(p.status==='SETUP'?historical?'當時研究條件成立，僅供回顧':'已符合收盤條件，等待下一根突破門檻；尚未確認成交':'等待研究條件'))}</p>${ready&&!conflict?`${renderPlan(p,{research:true})}<p class="strategy-note">${p.key==='structured'?'第一止盈後從下一根起保護剩餘部位。':'近 5 根極值止損；分批出場各 50%，不自動移動止損。'}</p>`:''}${conflict?'<p>方向衝突，點位暫時隱藏。</p>':''}</details>`;
  }).join('')}</div><p class="strategy-note">${historical?'當時':''}收盤時間 ${date(a.closedAt)} · ${historical?'原計畫':''}有效至 ${date(a.validUntil)}。${historical?'歷史紀錄僅供回顧，不沿用舊點位。':'本根盤中是否已觸及門檻未追蹤；這是收盤快照研究，非可直接下單的即時訊號。'}單邊手續費 0.05%＋滑價 0.02%，未含資金費率。</p>`}
  ${market(row)}${compare(row)}
  </article>`;
 }).join('')||'<p class="empty-state">目前沒有符合此篩選的幣種。</p>'}</div>`;
}

export function coinHistoryPanel(snapshot){
 const runs=snapshot.analysisHistory||[];
 return `<section class="coin-overview" aria-label="幣種分析紀錄"><strong>幣種分析紀錄 · ${runs.length} 次</strong>
 ${runs.length?`<label>選擇分析時間<select data-coin-history-select aria-label="選擇分析時間" ${snapshot.loading||snapshot.comparing?'disabled':''}><option value="" disabled ${!snapshot.analysisHistoryId?'selected':''}>目前分析</option>${runs.map(r=>`<option value="${esc(r.id)}" ${r.id===snapshot.analysisHistoryId?'selected':''}>${esc(new Date(r.scannedAt).toLocaleString('zh-TW'))} · ${r.rows.length} 檔</option>`).join('')}</select></label>`:''}
 <p>${snapshot.analysisHistorical?'歷史分析（唯讀，非目前行情）；請重新分析取得最新條件。':snapshot.analysisSaved?'本次分析已保存至此瀏覽器。':'完成掃描後自動保存。'}保留最近 20 次；不跨裝置同步，清除網站資料會移除紀錄。</p>
 ${snapshot.analysisStorageError?`<p role="alert">${esc(snapshot.analysisStorageError)}</p>`:''}
</section>`;
}
