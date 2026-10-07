import { huntView } from './hunt_analysis.js';
import { researchPipelineView } from './research_pipeline_status.js';
import { marketHealthView } from './market_health_view.js';
import { validHomeWatchSymbol } from './home_preferences.js';
import { homePlanVisual } from './plan_price_map.js';
import { coinIdentity } from './coin_logo.js';
import { adviceMonitorView, readinessView } from './advice_monitor_view.js';
import { adviceDisplayStatus } from './advice_display_status.js';
import { strategyEvidenceView, strategyConditionSummaryView, strategyActionSummary } from './strategy_evidence_view.js';
import { planExitGuide, formatPlanPrice } from './plan_levels_view.js';
import { FAMILY_NAMES } from './strategy_families.js';
import { rankResearchRows } from './strong_candidates.js';
import { agentPlanStatus } from './agent_trade_plan.js';
import { researchRiskScenario } from './research_risk_view.js';
import { MARKET_REFRESH_MS } from './config.js';
import { escapeHtml as esc, displayDate } from './ui.js';

// A click starts one bounded research batch, never a background trading loop.
export async function runHomeChecks(symbols,{check,onProgress=()=>{}}={}) {
  if(!Array.isArray(symbols)||symbols.length>10||new Set(symbols).size!==symbols.length||
    symbols.some(s=>typeof s!=='string'||!/^[\p{L}\p{N}]+USDT$/u.test(s))||typeof check!=='function')throw new Error('首頁核對名單異常');
  const results=new Array(symbols.length);let cursor=0,completed=0,failed=0;
  async function worker(){
    while(cursor<symbols.length){
      const index=cursor++,symbol=symbols[index];
      try{results[index]={symbol,ok:true,value:await check(symbol)};}
      catch(error){failed++;results[index]={symbol,ok:false,error:String(error?.message||'核對失敗')};}
      onProgress({completed:++completed,total:symbols.length,failed});
    }
  }
  await Promise.all(Array.from({length:Math.min(2,symbols.length)},worker));
  return results;
}

export function homeCandidates(market={},now=Date.now()) {
  const at=Date.parse(market.updatedAt),contracts=Date.parse(market.contractVerifiedAt);
  if(market.status!=='LIVE'||!Number.isFinite(at)||now<at||now-at>MARKET_REFRESH_MS*3)
    return {rows:[],reason:'行情待更新，重新核對後才列出目前候選幣。'};
  if(market.cryptoOnly!==true||!Number.isFinite(contracts)||now<contracts||now-contracts>300000)
    return {rows:[],reason:'合約清單待核對，暫不顯示候選名次。'};
  return {rows:rankResearchRows(market.universeRows||market.rows||[]),reason:null};
}

const labels={plan:'✓ 條件成立・待觸發',empty:'◷ 尚未分析',loading:'◷ 正在核對',wait:'◷ 等待確認',expired:'! 已過期・重新核對',blocked:'! 暫停・資料待核對',conflict:'! 暫停・方向衝突'};
export function expiryCountdown(until,now){
  if(!Number.isFinite(until)||until<=now)return '已到期';
  const seconds=Math.ceil((until-now)/1000);
  return seconds<60?`${seconds} 秒`:`${Math.floor(seconds/60)} 分 ${seconds%60} 秒`;
}
export function planDistanceView(plan,quote){
  if(!Number.isFinite(quote)||quote<=0||!Number.isFinite(plan?.entry)||plan.entry<=0||!['LONG','SHORT'].includes(plan.side))return '';
  const remaining=(plan.side==='LONG'?plan.entry-quote:quote-plan.entry)/quote*100;
  if(remaining<=0)return '';
  return `<p class="plan-distance">核對時距進場門檻 ${remaining.toFixed(2)}% · 參考價 ${formatPlanPrice(quote)} USDT；接近門檻請重新核對時效，不能以此價追單。</p>`;
}
const priority={plan:0,wait:1,empty:2,expired:3,loading:4,blocked:5,conflict:6};
export function homeOpportunities(state,now=Date.now()) {
  const selection=homeCandidates(state.market,now);
  const rows=selection.rows.map(candidate=>{
    const record=state.agents?.tradePlans?.[candidate.symbol];
    const mismatch=record && (record.symbol!==candidate.symbol||(record.row&&record.row.symbol!==candidate.symbol));
    const result=mismatch?{key:'blocked',reason:'分析標的與本幣不符，請重新核對。',plans:[]}:agentPlanStatus(record,now);
    const strategies=record?.row?.analysis?.strategies||[];
    const partial=Array.isArray(strategies)&&strategies.some(p=>p.status==='BLOCKED');
    const key=result.key==='wait'&&partial?'blocked':result.key;
    const display=adviceDisplayStatus(record,now);
    let reason=result.reason;
    if(key==='empty')reason='24 小時動能／流動性分已排序；尚未核對三策略與進場時效。';
    if(key==='plan')reason=partial?'僅列通過核對的方案；其他策略仍有資料缺漏。':'收盤結構、當根門檻與成本後空間已核對；等待新觸發。';
    if(result.key==='wait')reason=display.reason;
    const ratios=result.plans.map(p=>researchRiskScenario(p)?.netRewardRisk).filter(Number.isFinite);
    return {...candidate,partial,hunt:mismatch||record?.historical||record?.status!=='LIVE'?'':huntView(record?.row?.analysis,now),quote:key==='plan'?record.marketSnapshot?.price:null,key,label:key==='wait'?`${labels.wait} · ${display.label}`:labels[key],reason,ratios,plans:result.plans,readiness:mismatch?'':readinessView(record,now),conditions:mismatch?'':strategyConditionSummaryView(record,{now}),actionSummary:mismatch?'':strategyActionSummary(record,{now,includeNext:false}),next:display.next,evidence:mismatch?'':strategyEvidenceView(record,{now,compact:true}),snapshotUntil:key==='plan'?record.snapshotUntil:null,barUntil:key==='plan'?record.row.analysis.validUntil:null};
  });
  if(state.ui?.homeOpportunitySort!=='strength')rows.sort((a,b)=>priority[a.key]-priority[b.key]||a.rank-b.rank);
  return {...selection,rows,ready:rows.filter(r=>r.key==='plan').length,unchecked:rows.filter(r=>r.key==='empty').length};
}

function planCard(p,row,secondary=false) {
  return `<div class="home-ready-plan"><div class="action-plan-heading">${secondary?`<strong>${esc(FAMILY_NAMES[p.key])}</strong>`:''}<small>1 小時 · 模擬未成交</small></div>${homePlanVisual(p,row.quote)}${planDistanceView(p,row.quote)}<details class="core-disclosure home-execution-guide"><summary>進場、分批止盈與取消規則</summary><p>目前僅是有效計畫，尚未成交。啟用前向模擬後，須在有效期限內以連續新行情確認觸發；更新前已觸及進場門檻不追補。</p><p>先觸及原止損、行情過期或中斷時停止進場判定；方向衝突時暫停。新核對結果須重新通過 Gate。</p><p>第一止盈 ${formatPlanPrice(p.tp1)} 出場 50%；第二止盈 ${formatPlanPrice(p.tp2)} 退出剩餘 50%。</p>${planExitGuide(p)}</details></div>`;
}
function actionCard(row,{watched,busy,now}) {
 const ready=row.key==='plan',status=row.label||labels[row.key];
 return `<article class="home-opportunity-card home-opportunity-${row.key}" data-home-opportunity="${esc(row.symbol)}" aria-label="${esc(row.symbol)} 首頁候選">
   <div class="home-opportunity-heading">${coinIdentity(row.symbol,{large:true})}<button type="button" class="home-watch-toggle" data-home-watch-symbol="${esc(row.symbol)}" aria-pressed="${watched.includes(row.symbol)}" aria-label="${watched.includes(row.symbol)?'取消關注':'關注'} ${esc(row.symbol)}">${watched.includes(row.symbol)?'★ 已關注':'☆ 關注'}</button></div>
   <div class="home-entry-state ${ready?'priority-entry':''}" data-home-entry-state="${row.key}" ${ready?'data-priority-plan="true"':''}><strong>${ready?'✓ 條件成立・待觸發':status}</strong>${ready?'<small>條件已通過 · 僅模擬，尚未成交</small>':''}</div>
   ${row.actionSummary}${ready&&row.partial?'<p class="guard-note" role="status">部分策略缺資料，該策略暫停；僅顯示已通過核對的獨立計畫。</p>':''}
   ${ready?planCard(row.plans[0],row):''}
   ${ready&&row.plans.length>1?`<details class="core-disclosure" data-search="other-plans-${esc(row.symbol)}"><summary>其他獨立策略 ${row.plans.length-1} 個 · 不累加部位</summary>${row.plans.slice(1).map(p=>planCard(p,row,true)).join('')}</details>`:''}
   ${ready?`<p class="action-expiry">行情快照剩 ${expiryCountdown(row.snapshotUntil,now)}<small>收盤策略剩 ${expiryCountdown(row.barUntil,now)}；先到者失效</small></p>`:''}
   <p class="action-next"><b>下一步</b> ${esc(ready?'重新核對後觀察新觸發；目前尚未成交。':row.key==='empty'?'先核對三策略與行情時效。':row.next)}</p>
   ${['plan','wait','conflict'].includes(row.key)?`<button type="button" class="${ready?'primary-inline-btn':'secondary-btn'}" data-agent-advice-symbol="${esc(row.symbol)}">${ready?'核對與查看完整計畫':'查看等待條件'}</button>`:`<button type="button" class="secondary-btn" data-home-check-symbol="${esc(row.symbol)}" ${busy||row.key==='loading'?'disabled':''}>${row.key==='loading'?'正在核對…':row.key==='empty'?'核對進場條件':'重新核對'}</button>`}
   ${row.hunt||''}<details class="core-disclosure action-evidence" data-search="home-evidence-${esc(row.symbol)}"><summary>查看依據與其他策略</summary><p>${esc(row.reason)}</p>${row.conditions}${row.readiness}${row.evidence}<dl class="home-opportunity-market"><div><dt>24 小時動能／流動性分</dt><dd>${row.strength.toFixed(1)}／100</dd></div><div><dt>24 小時漲跌幅</dt><dd>${row.change>0?'+':''}${row.change.toFixed(2)}%</dd></div><div><dt>成交額</dt><dd>${(row.volume/1e6).toFixed(1)} 百萬 USDT</dd></div></dl><small>候選第 ${row.rank} 位；分數不是勝率。${ready?`核對期限 ${esc(displayDate(row.snapshotUntil))}`:''}</small></details>
 </article>`;
}
export function homeOpportunityView(state,now=Date.now(),{embedded=false}={}) {
 const model=homeOpportunities(state,now),ui=state.ui||{},batch=ui.homeCheck||{};
 const busy=batch.running||state.agents?.technicalBusy||state.pullback?.loading||state.pullback?.comparing;
 const sort=ui.homeOpportunitySort==='strength'?'strength':'readiness',filter=['plan','watch'].includes(ui.homeOpportunityFilter)?ui.homeOpportunityFilter:'all';
 const watched=Array.isArray(ui.homeWatchedSymbols)?[...new Set(ui.homeWatchedSymbols.filter(validHomeWatchSymbol))].slice(0,10):[];
 const visible=model.rows.filter(r=>filter==='all'||(filter==='plan'?r.key==='plan':watched.includes(r.symbol)));
 // Valid plans always lead the focus; the existing preference orders peers.
 const ordered=[...visible.filter(r=>r.key==='plan'),...visible.filter(r=>r.key!=='plan')];
 const focus=ordered.slice(0,3),other=ordered.slice(3),options={watched,busy,now};
 return `<section class="home-opportunities action-workspace" aria-label="強勢幣與進場條件">
   ${embedded?'':marketHealthView(state.market,now)}
   ${embedded?'':researchPipelineView(state,model,now)}
   <div class="research-home-actions"><button type="button" class="primary-inline-btn" data-home-check-all ${busy?'disabled':''}>${batch.running?`核對中 ${batch.completed||0}／${batch.total||0}`:'更新並核對研究 10 檔'}</button><a class="secondary-btn" href="#/advice">全部交易建議</a></div>
   ${batch.running||batch.error||batch.completed?`<p class="home-check-progress" role="status">${batch.error?esc(batch.error):batch.running?'正在逐檔核對進場條件…':`已核對 ${batch.completed} 檔${batch.failed?`，${batch.failed} 檔未完成`:''}；依各檔時效判斷。`}</p>`:''}
   ${model.rows.length?`<div class="home-opportunity-filters" role="group" aria-label="首頁候選篩選"><button type="button" data-home-opportunity-filter="all" aria-pressed="${filter==='all'}">全部候選 ${model.rows.length}</button><button type="button" data-home-opportunity-filter="plan" aria-pressed="${filter==='plan'}">有有效計畫 ${model.ready}</button><button type="button" data-home-opportunity-filter="watch" aria-pressed="${filter==='watch'}">關注候選 ${model.rows.filter(r=>watched.includes(r.symbol)).length}</button></div>`:''}
    ${model.reason?embedded?'':`<p class="home-opportunity-empty" role="status">${esc(model.reason)}</p>`:!visible.length?`<div class="home-opportunity-empty" role="status"><strong>${filter==='plan'?'目前沒有通過核對的計畫':filter==='watch'?'目前關注的幣種不在研究候選 10 檔':'目前沒有符合選幣條件的標的'}</strong><p>${filter==='plan'?'可查看全部候選的等待原因；不補足訊號。':filter==='watch'?'關注只影響顯示，不增加候選或放寬進場條件。':'僅選擇符合漲幅與流動性條件的幣種，不補足名額。'}</p>${filter!=='all'?'<button type="button" class="secondary-btn" data-home-opportunity-filter="all">查看全部候選</button>':''}</div>`:''}

   ${focus.length?`<p class="guard-note">最多 10 檔研究候選：最多 4 檔保留給 24 小時漲幅 −5% 至 0% 的流動性觀察（−5% 不含），另保留最多 3 檔給 −30% 至 −5% 的下跌動能（−30% 不含）；其餘為上漲候選，不足時從合格動能候選補入。均須成交額至少 1,000 萬 USDT 與合約核對；觀察不代表蓄勢已成立。</p><h2 class="action-section-title">今日行動 <small>最多 3 檔 · 僅模擬未成交</small></h2><div class="home-opportunity-grid" data-action-focus>${focus.map(row=>actionCard(row,options)).join('')}</div><!-- action-focus-end -->`:''}
   ${other.length?`<details class="core-disclosure other-candidates" data-search="other-candidates"><summary>其餘候選 ${other.length} 檔 · 展開查看</summary><div class="home-opportunity-grid">${other.map(row=>actionCard(row,options)).join('')}</div></details>`:''}
   ${ui.homeWatchNotice?`<p class="home-watch-notice" role="status">${esc(ui.homeWatchNotice)}</p>`:''}
   ${ui.homePreferencesError?`<p class="home-watch-notice" role="alert">${esc(ui.homePreferencesError)}</p>`:''}
   ${model.rows.length?`<details class="core-disclosure" data-search="home-sort"><summary>候選排序 · ${sort==='strength'?'動能／流動性':'進場條件'}</summary><div class="home-ranking-controls" role="group" aria-label="首頁排序">${[['strength','動能／流動性排序'],['readiness','進場條件排序']].map(([key,label])=>`<button type="button" data-home-opportunity-sort="${key}" aria-pressed="${key===sort}">${label}</button>`).join('')}</div><p>有效計畫優先；其餘候選依此排序。尚未核對 ${model.unchecked} 檔；分數不是勝率。</p></details>`:''}
    <details class="core-disclosure home-watchlist" data-search="home-watchlist"><summary>管理關注清單 · ${watched.length}／10</summary>
      <p>關注與排序儲存在這個瀏覽器；重新開啟會保留，不會跨裝置同步。清除網站資料會移除設定。</p>
      ${watched.length?`<ul>${watched.map(symbol=>`<li><div><strong>${esc(symbol)}</strong><small>${model.reason?'行情待核對':model.rows.some(row=>row.symbol===symbol)?'在本輪候選':'本輪未入選'}</small></div><button type="button" class="secondary-btn" data-home-watch-symbol="${esc(symbol)}" aria-label="取消關注 ${esc(symbol)}">移除</button></li>`).join('')}</ul>`:'<p>尚未加入關注。在候選卡片點「☆ 關注」即可加入，最多 10 檔。</p>'}
      <p>「關注候選」只列出本輪前 10 檔中的關注幣；未入選的名稱仍保留在清單，不代表可進場。</p>
    </details>

   ${embedded?'':adviceMonitorView(state,now,{compact:true,sharedError:model.reason})}
    <details class="core-disclosure" data-search="home-ranking-rules"><summary>動能分計算、選幣與限制</summary><p><strong>計分公式：</strong>固定 40 分＋24 小時漲跌幅絕對值（最多計入 12%）× 3.3＋成交額排名分（0～20 分）。成交額排名以本次高流動性候選池為準，最多 40 檔；排名第一為 20 分、最後為 0 分，單一標的時為 20 分。</p><p>例如漲幅 5%、成交額排名第一，得分 76.5；不代表 76.5% 勝率。漲幅超過 12% 不再增加動能分。此分數反映已發生的動能與成交額，未納入多週期趨勢、進場觸發或訂單簿深度；高分可能已過度延伸。尚無分數對後續報酬的前向校準結果。</p><p>從已核對的加密貨幣永續合約中，選擇最多 10 檔：最多 4 檔為 −5% 至 0% 的流動性觀察（−5% 不含），另保留最多 3 檔為大於 −30%、不大於 −5% 的下跌動能，其餘為大於 0%、小於 30% 的上漲動能；不足時從合格動能候選補入；全部成交額至少 1,000 萬 USDT，不足不補。兩種排序使用同一份候選名單。</p><p>進場狀態另核對三策略收盤條件、當根是否已觸及門檻、資料時間、方向與成本後空間。假設單邊手續費 0.05%＋滑價 0.02%，未含資金費率；成交額篩選不等於已驗證訂單簿深度。</p><p>名單隨行情更新；每檔計畫另有短期有效期限。多方案不重複累加部位，分數不是勝率。</p><button type="button" class="secondary-btn" data-home-research>完整強勢研究</button></details>
 </section>`;
}

