const test=require('node:test');
const assert=require('node:assert/strict');
const Bridge=require('../v12/staging/execution_read_bridge.js');

const BASE='https://foxyya-paper-engine-production.up.railway.app';

function response(status,body,contentType='application/json; charset=utf-8'){
  return {ok:status>=200&&status<300,status,headers:{get:name=>name.toLowerCase()==='content-type'?contentType:null},json:async()=>body};
}

function runtimeStatus(){
  return {ok:true,paper_only:true,real_order_lock:true,execution_enabled:false,strategy_version:'FOXYYA-EXEC-V2-20260908',cycle_count:12,ledger_integrity:true};
}

function runtimeSnapshot(){
  return {schema:'foxyya-runtime-snapshot/1',status:'PAPER_ONLY',real_orders:false,complete:true,served_at:1788970000000,ledger_events:42,books:{'5x':{}},candidates:[],pending:[],trades:[],diagnostics:{qualified_24h:0,filled_24h:0}};
}

test('Production execution bridge is fixed-origin GET-only and returns validated PAPER runtime input',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url===BASE+'/api/runtime/status')return response(200,runtimeStatus());
    if(url===BASE+'/api/runtime/snapshot')return response(200,runtimeSnapshot());
    throw Error('unexpected url');
  };
  const bridge=Bridge.createExecutionReadBridge({fetchImpl});
  assert.deepEqual(Object.keys(bridge).sort(),['loadBacktest','loadCalendar','loadNews','loadRuntime']);
  const out=await bridge.loadRuntime();
  assert.equal(out.status,'AVAILABLE');
  assert.equal(out.data.status.paper_only,true);
  assert.equal(out.data.status.real_order_lock,true);
  assert.equal(out.data.snapshot.real_orders,false);
  assert.deepEqual(calls.map(x=>x.url),[BASE+'/api/runtime/status',BASE+'/api/runtime/snapshot']);
  assert.equal(calls.every(x=>x.options?.method==='GET'),true);
  assert.equal(calls.every(x=>!x.options?.body),true);
  assert.equal(JSON.stringify(calls).includes('Authorization'),false);
});

test('runtime bridge fails closed when Production safety locks or schema are invalid',async()=>{
  const unsafe={...runtimeStatus(),real_order_lock:false};
  const bridge=Bridge.createExecutionReadBridge({fetchImpl:async url=>url.endsWith('/status')?response(200,unsafe):response(200,runtimeSnapshot())});
  const out=await bridge.loadRuntime();
  assert.equal(out.status,'UNAVAILABLE');
  assert.equal(out.data,null);
  assert.match(out.reason,/REAL_ORDER_LOCK|SAFETY/);
});

test('backtest calendar and news are read through fixed approved endpoints without fabricating unavailable data',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/api/backtest/latest'))return response(200,{status:'OK',mode:'HISTORICAL BACKTEST',label:'歷史模擬・非 Forward Performance',run_config:{run_id:'r1'},metrics:{performance:{}},report:{}});
    if(url.endsWith('/api/intel/calendar'))return response(200,{status:'OK',events:[{id:'c1',title:'CPI'}]});
    if(url.endsWith('/api/intel/news'))return response(200,{status:'OK',items:[{id:'n1',title:'Fed statement'}]});
    throw Error('unexpected url');
  };
  const bridge=Bridge.createExecutionReadBridge({fetchImpl});
  assert.equal((await bridge.loadBacktest()).status,'AVAILABLE');
  assert.equal((await bridge.loadCalendar()).status,'AVAILABLE');
  assert.equal((await bridge.loadNews()).status,'AVAILABLE');
  assert.deepEqual(calls.map(x=>x.url),[
    BASE+'/api/backtest/latest',BASE+'/api/intel/calendar',BASE+'/api/intel/news'
  ]);
  assert.equal(calls.every(x=>x.options?.method==='GET'),true);
});

test('transport and HTTP failures remain explicit UNAVAILABLE and bridge exposes no execution command',async()=>{
  const bridge=Bridge.createExecutionReadBridge({fetchImpl:async()=>response(503,{status:'UNAVAILABLE'})});
  for(const method of ['loadRuntime','loadBacktest','loadCalendar','loadNews']){
    const out=await bridge[method]();
    assert.equal(out.status,'UNAVAILABLE');
    assert.equal(out.data,null);
  }
  const surface=Object.keys(bridge).join(' ').toUpperCase();
  assert.equal(/ORDER|EXECUTE|SUBMIT|LEVERAGE|WITHDRAW|TRANSFER|WRITE/.test(surface),false);
});