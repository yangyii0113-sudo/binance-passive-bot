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

  const REGIONAL_SOURCE_GATES=Object.freeze({
    JP:'JPX J-Quants API V2 的程式 adapter 已完成；目前缺 API Key 與方案 entitlement。免費方案資料有 12 週延遲，不適合作為當前市場方向；要做目前 EOD 判讀需啟用合適方案。',
    KR:'KRX Data Marketplace OPEN API 的程式 adapter 已完成；目前缺 KRX 會員／API Key 與對應資料 entitlement，取得前不展示 KOSPI 或個股市場數值。',
    CN_HK:'HKEX Data Marketplace 官方來源已確認；可用 EOD／End-of-Session 市場檔屬付費授權資料產品，需先選定授權與交付方式後才能接入，不以網頁抓取或假資料替代。'
  });

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

  function applyRegionalSourceGates(doc){
    if(!doc||typeof doc.querySelector!=='function')throw Error('DOCUMENT_REQUIRED');
    for(const [region,message] of Object.entries(REGIONAL_SOURCE_GATES)){
      const card=doc.querySelector(`[data-region="${region}"]`);
      if(!card)continue;
      const rawStatus=typeof card.getAttribute==='function'?card.getAttribute('data-raw-status'):null;
      if(rawStatus!=='UNAVAILABLE')continue;
      const note=doc.querySelector(`[data-region="${region}"] .region-gap-note`);
      if(note)note.textContent=message;
    }
    return true;
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
      ['[data-home-content="decision-summary"]','decisionSummaryHtml'],
      ['[data-home-content="diagnostics"]','diagnosticsHtml'],
      ['[data-research-content]','opportunitiesHtml'],
      ['[data-global-content]','regionsHtml'],
      ['[data-market-content]','opportunitiesHtml'],
      ['[data-research-early]','earlyTrendHtml'],
      ['[data-positions-content]','positionsHtml'],
      ['[data-trading-results]','tradingResultsHtml'],
      ['[data-calendar-content]','calendarHtml'],
      ['[data-news-content]','newsHtml'],
      ['[data-home-content="today-focus"]','todayFocusHtml']
    ];
    for(const [selector,field] of optional){
      const node=doc.querySelector(selector);
      if(node&&typeof plan[field]==='string')node.innerHTML=plan[field];
    }
    if(typeof plan.researchPerformanceHtml==='string'){
      const target=doc.querySelector('[data-research-performance]');
      if(target)target.innerHTML=plan.researchPerformanceHtml;
      else{
        const legacy=doc.querySelector('#results .results-grid > .panel:nth-child(2)');
        if(legacy)legacy.innerHTML=`<span class="eyebrow">研究結果</span><h2>台股 / 美股前瞻研究驗證</h2><div data-research-performance>${plan.researchPerformanceHtml}</div>`;
      }
    }
    applyRegionalSourceGates(doc);
    return Object.freeze({ok:true,updated:Object.freeze(TARGETS.map(x=>x.selector))});
  }

  return Object.freeze({TARGETS,REGIONAL_SOURCE_GATES,applyRegionalSourceGates,applyHomeRender});
});
