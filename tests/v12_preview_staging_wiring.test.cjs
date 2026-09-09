const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const appSource=fs.readFileSync('v12/ui/app.js','utf8');
const indexSource=fs.readFileSync('v12/ui/index.html','utf8');

function boot(loadResult){
  let createCalls=0,loadCalls=0,renderCalls=0;
  const more={hidden:false};
  const toast={textContent:'',classList:{add(){},remove(){}}};
  const health={textContent:'PREVIEW · DATA UNAVAILABLE'};
  const document={
    querySelector(selector){if(selector==='#more-sheet')return more;if(selector==='#toast')return toast;if(selector==='#data-health')return health;return null},
    querySelectorAll(){return []}
  };
  const window={
    FOXY_V12_HOME_VIEW_MODEL:{buildHomeViewModel(data){return {data}}},
    FOXY_V12_HOME_RENDERER:{renderHomeSections(view){return {view}}},
    FOXY_V12_HOME_DOM:{applyHomeRender(doc,plan){renderCalls++;assert.equal(doc,document);assert.ok(plan.view)}},
    FOXY_V12_STAGING_READ_CLIENT:{createHomeReadClient(){createCalls++;return {async load(){loadCalls++;return loadResult}}}},
    scrollTo(){}
  };
  const context={window,document,history:{replaceState(){}},location:{hash:''},setTimeout(){return 1},clearTimeout(){}};
  vm.runInNewContext(appSource,context,{filename:'app.js'});
  return {window,health,getCounts:()=>({createCalls,loadCalls,renderCalls})};
}

test('preview does not fetch staging automatically and exposes explicit loadStagingHome',async()=>{
  const safe={schemaVersion:'foxyya-home-read-model/1',asOf:1,researchOnly:true,executionWrite:false};
  const env=boot({status:'AVAILABLE',data:safe});
  assert.deepEqual(env.getCounts(),{createCalls:0,loadCalls:0,renderCalls:0});
  assert.equal(typeof env.window.FOXY_V12_PREVIEW.loadStagingHome,'function');
  const result=await env.window.FOXY_V12_PREVIEW.loadStagingHome();
  assert.equal(result.status,'AVAILABLE');
  assert.deepEqual(env.getCounts(),{createCalls:1,loadCalls:1,renderCalls:1});
  assert.match(env.health.textContent,/STAGING/);
});

test('unavailable staging result stays unavailable and is not rendered',async()=>{
  const env=boot({status:'UNAVAILABLE',data:null});
  const result=await env.window.FOXY_V12_PREVIEW.loadStagingHome();
  assert.deepEqual(result,{status:'UNAVAILABLE',data:null});
  assert.deepEqual(env.getCounts(),{createCalls:1,loadCalls:1,renderCalls:0});
  assert.match(env.health.textContent,/UNAVAILABLE/);
});

test('preview loads fixed staging read client before app',()=>{
  const client=indexSource.indexOf('<script src="../staging/read_client.js"></script>');
  const app=indexSource.indexOf('<script src="app.js"></script>');
  assert.ok(client>=0,'staging read client script missing');
  assert.ok(client<app,'staging read client must load before app');
  assert.doesNotMatch(appSource,/\/api\/runtime|placeOrder|submitOrder/);
});
