import { homeCandidates } from './home_opportunities.js';
import { HORIZONS,HORIZON_VERSION,HORIZON_NAMES,horizonPlanStatus } from './horizon_strategies.js';
import { HORIZON_DAYS } from './horizon_replay.js';
import { coinIdentity } from './coin_logo.js';
import { homePlanVisual } from './plan_price_map.js';
import { escapeHtml as esc,displayDate } from './ui.js';
const label={empty:'尚未分析',loading:'核對中',plan:'條件成立・待觸發',wait:'等待確認',blocked:'暫停判定',expired:'核對已過期',conflict:'方向衝突'};
const icon={plan:'◎',wait:'◷',empty:'◷',loading:'↻',blocked:'⚠',expired:'⚠',conflict:'⚠'};
const number=n=>Number.isFinite(n)?n.toFixed(2):'—';
export function horizonCandidateSelection(state,now=Date.now()){
 const selection=homeCandidates(state.market,now);
 const symbol=state.ui?.horizonSymbol||selection.rows[0]?.symbol||'';
 return {...selection,symbol,eligible:selection.rows.some(row=>row.symbol===symbol)};
}
export function horizonNav(state,{home=false}={}){const active=HORIZONS[state.ui?.horizon]?state.ui.horizon:'week';return `<nav class="horizon-nav" aria-label="日週月策略">${Object.entries(HORIZONS).map(([id,c])=>`<button type="button" data-horizon="${id}" ${home?'data-horizon-home':''} aria-pressed="${id===active}"><strong>${c.label}</strong><span>${c.holding}</span></button>`).join('')}</nav>`;}
export function horizonOpportunities(state,now=Date.now()){
 const records=Object.values(state.agents?.horizonPlans||{}).filter(Boolean);
 const priority={plan:0,wait:1,loading:2,conflict:3,blocked:4,expired:5,empty:6};
 return `<section class="panel horizon-opportunities" aria-label="策略機會總覽"><div class="opportunities-heading"><div><span class="research-eyebrow">日／週／月</span><h1>策略機會</h1></div><a class="primary-inline-btn" href="#/advice">查看交易建議 →</a></div><p class="opportunities-intro">先選持有週期，再核對幣種與進退場。有效計畫優先；條件成立仍須等待觸發。</p><div class="opportunities-grid">${Object.entries(HORIZONS).map(([horizon,c])=>{
  const rows=records.filter(r=>r.horizon===horizon).map(r=>({r,status:horizonPlanStatus(r,now)})).sort((a,b)=>priority[a.status.key]-priority[b.status.key]||(b.r.checkedAt||0)-(a.r.checkedAt||0));
  const lead=rows[0],status=lead?.status||horizonPlanStatus(null,now),ready=rows.filter(x=>x.status.key==='plan').length;
  const symbol=lead?.r.symbol||horizonCandidateSelection(state,now).symbol;
  return `<article class="opportunity-cycle ${status.key}"><div class="opportunity-cycle-title"><h2>${c.label}</h2><span>${c.holding}</span></div>${lead?coinIdentity(symbol):'<p class="opportunity-unchecked">選擇幣種，取得本次策略判定</p>'}<strong class="opportunity-status">${icon[status.key]} ${label[status.key]}</strong>${ready?`<span class="opportunity-count">${ready} 檔有效計畫</span>`:''}<p class="opportunity-reason">${esc(status.reason)}</p>${status.plans.length?`<p class="opportunity-direction">${status.plans.map(p=>`${HORIZON_NAMES[p.key]} · ${p.side==='LONG'?'↗ 做多':'↘ 做空'}`).join('／')}</p>`:''}<button type="button" class="primary-inline-btn" data-horizon="${horizon}" data-horizon-home data-horizon-target="${esc(symbol)}">${ready?'查看點位與下一步':'前往核對'} →</button></article>`;
 }).join('')}</div><p class="opportunities-note">僅顯示本次已核對紀錄，未分析不代表沒有機會。PAPER_ONLY · REAL_ORDER_LOCK · No Backfill</p></section>`;
}
export function horizonComparisonView(comparison){
 if(!comparison)return '<p>尚未回測此週期；不以其他週期的績效替代。</p>';
 if(comparison.status==='LOADING')return '<p role="status">正在核對完整永續歷史並回測；缺漏不以現貨補足。</p>';
 if(comparison.status==='ERROR')return `<p role="alert">回測未完成：${esc(comparison.reason)}</p>`;
 const r=comparison.result;if(!r)return '';
 return `<p>歷史研究 · ${displayDate(r.start)} 至 ${displayDate(r.end)} · ${esc(r.source)} · ${esc(r.version)}</p><div class="comparison-scroll"><table><thead><tr><th>策略／分段</th><th>結案</th><th>淨損益 USDT</th><th>平均淨 R</th><th>PF</th><th>結案回撤 %</th><th>未完結</th></tr></thead><tbody>${r.rows.flatMap(row=>[['development','前 70%'],['holdout','後 30% 留出'],['stress','留出・雙倍成本']].map(([key,name])=>{const s=row[key];return `<tr><th>${HORIZON_NAMES[row.key]}／${name}</th><td>${s.trades}</td><td>${number(s.netPnl)}</td><td>${number(s.averageNetR)}</td><td>${number(s.profitFactor)}</td><td>${number(s.closedDrawdownPct)}</td><td>${s.incomplete}</td></tr>`;})).join('')}</tbody></table></div><p>各組獨立起始 1,000 USDT，單筆風險預算 0.25%；結案回撤不包含持倉浮虧。分段邊界未結案另列，不強制補算；不是滾動樣本外驗證。K 棒觸價不能視為即時可成交。</p><p>未含資金費率、深度與數量精度，月級成本尤其未完整；少量樣本與正收益都不能證明可持續盈利。</p>`;
}
export function horizonPanel(state,now=Date.now()){
 const selection=horizonCandidateSelection(state,now),{symbol}=selection;
 const horizon=HORIZONS[state.ui?.horizon]?state.ui.horizon:'week',c=HORIZONS[horizon],key=`${horizon}:${symbol}`;
 const r=state.agents?.horizonPlans?.[key],status=horizonPlanStatus(r,now),comparison=state.agents?.horizonComparisons?.[key],busy=state.agents?.horizonBusy,compareBusy=state.agents?.horizonCompareBusy;
 const disabled=busy||!selection.eligible,refreshing=state.ui?.horizonRefreshing;
 const matching=(state.forward?.book?.rows||[]).filter(x=>x.horizon===horizon&&x.symbol===symbol);
 const tracking=matching.findLast(x=>['PENDING','OPEN','PARTIAL'].includes(x.status))||matching.at(-1);
 const trackLabel={PENDING:'正在等待觸發',OPEN:'模擬持倉中',PARTIAL:'第一止盈已完成',CLOSED:'已結案',GAP:'資料中斷・待覆核',EXPIRED:'觀察到期，需重新核對',NOT_TRACKED:'未建立觀察',CANCELLED:'觀察已取消',NO_SETUP:'無可追蹤計畫'};
 return `<section class="horizon-workspace" aria-label="日週月策略研究"><div class="horizon-heading"><h2>策略機會 · 核對進退場</h2><span>獨立研究版 · ${HORIZON_VERSION}</span></div>${horizonNav(state)}
 <form id="horizon-analysis-form" class="horizon-input"><label>已篩選強勢幣 · ${selection.rows.length} 檔<select name="symbol" id="horizon-symbol" data-horizon-symbol aria-label="已篩選強勢幣" ${!selection.rows.length?'disabled':''}><option value="" ${!selection.eligible?'selected':''} disabled>${selection.rows.length?'請選擇本次候選幣':'候選名單待更新'}</option>${selection.rows.map(row=>`<option value="${esc(row.symbol)}" ${row.symbol===symbol?'selected':''}>${row.rank}. ${esc(row.symbol)} · ${row.change>0?'+':''}${row.change.toFixed(2)}%</option>`).join('')}</select></label><button type="submit" class="primary-inline-btn" data-horizon-analyze ${disabled?'disabled':''}>${busy?'核對中…':`分析${c.label}`}</button><button type="button" class="secondary-btn" data-horizon-refresh ${refreshing?'disabled':''}>${refreshing?'篩選中…':'更新強勢幣選單'}</button></form>
 <p class="horizon-selection-note" role="status">${selection.reason?esc(selection.reason):!selection.rows.length?'本輪沒有符合篩選條件的候選幣。':symbol&&!selection.eligible?`${esc(symbol)} 不在本次候選，請從選單重新選幣。`:'沿用首頁動能／流動性候選，含上漲、下跌與低漲幅觀察；入選不代表可進場。選幣後按分析，再核對進退場。'}</p>
 <article class="horizon-card" data-horizon-card="${horizon}">${symbol?coinIdentity(symbol):'<h3>先更新並選擇候選幣</h3>'}<div class="horizon-verdict ${status.key}" role="status"><strong>${icon[status.key]} ${label[status.key]}</strong><p>${esc(status.reason)}</p></div>
 <p class="horizon-time">${c.label} · ${c.holding} · ${c.regime} 環境 → ${c.context} 趨勢 → ${c.trigger} 收盤觸發</p>
 ${status.plans.map(p=>`<section class="horizon-plan"><h3>${HORIZON_NAMES[p.key]} · ${p.side==='LONG'?'↗ 做多':'↘ 做空'}</h3>${homePlanVisual(p,r.snapshot.price)}<p>訊號有效至 ${displayDate(p.expiresAt)}；本次行情核對至 ${displayDate(Math.min(r.snapshotUntil,r.contractVerifiedAt+60000))}。</p><p>兩段止盈各 50%；${p.key==='structured'?`第一止盈後，下一根 ${c.trigger} 棒啟用成本保護。`:'原止損保持不變。'}${horizon==='day'?'UTC 日界（台灣 08:00）後首筆連續行情退出。':`最長持有 ${horizon==='week'?'10 天':'8 週'}，到期後首筆連續行情退出。`}不放寬止損，不將虧損交易改成較長週期。</p></section>`).join('')}
 <div class="horizon-next"><strong>下一步</strong>${!state.forward?.enabled?'<button type="button" class="secondary-btn" data-forward-start>啟動本機前向追蹤</button>':'<a class="secondary-btn" href="#/advice-results">查看本機追蹤與成效</a>'}<p>${status.key==='plan'?'保持頁面前景並啟動本機追蹤，再重新核對；只有登錄後的連續行情觸發才記錄模擬成交。':status.key==='wait'?'等待上述缺少條件出現；新的觸發週期收盤後重新核對。':'從已篩選選單選幣並分析；未通過前不提供可用點位。'}</p><p>${tracking?`本機觀察：${esc(trackLabel[tracking.status]||tracking.status)} · ${esc(tracking.reason)}`:'本週期尚無前向觀察紀錄。'}${tracking&&['PENDING','OPEN','PARTIAL'].includes(tracking.status)&&!state.forward?.enabled?' 目前本頁未追蹤，不能視為持續監控。':''}</p><button type="button" class="secondary-btn" data-horizon-analyze ${disabled?'disabled':''}>重新核對此週期</button></div>
 </article>
 <p class="horizon-lock">PAPER_ONLY · REAL_ORDER_LOCK · No Backfill<br>條件成立不等於已觸發或成交。只在頁面前景追蹤，背景／關閉／斷線即停止；週級、月級並非 24 小時背景服務。</p>
 <details class="core-disclosure" data-search="horizon-evidence-${horizon}"><summary>分析依據與固定研究規則</summary><p>環境 ${esc(r?.evidence?.regime||'待核對')}／趨勢 ${esc(r?.evidence?.context||'待核對')}；20／50 期 EMA 同向且 20 期斜率同向。每個指標固定使用最近 60 根完整收盤棒起算；即時與歷史採相同窗口。</p><p>突破：前 20 根區間＋1.5 倍均量；回調：觸及 EMA20 後同向實體收回，延伸不超過 1 ATR。ATR 使用 14 期 TR 算術平均。進場偏移 0.1 ATR；近 5 根結構止損外留 0.2 ATR；目標為 1R、2R，再核對成本後空間。門檻尚待樣本外驗證。</p><p>同幣多策略與跨週期結果分開研究；前向只保留一個同幣活躍觀察，不重複累加部位。含週期研究時總活躍觀察最多 6 筆，每筆風險預算 0.25%，不代表正式帳戶風險核准。</p></details>
 <details class="core-disclosure" data-search="horizon-comparison-${horizon}"><summary>此週期回測與績效 · ${HORIZON_DAYS[horizon]} 天</summary><button type="button" class="secondary-btn" data-horizon-compare ${compareBusy||!selection.eligible?'disabled':''}>${compareBusy?'回測中…':'執行獨立歷史比較'}</button><button type="button" class="secondary-btn" data-horizon-export ${comparison?.result?'':'disabled'}>匯出此週期結果</button>${horizonComparisonView(comparison)}</details>
 ${comparison?.status==='ERROR'?`<p role="alert">${esc(comparison.reason)}</p>`:''}
 </section>`;
}
