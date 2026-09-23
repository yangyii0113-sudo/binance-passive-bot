import { coinCategory } from './coin_analysis.js';
import { escapeHtml as esc } from './ui.js';
const names={structured:'趨勢回調 · 結構止盈',breakout:'區間突破',meanReversion:'均值回歸'};
const direction=v=>({LONG:'偏多',SHORT:'偏空',MIXED:'方向未一致'})[v]||'—';
const n=(v,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(d):'—';
const date=v=>Number.isFinite(v)?new Date(v).toLocaleString('zh-TW',{hour12:false}):'—';
const labels={plan:'有研究計畫 · 等待突破',wait:'等待條件',conflict:'策略方向衝突 · 先觀察',blocked:'資料不足／異常',expired:'已過期，請重新分析'};
export function coinAnalysisCards(snapshot,now,renderPlan){
 const rows=snapshot.rows||[];
 if(!rows.length)return '<div class="empty-state"><strong>尚未分析幣種條件</strong><span>按上方按鈕讀取完整合約 K 線；未成立時不產生點位。</span></div>';
 const category=row=>coinCategory(row,now);
 const filters=[['all','全部'],['plan','有研究計畫'],['wait','等待條件'],['issue','資料／衝突／過期']];
 const matches=(row,key)=>key==='all'||(key==='issue'?['blocked','conflict','expired'].includes(category(row)):category(row)===key);
 const active=filters.some(([k])=>k===snapshot.analysisFilter)?snapshot.analysisFilter:'all';
 const visible=rows.filter(r=>matches(r,active));
 return `<div class="coin-overview"><strong>本次 ${rows.length} 檔 · ${rows.filter(r=>category(r)==='plan').length} 檔有研究計畫</strong><p>保留市場強度順序；排名與分數不是勝率。篩選只改變卡片顯示，90 天批次比較仍使用本次全部幣種。</p></div>
 <div class="coin-filters" role="group" aria-label="幣種分析篩選">${filters.map(([k,label])=>`<button type="button" class="secondary-btn" data-coin-filter="${k}" aria-pressed="${k===active}">${label} ${rows.filter(r=>matches(r,k)).length}</button>`).join('')}</div>
 <div class="cards-grid coin-analysis-grid">${visible.map(row=>{
  const a=row.analysis,categoryKey=category(row),expired=categoryKey==='expired';
  if(!a){const stale=row.expiresAt&&row.expiresAt<=now;return `<article class="detail-card"><strong>${esc(row.symbol)}</strong><p>${stale?'已過期，請重新分析':esc(row.reason||'請重新分析以取得三策略條件')}</p>${!stale&&row.status==='SETUP'?renderPlan(row,{research:true}):''}</article>`;}
  return `<article class="detail-card coin-analysis-card" aria-label="${esc(row.symbol)} 幣種分析">
  <div class="strategy-card-head"><strong>${row.rank?`第 ${row.rank} 名 · `:''}${esc(row.symbol)}</strong><span class="signal-badge">${labels[categoryKey]}</span></div>
  <p>市場強度 ${n(row.strength,1)}／100 · 24 小時 ${Number.isFinite(row.change)&&row.change>=0?'+':''}${n(row.change)}% · 成交額 ${Number.isFinite(row.volume)?`${(row.volume/1e6).toFixed(1)} 百萬 USDT`:'—'}</p>
  ${a.status!=='VALID'?`<p role="status">${esc(a.reason)}</p>`:`
  <p class="coin-reading">${expired?'此分析已過期，舊點位已隱藏。':categoryKey==='conflict'?'不同策略給出相反方向，暫不列入有研究計畫。':a.aligned?`1 小時與 4 小時同向${direction(a.hourlyDirection)}；仍需逐項確認進場條件。`:'多週期方向尚未一致；各策略依自己的條件獨立判斷。'}</p>
  <dl class="coin-facts"><div><dt>1 小時方向</dt><dd>${direction(a.hourlyDirection)}</dd></div><div><dt>4 小時方向</dt><dd>${direction(a.fourHourlyDirection)}</dd></div><div><dt>收盤棒相對量能</dt><dd>${n(a.volumeRatio)} 倍</dd></div><div><dt>1 小時平均波幅／收盤價</dt><dd>${n(a.atrPct)}%</dd></div><div><dt>收盤離 20 期均線</dt><dd>${n(a.emaDistanceAtr)} 倍波幅</dd></div><div><dt>完整收盤資料</dt><dd>已檢查</dd></div></dl>
  <p class="strategy-note">相對量能對照前 20 根均量；波幅為 14 期平滑平均真實波幅；均線距離正值在上方、負值在下方。這些是描述性數據，不是交易勝率。</p>
  <div class="coin-strategy-list">${a.strategies.map(p=>{
   const ready=p.status==='SETUP'&&!expired,conflict=categoryKey==='conflict';
   const state=expired?'需重新分析':p.status==='SETUP'?`研究條件成立 · ${direction(p.side)}`:p.status==='SKIP'?'風報空間不足':p.status==='BLOCKED'?'資料異常':'等待條件';
   return `<details class="coin-strategy-detail" data-search="coin-${esc(row.symbol)}-${esc(p.key)}"><summary><strong>${names[p.key]||'研究策略'}</strong><span>${state}</span></summary><p>${esc(p.reason||(p.status==='SETUP'?'已符合收盤條件，等待下一根突破門檻；尚未確認成交':'等待研究條件'))}</p>${ready&&!conflict?`${renderPlan(p,{research:true})}<p class="strategy-note">${p.key==='structured'?'第一止盈後從下一根起保護剩餘部位。':'近 5 根極值止損；分批出場各 50%，不自動移動止損。'}</p>`:''}${conflict?'<p>方向衝突，點位暫時隱藏。</p>':''}</details>`;
  }).join('')}</div><p class="strategy-note">收盤時間 ${date(a.closedAt)} · 有效至 ${date(a.validUntil)}。本根盤中是否已觸及門檻未追蹤；這是收盤快照研究，非可直接下單的即時訊號。單邊手續費 0.05%＋滑價 0.02%，未含資金費率。</p>`}
  <button class="secondary-btn" type="button" data-pullback-compare="${esc(row.symbol)}" ${snapshot.loading||snapshot.comparing?'disabled':''}>比較 ${esc(row.symbol)} 三策略 · 90 天</button>
  </article>`;
 }).join('')||'<p class="empty-state">目前沒有符合此篩選的幣種。</p>'}</div>`;
}
