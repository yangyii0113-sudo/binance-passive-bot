(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_HOME_DOM=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const TARGETS=Object.freeze([
    Object.freeze({selector:'#home-asof',property:'textContent',field:'asOfLabel'}),
    Object.freeze({selector:'#data-health',property:'textContent',field:'dataHealthLabel'}),
    Object.freeze({selector:'.region-grid',property:'innerHTML',field:'regionsHtml'}),
    Object.freeze({selector:'.pulse-grid',property:'innerHTML',field:'marketPulseHtml'}),
    Object.freeze({selector:'[data-home-content="early-trend"]',property:'innerHTML',field:'earlyTrendHtml'}),
    Object.freeze({selector:'.opportunity-grid',property:'innerHTML',field:'opportunitiesHtml'}),
    Object.freeze({selector:'[data-home-content="events"]',property:'innerHTML',field:'eventsHtml'})
  ]);

  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const text=value=>typeof value==='string';

  function assertRenderPlan(plan){
    if(!object(plan)||plan.schemaVersion!=='foxyya-home-render/1')throw Error('HOME_RENDER_PLAN_REQUIRED');
    if(plan.researchOnly!==true||plan.executionWrite!==false)throw Error('HOME_RENDER_READ_ONLY_REQUIRED');
    for(const target of TARGETS){
      if(!text(plan[target.field]))throw Error('HOME_RENDER_FIELD_REQUIRED:'+target.field);
    }
    return plan;
  }

  function applyHomeRender(doc,plan){
    if(!doc||typeof doc.querySelector!=='function')throw Error('DOCUMENT_REQUIRED');
    assertRenderPlan(plan);
    const resolved=TARGETS.map(target=>{
      const node=doc.querySelector(target.selector);
      if(!node)throw Error('HOME_TARGET_MISSING:'+target.selector);
      return {target,node};
    });
    for(const {target,node} of resolved)node[target.property]=plan[target.field];
    const optional=[
      ['[data-home-content="diagnostics"]','diagnosticsHtml'],
      ['[data-research-content]','opportunitiesHtml'],
      ['[data-global-content]','regionsHtml'],
      ['[data-market-content]','opportunitiesHtml'],
      ['[data-research-early]','earlyTrendHtml']
    ];
    for(const [selector,field] of optional){
      const node=doc.querySelector(selector);
      if(node&&typeof plan[field]==='string')node.innerHTML=plan[field];
    }
    return Object.freeze({ok:true,updated:Object.freeze(TARGETS.map(x=>x.selector))});
  }

  return Object.freeze({TARGETS,applyHomeRender});
});
