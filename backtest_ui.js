/* FOXYYA Historical Backtest UI. Read-only. Never falls back to Forward runtime data. */
(function(){
 'use strict';
 const MODE='HISTORICAL BACKTEST';
 const LABEL='歷史模擬・非 Forward Performance';
 const API='/api/backtest/latest';
 const UNAVAILABLE='UNAVAILABLE';
 const state={status:'idle',payload:null,error:null,loadedAt:null};
 const H=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const finite=x=>x!=null&&Number.isFinite(Number(x));
 const N=(x,d=2)=>finite(x)?Number(x).toLocaleString('en-US',{maximumFractionDigits:d}):UNAVAILABLE;
 const pct=x=>finite(x)?N(Number(x)*100,2)+'%':UNAVAILABLE;
 const T=x=>finite(x)?new Date(Number(x)).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):UNAVAILABLE;
 const kpi=(name,value,meta='')=>`<article class="bt-kpi"><span>${H(name)}</span><b>${H(value)}</b>${meta?`<small>${H(meta)}</small>`:''}</article>`;
 const panel=(title,body)=>`<section class="bt-panel"><div class="bt-panel-head"><h3>${H(title)}</h3></div>${body}</section>`;
 const segment=(name,value)=>`<article class="bt-segment"><div><b>${H(name)}</b><span>n=${N(value?.n,0)}</span></div><strong>${H(value?.sample_status||((value?.n||0)<20?'Sample Insufficient':'Sample Adequate'))}</strong><small>勝率 ${pct(value?.win_rate)} · Expectancy ${N(value?.expectancy_r,3)} R · PF ${N(value?.profit_factor,2)}</small></article>`;

 function ensureStyle(){
  if(document.getElementById('foxyyaBacktestStyle'))return;
  const style=document.createElement('style');style.id='foxyyaBacktestStyle';style.textContent=`
   .dock.bt-seven{grid-template-columns:repeat(7,1fr);width:min(820px,calc(100% - 20px))}
   .bt-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:20px}
   .bt-head h1{margin:2px 0 6px}.bt-mode{font-size:12px;letter-spacing:.12em;color:#c79cff}.bt-label{color:#aeb8c0;font-size:13px}
   .bt-refresh{border:1px solid #34414a;background:#0d1317;color:#f5f8fa;padding:10px 15px;border-radius:10px}
   .bt-alert{border:1px solid #5b4930;background:#211b11;padding:16px;border-radius:14px;color:#f2c96d;margin:12px 0}
   .bt-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:16px}
   .bt-kpi,.bt-panel,.bt-segment{background:linear-gradient(160deg,#10171c,#080c0f);border:1px solid #202a31;border-radius:15px;padding:16px;min-width:0}
   .bt-kpi span,.bt-kpi small,.bt-segment span,.bt-segment small{display:block;color:#9aa7af;font-size:12px}.bt-kpi b{display:block;font-size:24px;margin:8px 0 4px;overflow-wrap:anywhere}
   .bt-panel{margin-bottom:16px}.bt-panel-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.bt-panel h3{font-size:16px}
   .bt-table{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.bt-line{padding:10px 0;border-top:1px solid #1d272d}.bt-line span{display:block;color:#9aa7af;font-size:11px}.bt-line b{display:block;margin-top:3px;font-size:14px;overflow-wrap:anywhere}
   .bt-segments{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.bt-segment>div{display:flex;justify-content:space-between;gap:8px}.bt-segment strong{display:block;color:#f2c96d;font-size:11px;margin:8px 0}
   .bt-funnel{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.bt-stage{border:1px solid #202a31;border-radius:12px;padding:12px;text-align:center}.bt-stage span{display:block;color:#9aa7af;font-size:10px}.bt-stage b{display:block;font-size:18px;margin-top:4px}
   .bt-note{color:#9aa7af;font-size:12px;line-height:1.65;margin-top:10px}.bt-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;overflow-wrap:anywhere}
   @media(max-width:900px){.bt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bt-funnel{grid-template-columns:repeat(3,1fr)}}
   @media(max-width:620px){.dock.bt-seven{width:calc(100% - 14px)}.bt-grid,.bt-table,.bt-segments{grid-template-columns:1fr}.bt-funnel{grid-template-columns:repeat(2,1fr)}.bt-kpi b{font-size:21px}}
  `;document.head.appendChild(style);
 }

 function ensureShell(){
  ensureStyle();
  const main=document.querySelector('.main');
  if(main&&!document.getElementById('backtest')){
   const screen=document.createElement('section');screen.className='screen';screen.id='backtest';screen.innerHTML=`<div class="bt-head"><div><div class="bt-mode">${MODE}</div><h1>歷史回測研究</h1><p class="bt-label">${LABEL}</p></div><button class="bt-refresh" id="backtestRefresh">重新讀取</button></div><div id="backtestContent"><div class="empty">尚未讀取歷史研究結果。</div></div>`;
   main.appendChild(screen);
  }
  const dock=document.querySelector('.dock');
  if(dock&&!dock.querySelector('[data-go="backtest"]')){
   dock.classList.add('bt-seven');
   const button=document.createElement('button');button.dataset.go='backtest';button.innerHTML='<b>↺</b>回測';
   const settings=dock.querySelector('[data-go="settings"]');dock.insertBefore(button,settings||null);
   button.addEventListener('click',()=>openBacktest());
  }else if(dock){dock.classList.add('bt-seven')}
  const refresh=document.getElementById('backtestRefresh');if(refresh&&!refresh.dataset.bound){refresh.dataset.bound='1';refresh.addEventListener('click',()=>load(true))}
 }

 function goBacktest(){
  if(typeof window.go==='function'){window.go('backtest');return}
  document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id==='backtest'));
  document.querySelectorAll('.dock button').forEach(x=>x.classList.toggle('active',x.dataset.go==='backtest'));
  window.scrollTo?.(0,0);
 }

 function unavailable(message='尚無可用的歷史回測報告。'){
  return `<div class="bt-alert"><b>HISTORICAL BACKTEST 尚不可用</b><p class="bt-note">${H(message)}</p><p class="bt-note">此頁不會以 Forward Paper Performance 或即時帳本資料代替歷史結果。</p></div>`;
 }

 function renderSegments(segments){
  const groups=[['策略家族',segments?.family],['方向',segments?.side],['Regime',segments?.regime],['Paper Book',segments?.book]];
  return groups.map(([title,data])=>panel(title,data&&Object.keys(data).length?`<div class="bt-segments">${Object.entries(data).map(([k,v])=>segment(k,v)).join('')}</div>`:'<div class="empty">Sample Insufficient / 尚無可分段樣本</div>')).join('');
 }

 function render(){
  ensureShell();const root=document.getElementById('backtestContent');if(!root)return;
  if(state.status==='loading'){root.innerHTML='<div class="empty">正在讀取獨立歷史研究報告…</div>';return}
  if(state.status!=='ready'||!state.payload){root.innerHTML=unavailable(state.error||undefined);return}
  const payload=state.payload,rc=payload.run_config||{},m=payload.metrics||{},r=payload.report||{},p=m.performance||{},c=m.cost_attribution||{},f=m.funnel||{},risk=m.risk||{};
  const win=finite(p.win_rate)?`${pct(p.win_rate)} · n=${N(p.win_rate_n,0)}`:UNAVAILABLE;
  const runId=rc.run_id||r.provenance?.run_id||'—';
  root.innerHTML=`
   <div class="bt-grid">
    ${kpi('完整出場交易',N(p.closed_trades,0),'Closed trades only')}
    ${kpi('勝率',win,(Number(p.win_rate_n)||0)<20?'Sample Insufficient':'Sample Adequate')}
    ${kpi('淨報酬',pct(p.net_return),'5x 主帳 Equity')}
    ${kpi('Profit Factor',N(p.profit_factor,2),'完整出場樣本')}
    ${kpi('Expectancy',finite(p.expectancy_r)?N(p.expectancy_r,3)+' R':UNAVAILABLE,'Net R')}
    ${kpi('最大回撤',pct(p.max_drawdown),'5x equity curve')}
   </div>
   ${panel('研究來源與版本',`<div class="bt-table">
    <div class="bt-line"><span>Run ID</span><b class="bt-code">${H(runId)}</b></div>
    <div class="bt-line"><span>Symbol</span><b>${H(rc.symbol||'ETHUSDT')}</b></div>
    <div class="bt-line"><span>Strategy</span><b class="bt-code">${H(rc.strategy_version||'—')}</b></div>
    <div class="bt-line"><span>Git SHA</span><b class="bt-code">${H(rc.git_sha||'—')}</b></div>
    <div class="bt-line"><span>期間</span><b>${H(rc.execution_start_taipei||T(m.start_ms))} → ${H(rc.execution_end_taipei||T(m.end_ms))}</b></div>
    <div class="bt-line"><span>Manifest SHA-256</span><b class="bt-code">${H(rc.manifest_sha256||'—')}</b></div>
   </div><p class="bt-note">${MODE} · ${LABEL} · 不納入 Forward Control 升級判斷。</p>`) }
   ${panel('成本拆解',`<div class="bt-grid">
    ${kpi('Raw Gross',N(c.gross_raw_pnl_usdt,2)+' USDT')}
    ${kpi('Slippage',N(c.slippage_usdt,2)+' USDT')}
    ${kpi('Fees',N(c.fees_usdt,2)+' USDT')}
    ${kpi('Funding',N(c.funding_usdt,2)+' USDT')}
    ${kpi('Closed Net',N(c.net_pnl_usdt,2)+' USDT')}
    ${kpi('最大預留風險',pct(risk.max_reserved_risk_fraction),'上限 1.50%')}
   </div>`) }
   ${panel('交易漏斗',`<div class="bt-funnel">
    <div class="bt-stage"><span>Eligible</span><b>${N(f.eligible,0)}</b></div>
    <div class="bt-stage"><span>Candidate</span><b>${N(f.candidate,0)}</b></div>
    <div class="bt-stage"><span>Qualified</span><b>${N(f.qualified,0)}</b></div>
    <div class="bt-stage"><span>Executable</span><b>${N(f.executable,0)}</b></div>
    <div class="bt-stage"><span>Intent</span><b>${N(f.intents,0)}</b></div>
    <div class="bt-stage"><span>Filled</span><b>${N(f.filled,0)}</b></div>
   </div><p class="bt-note">Qualified → Filled：${pct(f.qualified_to_filled)} · Avoided Loss：${H(f.avoided_loss||'UNAVAILABLE')} · Missed Opportunity：${H(f.missed_opportunity||'UNAVAILABLE')}</p>`) }
   ${renderSegments(m.segments||{})}
   ${panel('執行精度揭露',`<p class="bt-note">模型：${H(rc.execution_fidelity||r.execution_fidelity?.model||'—')}</p><p class="bt-note">intrabar path：${H(rc.intrabar_path||r.execution_fidelity?.intrabar_path||'UNAVAILABLE')}。Research Grade v1 不重建不存在的盤中 mark-price path；所有結果以合法 1H open 與 Fully Closed Bar sampling 為準。</p>`) }
  `;
 }

 async function load(force=false){
  if(state.status==='loading'&&!force)return;
  state.status='loading';state.error=null;render();
  try{
   const response=await fetch(API,{cache:'no-store',headers:{Accept:'application/json'}});
   const payload=await response.json().catch(()=>null);
   if(!response.ok||!payload||payload.status!=='OK'||payload.mode!==MODE){
    state.status='unavailable';state.payload=null;state.error=payload?.status==='UNAVAILABLE'?'尚未產生正式 ETHUSDT 歷史研究 artifact。':`歷史 API 無法使用（HTTP ${response.status}）。`;render();return;
   }
   state.status='ready';state.payload=payload;state.loadedAt=Date.now();render();
  }catch(error){state.status='unavailable';state.payload=null;state.error='歷史 API 讀取失敗：'+String(error?.message||error);render()}
 }

 function openBacktest(){ensureShell();goBacktest();render();if(state.status==='idle'||state.status==='unavailable')load()}
 function boot(){ensureShell();render()}
 window.FOXY_BACKTEST_UI=Object.freeze({open:openBacktest,load,render,mode:MODE,label:LABEL,version:'1.0.0'});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
