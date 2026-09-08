/* Full platform integration. Views only; no execution or ledger-write requests. */
(function () {
 'use strict';
 const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
 const H=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const N=(x,d=4)=>Number.isFinite(x)?x.toLocaleString('en-US',{maximumFractionDigits:d}):'—';
 const T=x=>Number.isFinite(x)?new Date(x).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'—';
 const P=()=>window.FOXY_RUNTIME_BRIDGE?.getPortfolio?.();
 const empty=()=>'<div class="up-panel"><h3>正式帳本尚未取得</h3><p class="up-desc">等待模擬引擎回應。持倉與資金顯示為無資料。</p><button class="up-btn" data-runtime-refresh>重新讀取</button></div>';
 const tag=s=>'<span class="up-tag">'+H(s)+'</span>';
 const kpi=(name,value)=>'<div class="up-kpi"><span>'+H(name)+'</span><b>'+value+'</b></div>';
 const table=(heads,rows)=>'<div class="up-table-wrap"><table class="up-table"><thead><tr>'+heads.map(h=>'<th>'+H(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
 const row=cells=>'<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
 const source=p=>'<p class="up-desc">正式模擬帳本 · '+T(p.served_at)+' · '+N(p.ledger_events,0)+' 筆事件 · 唯讀</p>';
 function portfolioHTML(){
  const p=P();if(!p)return empty();
  return '<div class="up-panel"><h3>5x／8x／10x 模擬帳戶</h3>'+source(p)+table(['帳戶','已入帳餘額','權益估值','保證金占用','持倉數'],Object.entries(p.books).map(([name,b])=>row([H(name),N(b.balance)+' USDT',N(b.equity)+' USDT',N(b.margin_usage_usdt)+' USDT',N(Object.keys(b.positions).length,0)])))+'<p class="up-desc">同一筆交易沿用相同數量，槓桿只影響保證金。個別帳戶僅納入通過模型檢查的部位；權益使用帳本最後標記價，未驗證強平安全。</p></div>';
 }
 function positionsHTML(){
  const p=P();if(!p)return empty();const positions=Object.values(p.books['5x'].positions);
  return '<div class="up-panel"><h3>正式模擬持倉 · 5x 主帳</h3>'+source(p)+(positions.length?table(['幣種／策略','進場／數量','結構停損','最後標記／時間','未實現損益','計畫風險'],positions.map(t=>{const fresh=Date.now()-t.last_ms<180000;return row(['<button class="up-btn" data-runtime-symbol="'+H(t.symbol)+'">'+H(t.symbol)+'</button><br>'+H(t.family+' · '+t.side),N(t.entry_fill,8)+'<br>'+N(t.qty,8),N(t.stop,8),N(t.mark,8)+'<br>'+T(t.last_ms)+(fresh?'':'<br>標記延遲'),fresh?N((t.side==='LONG'?1:-1)*t.qty*(t.mark-t.entry_fill))+' USDT':'—',N(t.planned_risk_usdt)+' USDT'])})):'<div class="empty">目前沒有開放中的模擬持倉。</div>')+'</div>'+pendingHTML()+portfolioHTML();
 }
 function pendingHTML(){const p=P();if(!p)return empty();return '<div class="up-panel"><h3>等待合法開盤</h3>'+(p.pending.length?table(['幣種／方向','策略','預定開盤（台灣）','停損','重新驗證'],p.pending.map(t=>row([H(t.symbol+' · '+t.side),H(t.family),T(t.scheduled_open_ms),N(t.stop,8),t.overdue?tag('已逾期，待引擎處理'):t.latest_revalidation?tag('通過')+'<br>'+T(t.latest_revalidation.observed_ms):'等待驗證']))):'<div class="empty">目前沒有待成交意圖。</div>')+'<p class="up-desc">條件失效由引擎取消；不回填錯過的開盤。</p></div>'}
 function candidatesHTML(){const p=P();if(!p)return empty();return pendingHTML()+'<div class="up-panel"><div class="up-head"><h3>正式引擎候選</h3><button class="up-btn" data-runtime-refresh>更新</button></div>'+source(p)+'<p class="up-desc">最近掃描 '+T(p.latest_scan?.time_ms)+' · '+H(p.latest_scan?.regime||'UNAVAILABLE')+'。排名不代表合格或成交。</p><label class="up-label">搜尋幣種</label><input class="up-input" id="runtimeSearch" placeholder="例如 BTC、ETH"><div id="runtimeCandidates"></div></div>'}
 function renderCandidates(){const root=$('#runtimeCandidates');if(!root)return;const query=($('#runtimeSearch')?.value||'').trim().toUpperCase();const rows=(P()?.candidates||[]).filter(c=>c.symbol.toUpperCase().includes(query)).sort((a,b)=>a.rank-b.rank);root.innerHTML=rows.length?table(['幣種','方向','排名／分數','狀態','原因'],rows.map(c=>row(['<button class="up-btn" data-runtime-symbol="'+H(c.symbol)+'">'+H(c.symbol)+'</button>',H(c.side),N(c.rank,0)+' / '+N(c.score,2),H(c.status),H(c.reason||'—')]))):'<div class="empty">沒有符合的候選資料。</div>'}
 function eventHTML(){const p=P();if(!p)return empty();return '<div class="up-panel"><div class="up-head"><h3>正式模擬事件帳</h3><button class="up-btn" data-runtime-export>匯出目前快照</button></div>'+source(p)+'<p class="up-desc">顯示最近 '+p.events.length+' 筆交易生命週期事件；逐輪標記價與重複驗證已省略。資金、持倉與交易摘要均由完整帳本重建。</p>'+table(['時間','事件','幣種／部位','原因／狀態'],p.events.slice().reverse().map(e=>{const t=p.trades.find(t=>t.position_id===e.position_id);return row([T(e.observed_ms??e.time_ms??e.persisted_ms??e.decision_persist_ms??e.fill_ms),H(e.kind),H(e.symbol||t?.symbol||'—'),H(e.reason||e.status||'—')])}))+'</div>'}
 function riskHTML(){const p=P();if(!p)return empty();const b=p.books['5x'],risk=Object.values(b.positions).reduce((a,t)=>a+t.planned_risk_usdt,0);return '<div class="up-panel"><h3>正式風控狀態</h3>'+source(p)+'<div class="up-kpis">'+kpi('開放持倉計畫風險',N(risk)+' USDT')+kpi('意圖與持倉預留風險',N(p.reserved_risk_fraction*100,2)+'%')+kpi('組合風險上限','1.50%')+kpi('正式策略','30 天 Control Freeze')+'</div><p class="up-desc">A 0.50% · B 0.35% · C Starter 0.20–0.25% · D 0.35–0.50%。風險與數量由後端計算，前端無修改權限。計畫風險不是最大損失保證。</p><p class="up-desc">PAPER ONLY · REAL ORDER LOCK · Fully Closed Bar · No Backfill</p></div>'+portfolioHTML()}
 function reviewHTML(){const p=P();if(!p)return empty();return '<div class="up-panel"><h3>正式模擬交易覆盤</h3>'+source(p)+(p.trades.length?table(['幣種／策略','狀態','淨損益','已實現淨 R','MFE／MAE（取樣）','費用／Funding'],p.trades.map(t=>row([H(t.symbol+' · '+t.family+' · '+t.side),t.closed?'已結束':'持倉中',N(t.net_pnl_usdt)+' USDT',t.closed?N(t.realized_r,3):'未完結',t.mark_samples?N(t.mfe_r,3)+' / '+N(t.mae_r,3):'無資料',N(t.fees_usdt)+' / '+N(t.funding_usdt)]))):'<div class="empty">目前尚無正式模擬交易。</div>')+'<p class="up-desc">MFE／MAE 來自帳本已記錄的標記價取樣，可能漏掉兩次取樣間的極值。滑價已包含在成交價中。完整出場後才納入勝率與期望值。</p><label class="up-label">本機覆盤筆記（不修改正式帳本）</label><textarea class="up-input" id="runtimeNote" rows="4"></textarea><button class="up-btn" id="runtimeSaveNote">保存筆記</button><span id="runtimeNoteStatus" role="status"></span></div>'}
 const oldTrade=tradeSub,oldJournal=journalSub,oldGo=go;
 tradeSub=function(sub){const el=$('#tradeSubContent');if(!el)return;el.innerHTML=sub==='positions'?positionsHTML():sub==='books'?portfolioHTML():sub==='ledger'?eventHTML():sub==='risk'||sub==='intelligence'?riskHTML():candidatesHTML();renderCandidates()};
 journalSub=function(sub){if(sub==='audit'){oldJournal(sub);return}const el=$('#journalSubContent');if(!el)return;el.innerHTML=!P()?empty():sub==='lab'||sub==='performance'?portfolioHTML()+window.FOXY_V11.strategyLabHTML()+'<p class="up-desc">MFE／MAE 與 Capture 依帳本標記价取樣估計；淨 R 以進場時全成本計畫風險為分母。</p>':sub==='review'?reviewHTML():eventHTML();const note=$('#runtimeNote');if(note){try{note.value=localStorage.getItem('foxyya.runtime.review.v1')||''}catch{}$('#runtimeSaveNote').onclick=()=>{try{localStorage.setItem('foxyya.runtime.review.v1',note.value);$('#runtimeNoteStatus').textContent='已保存至這個瀏覽器'}catch{$('#runtimeNoteStatus').textContent='保存失敗，請複製筆記'}}}};
 go=function(id){oldGo(id);if(id==='settings')settings();};
 function settings(){const root=$('#upgradeSettings');if(!root)return;const p=P(),s=window.FOXY_RUNTIME_BRIDGE?.getStatus?.();root.innerHTML='<div class="up-panel"><h3>正式模擬引擎</h3><p class="up-desc">'+H(s?.strategy_version||'UNAVAILABLE')+' · '+H(s?.last_error?.message||'')+'</p><p class="up-desc">網站讀取同一服務的公開行情與模擬帳本。引擎於伺服器執行；關閉瀏覽器不會停止引擎。</p><button class="up-btn" data-runtime-refresh>重新讀取</button></div>'+riskHTML();const worker=$('#paperWorkerUrl');if(worker){worker.value=location.origin;worker.readOnly=true;const label=worker.previousElementSibling;if(label)label.textContent='正式模擬引擎';const note=worker.nextElementSibling;if(note)note.textContent='與此平台使用同一網址；不使用舊版 Worker/D1 帳本。'}const nav=all('#settings .setting').find(x=>x.textContent.includes('Forward Paper NAV'))?.querySelector('input');if(nav)nav.value=p?N(p.books['5x'].equity):'UNAVAILABLE';}
 function renderCurrent(){if($('#trade')?.classList.contains('active')){if($('#runtimeSearch')===document.activeElement)return;tradeSub($('#tradeTabs button.active')?.dataset.sub||'candidates')}if($('#journal')?.classList.contains('active')){const sub=$('#journalTabs button.active')?.dataset.sub||'trades';if(sub!=='review'&&sub!=='audit')journalSub(sub)}if($('#settings')?.classList.contains('active'))settings()}
 function bindTabs(root,fn){$(root).addEventListener('click',e=>{const b=e.target.closest('button[data-sub]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();all(root+' button').forEach(x=>x.classList.toggle('active',x===b));fn(b.dataset.sub)},true)}
 function boot(){
  // The production service has no legacy Worker/D1 login or book-switch API.
  $('#runtimeSettings')?.remove();
  bindTabs('#tradeTabs',s=>tradeSub(s));bindTabs('#journalTabs',s=>journalSub(s));
  all('.dock button').forEach(b=>b.onclick=()=>go(b.dataset.go));
  document.addEventListener('input',e=>{if(e.target.id==='runtimeSearch')renderCandidates()});
  document.addEventListener('click',e=>{
   if(e.target.closest('[data-runtime-refresh]'))window.FOXY_RUNTIME_BRIDGE.refresh();
   const symbol=e.target.closest('[data-runtime-symbol]')?.dataset.runtimeSymbol;
   if(symbol){S.selected=symbol;go('chart');loadK(symbol,'1h')}
   if(e.target.closest('[data-runtime-export]')){const p=P();if(!p)return;const url=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='FOXYYA_runtime_snapshot.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  });
  window.addEventListener('foxy:runtime-update',renderCurrent);
  window.FOXY_RUNTIME_UI=Object.freeze({render:renderCurrent,version:'11.2.1'});
  document.body.dataset.runtimeUi='full-v11.2.1';renderCurrent();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
