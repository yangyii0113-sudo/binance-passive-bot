import { rankStrongRows } from './strong_candidates.js';
import { agentPlanStatus } from './agent_trade_plan.js';
import { researchRiskScenario } from './research_risk_view.js';
import { FAMILY_NAMES } from './strategy_families.js';
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
  return {rows:rankStrongRows(market.universeRows||market.rows||[]),reason:null};
}

const labels={plan:'有有效計畫 · 未成交',empty:'尚未核對',loading:'正在核對',wait:'等待條件',expired:'已過期 · 需更新',blocked:'資料待核對',conflict:'方向衝突'};
const priority={plan:0,empty:1,expired:2,loading:3,wait:4,blocked:5,conflict:6};
export function homeOpportunities(state,now=Date.now()) {
  const selection=homeCandidates(state.market,now);
  const rows=selection.rows.map(candidate=>{
    const record=state.agents?.tradePlans?.[candidate.symbol];
    const mismatch=record && (record.symbol!==candidate.symbol||(record.row&&record.row.symbol!==candidate.symbol));
    const result=mismatch?{key:'blocked',reason:'分析標的與本幣不符，請重新核對。',plans:[]}:agentPlanStatus(record,now);
    const strategies=record?.row?.analysis?.strategies||[];
    const partial=Array.isArray(strategies)&&strategies.some(p=>p.status==='BLOCKED');
    const key=result.key==='wait'&&partial?'blocked':result.key;
    let reason=result.reason;
    if(key==='empty')reason='市場強度已排序；尚未核對三策略與進場時效。';
    if(key==='plan')reason=partial?'僅列通過核對的方案；其他策略仍有資料缺漏。':'收盤結構、當根門檻與成本後空間已核對；等待新觸發。';
    if(key==='wait'&&Array.isArray(strategies)){
      const waiting=strategies.find(p=>p.status==='SKIP')||strategies.find(p=>p.reason);
      if(waiting)reason=`${FAMILY_NAMES[waiting.key]||'策略'}：${waiting.reason||'等待條件'}`;
    }
    const ratios=result.plans.map(p=>researchRiskScenario(p)?.netRewardRisk).filter(Number.isFinite);
    return {...candidate,key,label:labels[key],reason,ratios,until:key==='plan'?Math.min(record.snapshotUntil,record.row.analysis.validUntil):null};
  });
  if(state.ui?.homeOpportunitySort==='readiness')rows.sort((a,b)=>priority[a.key]-priority[b.key]||a.rank-b.rank);
  return {...selection,rows,ready:rows.filter(r=>r.key==='plan').length,unchecked:rows.filter(r=>r.key==='empty').length};
}

export function homeOpportunityView(state,now=Date.now()) {
  const model=homeOpportunities(state,now),ui=state.ui||{},batch=ui.homeCheck||{};
  const busy=batch.running||state.agents?.technicalBusy||state.pullback?.loading||state.pullback?.comparing;
  const sort=ui.homeOpportunitySort==='readiness'?'readiness':'strength',filter=ui.homeOpportunityFilter==='plan'?'plan':'all';
  const visible=model.rows.filter(r=>filter==='all'||r.key==='plan');
  return `<section class="home-opportunities" aria-label="強勢幣與進場條件">
    <div class="research-home-actions"><button type="button" class="primary-inline-btn" data-home-check-all ${busy?'disabled':''}>${batch.running?`核對中 ${batch.completed||0}／${batch.total||0}`:'更新並核對前 10 檔'}</button><a class="secondary-btn" href="#/advice">全部交易建議</a></div>
    <p class="home-check-progress" role="status">${batch.running?'依本次開始時的名單逐檔核對，完成後可查看進退場建議。':batch.error?esc(batch.error):batch.completed?`上次核對 ${batch.completed} 檔${batch.failed?`，${batch.failed} 檔未完成`:''}；目前狀態仍依各檔時效判斷。`:'先看市場強度，再核對能否形成新的進場計畫。'}</p>
    <div class="home-ranking-controls" role="group" aria-label="首頁排序">${[['strength','市場強度排序'],['readiness','進場條件排序']].map(([key,label])=>`<button type="button" data-home-opportunity-sort="${key}" aria-pressed="${key===sort}">${label}</button>`).join('')}</div>
    <p class="home-ranking-explainer">${sort==='strength'?'依 24 小時動能與成交額排序，分數不是勝率。':'依核對狀態分組，同組維持強勢名次；不代表獲利或勝率排名。'}</p>
    <div class="home-opportunity-filters" role="group" aria-label="首頁候選篩選"><button type="button" data-home-opportunity-filter="all" aria-pressed="${filter==='all'}">全部候選 ${model.rows.length}</button><button type="button" data-home-opportunity-filter="plan" aria-pressed="${filter==='plan'}">有有效計畫 ${model.ready}</button><span>尚未核對 ${model.unchecked}</span></div>
    ${model.reason?`<p class="home-opportunity-empty" role="status">${esc(model.reason)}</p>`:!visible.length?`<div class="home-opportunity-empty" role="status"><strong>${filter==='plan'?'目前沒有通過核對的計畫':'目前沒有符合選幣條件的標的'}</strong><p>${filter==='plan'?'可查看全部候選的等待原因；不補足訊號。':'僅選擇符合漲幅與流動性條件的幣種，不補足名額。'}</p>${filter==='plan'?'<button type="button" class="secondary-btn" data-home-opportunity-filter="all">查看全部候選</button>':''}</div>`:''}
    <div class="home-opportunity-grid">${visible.map(row=>`<article class="home-opportunity-card home-opportunity-${row.key}" data-home-opportunity="${esc(row.symbol)}" aria-label="${esc(row.symbol)} 首頁候選">
      <div class="home-opportunity-heading"><h3>${esc(row.symbol)}</h3><span>強勢第 ${row.rank} 名</span></div>
      <dl class="home-opportunity-market"><div><dt>市場強度</dt><dd>${row.strength.toFixed(1)}<small>／100</small></dd></div><div><dt>24 小時</dt><dd>+${row.change.toFixed(2)}%</dd></div><div><dt>成交額</dt><dd>${(row.volume/1e6).toFixed(1)}<small> 百萬 USDT</small></dd></div></dl>
      <div class="home-entry-state" data-home-entry-state="${row.key}"><span>進場條件</span><strong>${row.label}</strong></div>
      <p class="home-entry-reason">${esc(row.reason)}</p>
      ${row.key==='plan'?`<p class="home-entry-evidence">${row.ratios.length} 個獨立方案 · 最低目標淨風報 ${Math.min(...row.ratios).toFixed(2)}<br>核對有效至 ${esc(displayDate(row.until))}</p>`:''}
      ${['plan','wait','conflict'].includes(row.key)?`<button type="button" class="${row.key==='plan'?'primary-inline-btn':'secondary-btn'}" data-agent-advice-symbol="${esc(row.symbol)}">${row.key==='plan'?'查看進退場計畫':'查看等待原因'}</button>`:`<button type="button" class="secondary-btn" data-home-check-symbol="${esc(row.symbol)}" ${busy||row.key==='loading'?'disabled':''}>${row.key==='loading'?'正在核對…':row.key==='empty'?'核對進場條件':'重新核對'}</button>`}
    </article>`).join('')}</div>
    <details class="core-disclosure" data-search="home-ranking-rules"><summary>選幣、成本與排序依據</summary><p>從已核對的加密貨幣永續合約中，選擇 24 小時漲幅大於 0%、小於 30%，成交額至少 1,000 萬 USDT 的前 10 檔；不足不補。兩種排序使用同一份候選名單。</p><p>進場狀態另核對三策略收盤條件、當根是否已觸及門檻、資料時間、方向與成本後空間。假設單邊手續費 0.05%＋滑價 0.02%，未含資金費率；成交額篩選不等於已驗證訂單簿深度。</p><p>名單隨行情更新；每檔計畫另有短期有效期限。多方案不重複累加部位，分數不是勝率。</p><button type="button" class="secondary-btn" data-home-research>完整強勢研究</button></details>
  </section>`;
}
