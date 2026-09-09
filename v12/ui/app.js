(function(){
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const routeToScreen={HOME:'home',MARKETS:'markets',RESEARCH:'research',POSITIONS:'positions',RESULTS:'results',LAB:'lab',INTELLIGENCE:'intelligence'};
  const VM=window.FOXY_V12_HOME_VIEW_MODEL;
  const Renderer=window.FOXY_V12_HOME_RENDERER;
  const DOM=window.FOXY_V12_HOME_DOM;
  let route='HOME',context='ALL';

  const toast=(message)=>{const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)};

  function setRoute(next){
    if(next==='MORE'){const sheet=$('#more-sheet');sheet.hidden=!sheet.hidden;return}
    if(!routeToScreen[next])return toast('此功能在 Preview 中尚未接入。');
    route=next;$('#more-sheet').hidden=true;
    $$('[data-screen]').forEach(x=>x.classList.toggle('active',x.dataset.screen===next));
    $$('[data-route]').forEach(x=>x.classList.toggle('active',x.dataset.route===next));
    history.replaceState(null,'','#'+routeToScreen[next]);window.scrollTo({top:0,behavior:'instant'});
  }

  function setContext(next){
    context=next;
    $$('[data-context]').forEach(x=>x.classList.toggle('active',x.dataset.context===next));
    toast('市場範圍：'+next+' · Preview 僅顯示已驗證資料');
  }

  function renderHomeReadModel(readModel){
    if(!VM||!Renderer||!DOM)throw Error('HOME_RENDER_PIPELINE_REQUIRED');
    const viewModel=VM.buildHomeViewModel(readModel);
    const renderPlan=Renderer.renderHomeSections(viewModel);
    DOM.applyHomeRender(document,renderPlan);
    return true;
  }

  $$('[data-route]').forEach(b=>b.addEventListener('click',()=>setRoute(b.dataset.route)));
  $$('[data-context]').forEach(b=>b.addEventListener('click',()=>setContext(b.dataset.context)));
  $$('[data-action]').forEach(b=>b.addEventListener('click',()=>toast(b.dataset.action+' · Preview contract only')));

  const initial=Object.entries(routeToScreen).find(([,id])=>'#'+id===location.hash)?.[0]||'HOME';
  setRoute(initial);

  if(window.FOXY_V12_PREVIEW_HOME_READ_MODEL){
    try{renderHomeReadModel(window.FOXY_V12_PREVIEW_HOME_READ_MODEL)}catch(error){toast('Preview data rejected · '+error.message)}
  }

  window.FOXY_V12_PREVIEW=Object.freeze({
    setRoute,
    setContext,
    renderHomeReadModel,
    getState:()=>Object.freeze({route,context})
  });
})();
