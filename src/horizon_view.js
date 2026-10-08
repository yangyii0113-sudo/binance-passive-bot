import {technicalConfirmationView} from './technical_confirmation_view.js';
import {TECH_VARIANTS} from './technical_confirmation.js';
import { marketHealth } from './market_health_view.js';
import { homeCandidates } from './home_opportunities.js';
import { rankStrongRows,rankWeakRows } from './strong_candidates.js';
import { HORIZONS,HORIZON_VERSION,HORIZON_NAMES,horizonPlanStatus } from './horizon_strategies.js';
import { HORIZON_DAYS } from './horizon_replay.js';
import { coinIdentity,coinInfo } from './coin_logo.js';
import { homePlanVisual } from './plan_price_map.js';
import { escapeHtml as esc,displayDate } from './ui.js';
const label={empty:'尚未分析',loading:'核對中',plan:'條件成立・待觸發',wait:'等待確認',blocked:'暫停判定',expired:'核對已過期',conflict:'方向衝突'};
const icon={plan:'◎',wait:'◷',empty:'◷',loading:'↻',blocked:'⚠',expired:'⚠',conflict:'⚠'};
const number=n=>Number.isFinite(n)?n.toFixed(2):'—';
export function horizonCandidateSelection(state,now=Date.now()){
 // Keep the shared freshness/contract gate; the legacy research pool remains unchanged.
 const selection=homeCandidates(state.market,now);
 const mode=state.ui?.horizonPool==='down'?'down':'up';
 const rows=selection.reason?[]:(mode==='down'?rankWeakRows:rankStrongRows)(state.market?.universeRows||state.market?.rows||[]).slice(0,5);
 const symbol=state.ui?.horizonSymbol||rows[0]?.symbol||'';
 return {rows,mode,reason:selection.reason,symbol,eligible:rows.some(row=>row.symbol===symbol)};
}
function selectedPeriod(state){return HORIZONS[state.ui?.horizon]?state.ui.horizon:'week';}
function periodStatus(state,horizon,symbol,now){
 const r=state.agents?.horizonPlans?.[`${horizon}:${symbol}`];
 if(r&&(r.symbol!==symbol||r.horizon!==horizon))return {key:'blocked',reason:'研究幣種或週期身分不符，請重新核對。',plans:[]};
 return horizonPlanStatus(r,now);
}
export function horizonSelectionControls(state,now=Date.now()){
 const selection=horizonCandidateSelection(state,now),{symbol}=selection,busy=state.agents?.horizonBusy||state.ui?.horizonBatch;
 const health=marketHealth(state.market,now),error=state.market?.error?.message||(typeof state.market?.error==='string'?state.market.error:'');
 const note=selection.reason?`${health.reason}。${error||selection.reason}`:!selection.rows.length?`本輪沒有符合條件的${selection.mode==='down'?'下跌':'上漲'}幣，不以其他候選補足名額。`:symbol&&!selection.eligible?`${symbol} 不在本次候選前 5 強，請重新選幣；既有研究仍保留。`:'';
 return `<label class="horizon-pool-label">研究方向<select data-horizon-pool aria-label="研究方向" ${busy?'disabled':''}><option value="up" ${selection.mode==='up'?'selected':''}>上漲前 5 · 尋找多頭或轉弱</option><option value="down" ${selection.mode==='down'?'selected':''}>下跌前 5 · 尋找空頭或反轉</option></select></label><form id="horizon-analysis-form" class="horizon-input"><label>1. 選幣 · ${selection.mode==='down'?'下跌':'上漲動能'}前 5 強<select name="symbol" id="horizon-symbol" data-horizon-symbol aria-label="${selection.mode==='down'?'下跌':'上漲動能'}前 5 強" aria-describedby="horizon-selection-basis" ${busy||!selection.rows.length?'disabled':''}><option value="" ${!selection.eligible?'selected':''} disabled>${selection.rows.length?'請選擇前 5 強':'等待有效名單'}</option>${selection.rows.map(row=>`<option value="${esc(row.symbol)}" ${row.symbol===symbol?'selected':''}>#${row.rank} ${esc(coinInfo(row.symbol).ticker)} · ${row.change>0?'+':''}${row.change.toFixed(2)}%</option>`).join('')}</select></label><button type="button" class="secondary-btn" data-horizon-refresh aria-label="更新前 5 強選單" title="更新選單" ${state.ui?.horizonRefreshing||busy?'disabled':''}>${state.ui?.horizonRefreshing?'篩選中…':'更新'}</button></form><p class="horizon-selection-basis" id="horizon-selection-basis">${selection.reason?'名單待更新':`本輪 ${selection.rows.length} 檔`} · 選單顯示 24h 漲跌幅，${selection.mode==='down'?'按跌幅排序':'按動能分排序'}。<br>先選幣，再核對進場；排名不是買入或做空訊號。</p>${note?`<p class="horizon-selection-note" data-market-health="${health.key}" role="status">${esc(note)}</p>`:''}`;
}
export function horizonNav(state,{now=Date.now()}={}){
 const active=selectedPeriod(state),{symbol}=horizonCandidateSelection(state,now);
 const brief={empty:'尚未分析',loading:'核對中',plan:'待觸發',wait:'等待確認',blocked:'暫停',expired:'已過期',conflict:'方向衝突'};
 return `<nav class="horizon-nav" aria-label="日週月策略">${Object.entries(HORIZONS).map(([id,c])=>{const status=periodStatus(state,id,symbol,now);return `<button type="button" data-horizon="${id}" aria-pressed="${id===active}" ${state.ui?.horizonBatch||state.agents?.horizonBusy?'disabled':''}><strong>${c.label}</strong><span class="period-state ${status.key}">${icon[status.key]} ${brief[status.key]}</span></button>`;}).join('')}</nav>`;
}
export function horizonOpportunities(state,now=Date.now()){
 return horizonPanel(state,now,{home:true});
}
export function horizonComparisonView(comparison){
 if(!comparison)return '<p>尚未回測此週期；不以其他週期的績效替代。</p>';
 if(comparison.status==='LOADING')return '<p role="status">正在核對完整永續歷史並回測；缺漏不以現貨補足。</p>';
 if(comparison.status==='ERROR')return `<p role="alert">回測未完成：${esc(comparison.reason)}</p>`;
 const r=comparison.result;if(!r)return '';
 return `<p>歷史研究 · ${displayDate(r.start)} 至 ${displayDate(r.end)} · ${esc(r.source)} · ${esc(r.version)}</p><div class="comparison-scroll"><table><thead><tr><th>策略／分段</th><th>結案</th><th>確認缺資料</th><th>確認未通過</th><th>淨損益 USDT</th><th>平均淨 R</th><th>PF</th><th>結案回撤 %</th><th>未完結</th></tr></thead><tbody>${[...r.rows,...(r.technicalRows||[])].flatMap(row=>[['development','前 70%'],['holdout','後 30% 留出'],['stress','留出・雙倍成本']].map(([key,name])=>{const s=row[key];return `<tr><th>${HORIZON_NAMES[row.key]}${row.variant?'＋'+(TECH_VARIANTS[row.variant]||esc(row.variant)):''}／${name}</th><td>${s.trades}</td><td>${s.confirmationMissing||0}</td><td>${s.confirmationRejected||0}</td><td>${number(s.netPnl)}</td><td>${number(s.averageNetR)}</td><td>${number(s.profitFactor)}</td><td>${number(s.closedDrawdownPct)}</td><td>${s.incomplete}</td></tr>`;})).join('')}</tbody></table></div><p>指標確認列為獨立研究對照，沿用原策略點位與出場；每次只加一項確認，不自動升級為主策略。缺少暖機或錨點另計，不當成通過。選定今日候選後回測，存在選幣偏差，不能代表全市場選幣績效。</p><p>各組獨立起始 1,000 USDT，單筆風險預算 0.25%；結案回撤不包含持倉浮虧。分段邊界未結案另列，不強制補算；不是滾動樣本外驗證。K 棒觸價不能視為即時可成交。</p><p>未含資金費率、深度與數量精度，月級成本尤其未完整；少量樣本與正收益都不能證明可持續盈利。</p>`;
}
export function horizonPanel(state,now=Date.now(),{home=false}={}){
 const selection=horizonCandidateSelection(state,now),{symbol}=selection;
 const horizon=selectedPeriod(state),c=HORIZONS[horizon],key=`${horizon}:${symbol}`;
 const r=state.agents?.horizonPlans?.[key],status=periodStatus(state,horizon,symbol,now),comparison=state.agents?.horizonComparisons?.[key],busy=state.agents?.horizonBusy,compareBusy=state.agents?.horizonCompareBusy;
 const disabled=busy||state.ui?.horizonBatch||!selection.eligible;
 const matching=(state.forward?.book?.rows||[]).filter(x=>x.horizon===horizon&&x.symbol===symbol);
 const tracking=matching.findLast(x=>['PENDING','OPEN','PARTIAL'].includes(x.status))||matching.at(-1);
 const trackLabel={PENDING:'正在等待觸發',OPEN:'模擬持倉中',PARTIAL:'第一止盈已完成',CLOSED:'已結案',GAP:'資料中斷・待覆核',EXPIRED:'觀察到期，需重新核對',NOT_TRACKED:'未建立觀察',CANCELLED:'觀察已取消',NO_SETUP:'無可追蹤計畫'};
 const periodAlerts=Object.keys(HORIZONS).filter(id=>id!==horizon).map(id=>({id,status:periodStatus(state,id,symbol,now)})).filter(x=>['blocked','expired','conflict'].includes(x.status.key));
 const planView=p=>`<section class="horizon-plan"><h3>${HORIZON_NAMES[p.key]} · ${p.side==='LONG'?'↗ 做多':'↘ 做空'}</h3>${homePlanVisual(p,r.snapshot.price)}<p class="action-expiry">有效至 ${displayDate(Math.min(p.expiresAt,r.snapshotUntil,r.contractVerifiedAt+60000))}；到期須重新核對。</p><details class="core-disclosure"><summary>出場與取消規則</summary><p>兩段止盈各 50%；${p.key==='structured'?`第一止盈後，下一根 ${c.trigger} 棒啟用成本保護。`:'原止損保持不變。'}${horizon==='day'?'UTC 日界（台灣 08:00）後首筆連續行情退出。':`最長持有 ${horizon==='week'?'10 天':'8 週'}，到期後首筆連續行情退出。`}不放寬止損，不將虧損交易改成較長週期。</p><p>過期、資料中斷、方向衝突或先觸及失效止損時，停止新進場判定；不補算已錯過的觸發。</p></details></section>`;
 return `<section class="horizon-workspace ${home?'panel horizon-opportunities':''}" aria-label="${home?'策略機會總覽':'日週月策略研究'}"><div class="horizon-heading">${home?'<h1>策略機會</h1>':'<h2>策略機會</h2>'}<span>僅模擬 · 實盤鎖定</span></div><p class="opportunities-intro">前 5 強選幣 → 日／週／月 → 看進退場</p>
 ${horizonSelectionControls(state,now)}
 <article class="horizon-card" data-horizon-card="${horizon}">${symbol?coinIdentity(symbol):'<h3>先更新並選擇候選幣</h3>'}<p class="horizon-step">2. 選策略週期</p>${horizonNav(state,{now})}
 <div class="horizon-verdict ${status.key}" role="status"><strong>${icon[status.key]} ${label[status.key]}</strong><p>${esc(status.reason)}</p></div>
 <p class="horizon-time">${c.label} · ${c.holding}</p>
 ${status.plans.length?planView(status.plans[0]):''}
 ${status.plans.length>1?`<details class="core-disclosure"><summary>其他有效策略 ${status.plans.length-1} 個 · 獨立比較</summary>${status.plans.slice(1).map(planView).join('')}</details>`:''}
 <div class="horizon-next"><strong>下一步</strong><p>${status.key==='plan'?'核對後觀察新觸發；條件成立仍未成交。':status.key==='wait'?'等待上述條件出現，再於新收盤後核對。':'分析此週期；通過核對後才顯示進退場點位。'}</p><button type="submit" form="horizon-analysis-form" class="primary-inline-btn" data-horizon-analyze ${disabled?'disabled':''}>${busy||state.ui?.horizonBatch?'核對中…':r?'重新核對此週期':`分析${c.label}`}</button>${status.key==='plan'&&!state.forward?.enabled?'<button type="button" class="secondary-btn" data-forward-start>啟動本機前向追蹤</button>':''}${tracking?`<p>本機觀察：${esc(trackLabel[tracking.status]||tracking.status)} · ${esc(tracking.reason)}${['PENDING','OPEN','PARTIAL'].includes(tracking.status)&&!state.forward?.enabled?' · 本頁未追蹤，不能視為持續監控。':''}</p><a href="#/advice-results">查看追蹤紀錄</a>`:''}</div>
 </article>
 ${periodAlerts.length?`<div class="period-alerts" role="status">${periodAlerts.map(({id,status})=>`<p>${HORIZONS[id].label}：${esc(status.reason)}</p>`).join('')}</div>`:''}
 <p class="horizon-lock">PAPER_ONLY · REAL_ORDER_LOCK · No Backfill<br>僅前景追蹤；背景、關閉或斷線即停止，不回補。條件成立 ≠ 觸發 ≠ 成交。</p>
 <details class="core-disclosure" data-search="horizon-selection-rules"><summary>前 5 強怎麼選？</summary><p>下跌名單：24h 漲跌幅介於 -30% 與 0% 之間、成交額至少 1,000 萬 USDT；按跌幅由大至小、成交額及交易對取最多 5 檔。上漲與下跌只是候選入口，最終方向由三週期收盤分析決定。</p><p>從本輪已核對 USDT 永續合約的行情池中，保留 24h 漲幅大於 0%、小於 30%，且 24h 成交額至少 1,000 萬 USDT 的幣種。依既有動能分由高至低取前 5；同分依成交額，再依交易對排序。不足 5 檔不補入下跌幣或低流動性幣。</p><p>動能分結合漲幅與成交額順位，只是研究排序，不是勝率或盈利預測。名單依行情快照更新；進場仍須通過各週期的資料、方向、時效與成本核對。完整候選與已完成研究保留在下方研究區。</p></details>
 <details class="core-disclosure" data-search="horizon-evidence-${horizon}"><summary>技術指標、三週期比較與研究規則</summary><button type="button" class="secondary-btn" data-horizon-analyze-all ${disabled?'disabled':''}>一次分析日／週／月</button><p>${c.regime} 環境 → ${c.context} 趨勢 → ${c.trigger} 收盤觸發 · ${HORIZON_VERSION}。動能與流動性只用來篩選候選，不是勝率或盈利預測。</p><p>環境 ${esc(r?.evidence?.regime||'待核對')}／趨勢 ${esc(r?.evidence?.context||'待核對')}；20／50 期 EMA 同向且 20 期斜率同向。原策略均線固定使用最近 60 根完整收盤棒起算；即時與歷史採相同窗口。</p><p>突破：前 20 根區間＋1.5 倍均量；回調：觸及 EMA20 後同向實體收回，延伸不超過 1 ATR。ATR 使用 14 期 TR 算術平均。進場偏移 0.1 ATR；近 5 根結構止損外留 0.2 ATR；目標為 1R、2R，再核對成本後空間。門檻尚待樣本外驗證。</p>${['plan','wait'].includes(status.key)&&r?.symbol===symbol&&r?.horizon===horizon?technicalConfirmationView(r?.evidence?.technical):'<p>技術確認暫不顯示；請先取得有效且身分一致的最新分析。</p>'}<p>同幣多策略與跨週期結果分開研究；前向只保留一個同幣活躍觀察，不重複累加部位。含週期研究時總活躍觀察最多 6 筆，每筆風險預算 0.25%，不代表正式帳戶風險核准。</p></details>
 <details class="core-disclosure" data-search="horizon-comparison-${horizon}"><summary>此週期回測與績效 · ${HORIZON_DAYS[horizon]} 天</summary><button type="button" class="secondary-btn" data-horizon-compare ${compareBusy||!selection.eligible?'disabled':''}>${compareBusy?'回測中…':'執行獨立歷史比較'}</button><button type="button" class="secondary-btn" data-horizon-export ${comparison?.result?'':'disabled'}>匯出此週期結果</button>${horizonComparisonView(comparison)}</details>
 ${comparison?.status==='ERROR'?`<p role="alert">${esc(comparison.reason)}</p>`:''}
 </section>`;
}
