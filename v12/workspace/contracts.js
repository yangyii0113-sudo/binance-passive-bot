(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_WORKSPACE_CONTRACTS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const WORKSPACE_TABS=Object.freeze(['OVERVIEW','CHART','ANALYSIS','MARKET_DATA','NEWS','HISTORY']);
  const MARKETS=Object.freeze(['CRYPTO','US','TW']);
  const SECTION_STATES=Object.freeze(['AVAILABLE','UNAVAILABLE']);
  const text=x=>typeof x==='string'&&x.length>0;
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const result=errors=>({ok:errors.length===0,errors});
  function validateWorkspace(value){
    const errors=[];
    if(!value||typeof value!=='object'||Array.isArray(value))return result(['OBJECT_REQUIRED']);
    if(!MARKETS.includes(value.market))errors.push('MARKET_INVALID');
    if(!text(value.instrumentId))errors.push('INSTRUMENT_ID_REQUIRED');
    if(!Array.isArray(value.tabs)||value.tabs.length!==WORKSPACE_TABS.length||value.tabs.some((x,i)=>x!==WORKSPACE_TABS[i]))errors.push('TABS_INVALID');
    if(!value.sections||typeof value.sections!=='object'||Array.isArray(value.sections))errors.push('SECTIONS_REQUIRED');
    if(!finite(value.asOf)||value.asOf<0)errors.push('ASOF_INVALID');
    if(['US','TW'].includes(value.market)){
      if(value.researchOnly!==true)errors.push('EQUITY_RESEARCH_ONLY_REQUIRED');
      if(value.execution!=null)errors.push('EQUITY_EXECUTION_FORBIDDEN');
    }
    if(value.market==='CRYPTO'&&value.execution!=null){
      if(value.execution.paperOnly!==true)errors.push('PAPER_ONLY_REQUIRED');
      if(value.execution.realOrderLock!==true)errors.push('REAL_ORDER_LOCK_REQUIRED');
      if(value.execution.readOnly!==true)errors.push('READ_ONLY_REQUIRED');
    }
    return result(errors);
  }
  return Object.freeze({WORKSPACE_TABS,MARKETS,SECTION_STATES,validateWorkspace});
});