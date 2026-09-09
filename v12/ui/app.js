(function(){
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const routeToScreen={HOME:'home',MARKETS:'markets',RESEARCH:'research',POSITIONS:'positions',RESULTS:'results',LAB:'lab',INTELLIGENCE:'intelligence',SYSTEM:'system'};
  const markets=['ALL','CRYPTO','US','TW'];
  const VM=window.FOXY_V12_HOME_VIEW_MODEL,Renderer=window.FOXY_V12_HOME_RENDERER,DOM=window.FOXY_V12_HOME_DOM,Staging=window.FOXY_V12_STAGING_READ_CLIENT;
  let route='HOME',context='ALL',homeRequest=0,lastHomeAsOf=null,homeLoading=false,lastReadError=null;
  const toast=message=>{const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3500)};
  function closeMore(){const sheet=$('#more-sheet');if(sheet)sheet.hidden=true;$$('[data-route="MORE"]').forEach(x=>x.setAttribute('aria-expanded','false'))}
  function writeLocation(replace=false){const url='#'+routeToScreen[route]+(context==='ALL'?'':'?market='+context);if(location.hash===url)return;const method=!replace&&typeof history.pushState==='function'?'pushState':'replaceState';history[method](null,'',url)}
  function applyMarketScope(){
    $$('[data-context]').forEach(x=>{const active=x.dataset.context===context;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active))});
    $$('[data-filter-market]').forEach(x=>{x.hidden=context!=='ALL'&&x.dataset.filterMarket!==context});
    const label=$('#market-scope-label');if(label)label.textContent='研究範圍：'+({ALL:'全部市場',CRYPTO:'Crypto',US:'美股',TW:'台股'}[context])+' · 全球總覽維持完整';
  }
  function checkSnapshotAge(){
    if(lastHomeAsOf!==null&&Date.now()-lastHomeAsOf>65*60*1000){
      const health=$('#data-health');if(health)health.textContent='STAGING · STALE · SNAPSHOT';
      if(!homeLoading&&!lastReadError)showReadStatus('快照已超過 65 分鐘未更新；請按「重新讀取」並查看系統來源診斷。');
    }
  }
  function setContext(next,{historyUpdate=true}={}){if(!markets.includes(next))return;context=next;applyMarketScope();checkSnapshotAge();if(historyUpdate)writeLocation()}
  function setRoute(next,{historyUpdate=true,focus=false}={}){
    if(next==='MORE'){const sheet=$('#more-sheet');if(sheet){sheet.hidden=!sheet.hidden;$$('[data-route="MORE"]').forEach(x=>x.setAttribute('aria-expanded',String(!sheet.hidden)));if(!sheet.hidden)sheet.querySelector?.('button:not([disabled])')?.focus()}return}
    if(!routeToScreen[next])return;
    route=next;closeMore();checkSnapshotAge();
    $$('[data-screen]').forEach(x=>x.classList.toggle('active',x.dataset.screen===next));
    $$('[data-route]').forEach(x=>{const active=x.dataset.route===next;x.classList.toggle('active',active);x.setAttribute('aria-current',active?'page':'false')});
    if(historyUpdate)writeLocation();window.scrollTo({top:0,behavior:'instant'});
    if(focus)$('[data-screen="'+next+'"] h1')?.focus?.({preventScroll:true});
  }
  function readLocation(){const [hash,query='']=String(location.hash||'#home').slice(1).split('?');const next=Object.entries(routeToScreen).find(([,id])=>id===hash)?.[0]||'HOME';const match=/(?:^|&)market=(ALL|CRYPTO|US|TW)(?:&|$)/.exec(query);setContext(match?match[1]:'ALL',{historyUpdate:false});setRoute(next,{historyUpdate:false});if(!Object.values(routeToScreen).includes(hash))writeLocation(true)}
  function renderHomeReadModel(readModel){if(!VM||!Renderer||!DOM)throw Error('HOME_RENDER_PIPELINE_REQUIRED');const viewModel=VM.buildHomeViewModel(readModel);DOM.applyHomeRender(document,Renderer.renderHomeSections(viewModel));applyMarketScope();return true}
  function showReadStatus(text){const el=$('#read-status');if(el){el.textContent=text;el.hidden=!text}}
  async function loadStagingHome(){
    homeLoading=true;
    const request=++homeRequest,health=$('#data-health'),refresh=$('#refresh-research');
    if(refresh){refresh.disabled=true;refresh.textContent='讀取中…'}
    showReadStatus('正在讀取研究快照…');
    const unavailable=reason=>{lastReadError=reason;if(health)health.textContent=lastHomeAsOf===null?'STAGING · DATA UNAVAILABLE':'STAGING · STALE';showReadStatus((lastHomeAsOf===null?'研究資料暫時無法讀取':'讀取失敗，畫面保留上次快照，請勿視為最新')+' · '+reason+'。請按「重新讀取」重試。')};
    try{
      if(!Staging||typeof Staging.createHomeReadClient!=='function')throw Error('STAGING_READ_CLIENT_REQUIRED');
      const result=await Staging.createHomeReadClient().load();if(request!==homeRequest)return result;
      if(result?.status==='AVAILABLE'){
        if(lastHomeAsOf!==null&&result.data.asOf<lastHomeAsOf){unavailable('OLDER_SNAPSHOT_REJECTED');return {status:'UNAVAILABLE',data:null}}
        renderHomeReadModel(result.data);lastReadError=null;lastHomeAsOf=result.data.asOf;
        const stale=Date.now()-lastHomeAsOf>65*60*1000;
        if(health)health.textContent='STAGING · '+(stale?'STALE':result.data.providerDiagnostics?.status||'READ-ONLY')+' · SNAPSHOT';
        showReadStatus(stale?'快照已超過 65 分鐘未更新；請重新讀取並查看系統來源診斷。':'');return result;
      }
      unavailable(result?.reason||'資料尚未準備完成 / HTTP 503');return result;
    }catch(error){if(request===homeRequest)unavailable(String(error?.message||'NETWORK_FAILED'));return {status:'UNAVAILABLE',data:null}}
    finally{if(request===homeRequest)homeLoading=false;if(request===homeRequest&&refresh){refresh.disabled=false;refresh.textContent='重新讀取'}}
  }
  function handleClick(event){
    if(!event.target.closest?.('#more-sheet, [data-route="MORE"]'))closeMore();
    const button=event.target.closest?.('[data-route], [data-context], [data-action], #refresh-research');if(!button||button.disabled)return;
    if(button.id==='refresh-research'){void loadStagingHome();return}
    if(button.dataset.market)setContext(button.dataset.market,{historyUpdate:false});
    if(button.dataset.context)setContext(button.dataset.context);
    if(button.dataset.route){setRoute(button.dataset.route,{focus:true});if(button.dataset.section)$('#'+button.dataset.section)?.scrollIntoView?.({block:'start'})}
  }
  if(typeof document.addEventListener==='function'){
    document.addEventListener('click',handleClick);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMore()});
  }
  if(typeof setInterval==='function')setInterval(checkSnapshotAge,60000);
  window.addEventListener?.('hashchange',readLocation);window.addEventListener?.('popstate',readLocation);readLocation();
  if(window.FOXY_V12_PREVIEW_HOME_READ_MODEL){try{renderHomeReadModel(window.FOXY_V12_PREVIEW_HOME_READ_MODEL)}catch(error){toast('Preview data rejected · '+error.message)}}
  window.FOXY_V12_LINEAGE_EVIDENCE?.bindEvidence(document);
  if(/^\/v12-preview\/(?:index\.html)?$/.test(location.pathname||''))void loadStagingHome();
  window.FOXY_V12_PREVIEW=Object.freeze({setRoute,setContext,renderHomeReadModel,loadStagingHome,getState:()=>Object.freeze({route,context})});
})();
