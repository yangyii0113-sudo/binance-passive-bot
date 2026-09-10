const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {buildRuntimeReadModel}=require('../v12/read_model/runtime.js');
const API=require('../v12/staging/read_api.js');

const status=Object.freeze({
  ok:true,
  paper_only:true,
  real_order_lock:true,
  canonical_book:'5x',
  canonical_book_role:'PRIMARY',
  strategy_version:'v11.2',
  started_ms:100,
  uptime_seconds:900,
  cycle_count:88,
  last_cycle:{time_ms:990,diagnostics:{}},
  last_error:null,
  ledger_integrity:true
});

const executionRead=Object.freeze({
  schema:'foxyya-v12-crypto-execution-read/1',
  paperOnly:true,
  realOrderLock:true,
  readOnly:true,
  strategyVersion:'v11.2',
  cycleCount:88,
  ledgerIntegrity:true,
  canonicalBook:'5x',
  canonicalBookRole:'PRIMARY',
  canonicalNav:997.9,
  canonicalNavSource:'runtime_snapshot.books.5x.equity',
  health:'HEALTHY',
  asOf:1000,
  ledgerEvents:120,
  candidates:[{symbol:'ETHUSDT'}],
  pending:[{intent_id:'i1',symbol:'ETHUSDT'}],
  openPositions:[{position_id:'p1',symbol:'BTCUSDT',closed:false}],
  closedTrades:[{position_id:'p2',symbol:'SOLUSDT',closed:true}],
  books:{'5x':{equity:997.9},'8x':{equity:1200},'10x':{equity:1500}},
  diagnostics:{qualified_24h:4,filled_24h:1,cancelled_24h:2,backfill_count:0,duplicate_fill_count:0}
});

function request(server,{method='GET',path='/v12/api/runtime'}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path,method},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });
    req.on('error',reject);req.end();
  });
}

async function withRuntimeServer(runtime,fn){
  const homeStore=API.createHomeSnapshotStore();
  const runtimeStore=API.createRuntimeSnapshotStore();
  if(runtime)runtimeStore.publish(runtime);
  const server=http.createServer(API.createReadOnlyHandler({homeStore,runtimeStore}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await fn(server,runtimeStore)}finally{await new Promise(resolve=>server.close(resolve))}
}

test('runtime read model maps engine-owned canonical book and NAV',()=>{
  const value=buildRuntimeReadModel({status,executionRead});
  assert.equal(value.schema_version,'foxyya-runtime/1');
  assert.equal(value.api_version,'v12');
  assert.equal(value.read_only,true);
  assert.equal(value.execution_write,false);
  assert.equal(value.ledger.canonical_book,'5x');
  assert.equal(value.ledger.canonical_book_role,'PRIMARY');
  assert.equal(value.ledger.canonical_nav,997.9);
  assert.equal(value.ledger.canonical_nav_source,'runtime_snapshot.books.5x.equity');
  assert.equal(value.execution.pending,1);
  assert.equal(value.execution.open_positions,1);
});

test('runtime read model keeps canonical NAV null and degraded without engine declaration',()=>{
  const degraded={...executionRead,canonicalBook:null,canonicalBookRole:null,canonicalNav:null,canonicalNavSource:null,health:'DEGRADED'};
  const legacyStatus={...status};delete legacyStatus.canonical_book;delete legacyStatus.canonical_book_role;
  const value=buildRuntimeReadModel({status:legacyStatus,executionRead:degraded});
  assert.equal(value.ledger.canonical_book,null);
  assert.equal(value.ledger.canonical_nav,null);
  assert.equal(value.runtime.status,'DEGRADED');
});

test('runtime read model rejects unsafe or writable execution input',()=>{
  assert.throws(()=>buildRuntimeReadModel({status:{...status,real_order_lock:false},executionRead}),/REAL_ORDER_LOCK_REQUIRED/);
  assert.throws(()=>buildRuntimeReadModel({status,executionRead:{...executionRead,readOnly:false}}),/RUNTIME_READ_ONLY_REQUIRED/);
});

test('staging runtime store rejects unsafe snapshots and time regression',()=>{
  const value=buildRuntimeReadModel({status,executionRead});
  const store=API.createRuntimeSnapshotStore();
  assert.equal(store.publish(value).as_of,1000);
  assert.throws(()=>store.publish({...value,safety:{...value.safety,real_order_lock:false}}),/RUNTIME_SAFETY_REQUIRED/);
  assert.throws(()=>store.publish({...value,as_of:999}),/SNAPSHOT_TIME_REGRESSION/);
});

test('GET /v12/api/runtime serves the read model and rejects writes',()=>{
  const value=buildRuntimeReadModel({status,executionRead});
  return withRuntimeServer(value,async server=>{
    const res=await request(server);
    assert.equal(res.status,200);
    assert.match(res.headers['content-type'],/application\/json/);
    assert.equal(res.headers['cache-control'],'no-store');
    const body=JSON.parse(res.body);
    assert.equal(body.schema_version,'foxyya-runtime/1');
    assert.equal(body.ledger.canonical_nav,997.9);
    assert.equal((await request(server,{method:'POST'})).status,405);
  });
});

test('GET /v12/api/runtime returns explicit UNAVAILABLE until runtime is published',()=>withRuntimeServer(null,async server=>{
  const res=await request(server);
  assert.equal(res.status,503);
  const body=JSON.parse(res.body);
  assert.equal(body.status,'UNAVAILABLE');
  assert.equal(body.data,null);
}));
