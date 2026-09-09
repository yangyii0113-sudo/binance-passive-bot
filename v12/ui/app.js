(function(){
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const routeToScreen={HOME:'home',MARKETS:'markets',RESEARCH:'research',POSITIONS:'positions',RESULTS:'results',LAB:'lab',INTELLIGENCE:'intelligence'};
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
  function setContext(next){context=next;$$('[data-context]').forEach(x=>x.classList.toggle('active',x.dataset.context===next));toast('市場範圍：'+next+' · Preview 尚未接行情');}
  function renderHome(){
    const model=window.FOXY_V12_HOME_MODEL.buildHomeModel({asOf:Date.now()});
    $('#home-asof').textContent=new Intl.DateTimeFormat('zh-TW',{dateStyle:'short',timeStyle:'short',hour12:false}).format(model.asOf);
    model.regions.forEach(r=>{const card=document.querySelector(`[data-region="${r.region}"]`);if(!card)return;card.querySelector('[data-field="bias"]').textContent=r.bias;card.querySelector('[data-field="confidence"]').textContent=r.status==='UNAVAILABLE'?'Confidence —':'Confidence '+Math.round(r.confidence*100)+'%'});
    model.marketPulse.forEach(p=>{const card=document.querySelector(`[data-market-pulse="${p.market}"]`);if(card)card.querySelector('[data-field="state"]').textContent=p.status==='UNAVAILABLE'?'UNAVAILABLE':(p.state||p.status)});
  }
  $$('[data-route]').forEach(b=>b.addEventListener('click',()=>setRoute(b.dataset.route)));
  $$('[data-context]').forEach(b=>b.addEventListener('click',()=>setContext(b.dataset.context)));
  $$('[data-action]').forEach(b=>b.addEventListener('click',()=>toast(b.dataset.action+' · Preview contract only')));
  const initial=Object.entries(routeToScreen).find(([,id])=>'#'+id===location.hash)?.[0]||'HOME';
  setRoute(initial);renderHome();
  window.FOXY_V12_PREVIEW=Object.freeze({setRoute,setContext,getState:()=>({route,context})});
})();
