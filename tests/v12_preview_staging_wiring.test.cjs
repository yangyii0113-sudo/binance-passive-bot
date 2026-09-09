const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const appSource=fs.readFileSync('v12/ui/app.js','utf8');
const indexSource=fs.readFileSync('v12/ui/index.html','utf8');

function boot(loadResult,pathname=''){
  let createCalls=0,loadCalls=0,renderCalls=0; const rendered=[];
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
    FOXY_V12_HOME_DOM:{applyHomeRender(doc,plan){renderCalls++;rendered.push(plan.view.data.asOf);assert.equal(doc,document);assert.ok(plan.view)}},
    FOXY_V12_STAGING_READ_CLIENT:{createHomeReadClient(){createCalls++;return {async load(){loadCalls++;return typeof loadResult==='function'?loadResult():loadResult}}}},
    scrollTo(){}
  };
  const context={window,document,history:{replaceState(){}},location:{hash:'',pathname},setTimeout(){return 1},clearTimeout(){}};
  vm.runInNewContext(appSource,context,{filename:'app.js'});
  return {window,health,rendered,getCounts:()=>({createCalls,loadCalls,renderCalls})};
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


test('served v12 staging preview automatically loads Home on entry',async()=>{
  const env=boot({status:'UNAVAILABLE',data:null},'/v12-preview/');
  await Promise.resolve();await Promise.resolve();
  assert.equal(env.getCounts().loadCalls,1);
  assert.match(env.health.textContent,/UNAVAILABLE/);
});

const snapshot=asOf=>({status:'AVAILABLE',data:{schemaVersion:'foxyya-home-read-model/1',asOf,researchOnly:true,executionWrite:false}});
test('failed Home refresh persistently marks retained data stale',async()=>{
  let failed=false;
  const env=boot(()=>{if(failed)throw Error('NETWORK_FAILED');return snapshot(100)});
  await env.window.FOXY_V12_PREVIEW.loadStagingHome();failed=true;
  await env.window.FOXY_V12_PREVIEW.loadStagingHome();
  assert.match(env.health.textContent,/STALE/);
  assert.deepEqual(env.rendered,[100]);
});

test('out of order Home responses cannot replace the newest snapshot',async()=>{
  const resolves=[];
  const env=boot(()=>new Promise(resolve=>resolves.push(resolve)));
  const first=env.window.FOXY_V12_PREVIEW.loadStagingHome();
  const second=env.window.FOXY_V12_PREVIEW.loadStagingHome();
  resolves[1](snapshot(300));await second;
  resolves[0](snapshot(200));await first;
  assert.deepEqual(env.rendered,[300]);
});
