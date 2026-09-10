'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createRuntimeReadBridge}=require('../v12/staging/runtime_read_bridge.js');

function response(status,body){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get(name){return String(name).toLowerCase()==='content-type'?'application/json; charset=utf-8':null}},
    async json(){return body;}
  };
}

function safeStatus(overrides={}){
  return {
    ok:true,paper_only:true,real_order_lock:true,canonical_book:'5x',canonical_book_role:'PRIMARY',
    strategy_version:'v11.2',started_ms:100,uptime_seconds:900,cycle_count:88,last_cycle:null,last_error:null,
    ledger_integrity:true,...overrides
  };
}

function safeSnapshot(overrides={}){
  return {
    schema:'foxyya-runtime-snapshot/1',status:'PAPER_ONLY',real_orders:false,complete:true,served_at:1000,ledger_events:120,
    books:{'5x':{equity:997.9},'8x':{equity:1200},'10x':{equity:1500}},candidates:[],pending:[],trades:[],
    diagnostics:{qualified_24h:4,filled_24h:1,cancelled_24h:0,backfill_count:0,duplicate_fill_count:0},...overrides
  };
}

test('bridge performs GET-only reads and publishes engine-owned canonical NAV',async()=>{
  const calls=[];let published=null;
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(url==='https://runtime.example/api/runtime/status')return response(200,safeStatus());
    if(url==='https://runtime.example/api/runtime/snapshot')return response(200,safeSnapshot());
    throw Error('unexpected url');
  };
  const bridge=createRuntimeReadBridge({sourceUrl:'https://runtime.example',fetchImpl,publishRuntime:value=>(published=value)});
  const value=await bridge.syncOnce();
  assert.equal(value.ledger.canonical_book,'5x');
  assert.equal(value.ledger.canonical_nav,997.9);
  assert.equal(published,value);
  assert.deepEqual(calls.map(x=>x.url),['https://runtime.example/api/runtime/status','https://runtime.example/api/runtime/snapshot']);
  for(const call of calls){
    assert.equal(call.init.method,'GET');
    assert.equal(call.init.credentials,'omit');
    assert.equal(call.init.body,undefined);
  }
});

test('bridge preserves null canonical NAV when the engine has not declared the canonical book',async()=>{
  const status=safeStatus();delete status.canonical_book;delete status.canonical_book_role;
  const fetchImpl=async url=>url.endsWith('/status')?response(200,status):response(200,safeSnapshot());
  let published=null;
  const value=await createRuntimeReadBridge({sourceUrl:'https://runtime.example',fetchImpl,publishRuntime:x=>(published=x)}).syncOnce();
  assert.equal(value.ledger.canonical_book,null);
  assert.equal(value.ledger.canonical_nav,null);
  assert.equal(value.runtime.status,'DEGRADED');
  assert.equal(published,value);
});

test('bridge never falls back to 8x or 10x when 5x equity is unavailable',async()=>{
  const snapshot=safeSnapshot({books:{'5x':{equity:null},'8x':{equity:1200},'10x':{equity:1500}}});
  const fetchImpl=async url=>url.endsWith('/status')?response(200,safeStatus()):response(200,snapshot);
  const value=await createRuntimeReadBridge({sourceUrl:'https://runtime.example',fetchImpl,publishRuntime:x=>x}).syncOnce();
  assert.equal(value.ledger.canonical_book,'5x');
  assert.equal(value.ledger.canonical_nav,null);
  assert.equal(value.runtime.status,'DEGRADED');
});

test('unsafe runtime input is rejected before publication',async()=>{
  let published=false;
  const fetchImpl=async url=>url.endsWith('/status')?response(200,safeStatus({real_order_lock:false})):response(200,safeSnapshot());
  const bridge=createRuntimeReadBridge({sourceUrl:'https://runtime.example',fetchImpl,publishRuntime:()=>{published=true}});
  await assert.rejects(()=>bridge.syncOnce(),/REAL_ORDER_LOCK_REQUIRED/);
  assert.equal(published,false);
});

test('runtime source URL must be an HTTPS origin without credentials path query or fragment',()=>{
  const noop=async()=>response(200,{}),publishRuntime=()=>{};
  for(const sourceUrl of ['http://runtime.example','https://u:p@runtime.example','https://runtime.example/path','https://runtime.example?x=1','https://runtime.example/#x']){
    assert.throws(()=>createRuntimeReadBridge({sourceUrl,fetchImpl:noop,publishRuntime}),/RUNTIME_SOURCE_URL_INVALID/);
  }
  assert.doesNotThrow(()=>createRuntimeReadBridge({sourceUrl:'http://127.0.0.1:8080',fetchImpl:noop,publishRuntime}));
});
