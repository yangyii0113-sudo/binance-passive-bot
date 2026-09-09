const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const D=require('../v12/ui/home_dom.js');

function fakeDocument(){
  const nodes=new Map();
  const make=selector=>({selector,textContent:'',innerHTML:''});
  for(const selector of ['#home-asof','#data-health','.region-grid','.pulse-grid','[data-home-content="early-trend"]','.opportunity-grid','[data-home-content="events"]'])nodes.set(selector,make(selector));
  return {nodes,querySelector(selector){return nodes.get(selector)||null;}};
}

const plan=Object.freeze({
  schemaVersion:'foxyya-home-render/1',asOfLabel:'2026-09-09T05:15:00.000Z',dataHealthLabel:'VERIFIED DATA',
  regionsHtml:'<article data-region="TW">TW</article>',marketPulseHtml:'<article data-market-pulse="TW">TW</article>',
  earlyTrendHtml:'<div>EARLY WATCH</div>',opportunitiesHtml:'<div>RESEARCH</div>',eventsHtml:'<div>Fed</div>',
  researchOnly:true,executionWrite:false
});

test('DOM binder writes only approved home targets from a safe render plan',()=>{
  const doc=fakeDocument();
  const result=D.applyHomeRender(doc,plan);
  assert.equal(result.ok,true);
  assert.equal(doc.nodes.get('#home-asof').textContent,plan.asOfLabel);
  assert.equal(doc.nodes.get('#data-health').textContent,plan.dataHealthLabel);
  assert.equal(doc.nodes.get('.region-grid').innerHTML,plan.regionsHtml);
  assert.equal(doc.nodes.get('.pulse-grid').innerHTML,plan.marketPulseHtml);
  assert.equal(doc.nodes.get('[data-home-content="early-trend"]').innerHTML,plan.earlyTrendHtml);
  assert.equal(doc.nodes.get('.opportunity-grid').innerHTML,plan.opportunitiesHtml);
  assert.equal(doc.nodes.get('[data-home-content="events"]').innerHTML,plan.eventsHtml);
});

test('DOM binder rejects writable/wrong-schema plans and missing required targets',()=>{
  const doc=fakeDocument();
  assert.throws(()=>D.applyHomeRender(doc,{...plan,executionWrite:true}),/HOME_RENDER_READ_ONLY_REQUIRED/);
  assert.throws(()=>D.applyHomeRender(doc,{...plan,schemaVersion:'other'}),/HOME_RENDER_PLAN_REQUIRED/);
  doc.nodes.delete('.pulse-grid');
  assert.throws(()=>D.applyHomeRender(doc,plan),/HOME_TARGET_MISSING/);
});

test('preview loads the safe rendering pipeline before app and exposes no automatic production fetch',()=>{
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'v12/ui/index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'v12/ui/app.js'),'utf8');
  const scripts=['home_view_model.js','home_renderer.js','home_dom.js','app.js'];
  let previous=-1;
  for(const script of scripts){const at=html.indexOf(`src="${script}"`);assert.ok(at>previous,`${script} load order`);previous=at;}
  assert.match(html,/data-home-content="early-trend"/);
  assert.match(html,/data-home-content="events"/);
  assert.match(app,/renderHomeReadModel/);
  assert.match(app,/FOXY_V12_HOME_VIEW_MODEL/);
  assert.match(app,/FOXY_V12_HOME_RENDERER/);
  assert.match(app,/FOXY_V12_HOME_DOM/);
  assert.equal(/fetch\s*\(|\/api\/runtime|placeOrder|submitOrder|authorizeExecution/.test(app),false);
});
