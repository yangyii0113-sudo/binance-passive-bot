const test=require('node:test');
const assert=require('node:assert/strict');
const {adaptRuntime}=require('../v12/crypto/runtime_adapter.js');

const status={paper_only:true,real_order_lock:true,strategy_version:'v11.2',cycle_count:88,ledger_integrity:true,ok:true};
const snapshot={schema:'foxyya-runtime-snapshot/1',status:'PAPER_ONLY',real_orders:false,complete:true,served_at:1000,ledger_events:120,books:{'5x':{}},candidates:[{symbol:'ETHUSDT'}],pending:[{intent_id:'i1',symbol:'ETHUSDT'}],trades:[{position_id:'p1',symbol:'BTCUSDT',closed:false},{position_id:'p2',symbol:'SOLUSDT',closed:true}],diagnostics:{qualified_24h:4,filled_24h:1}};

test('adapter requires both runtime safety locks',()=>{
  assert.throws(()=>adaptRuntime({...status,real_order_lock:false},snapshot),/REAL_ORDER_LOCK_REQUIRED/);
  assert.throws(()=>adaptRuntime({...status,paper_only:false},snapshot),/PAPER_ONLY_REQUIRED/);
});

test('adapter rejects incomplete or real-order capable snapshot',()=>{
  assert.throws(()=>adaptRuntime(status,{...snapshot,complete:false}),/SNAPSHOT_INCOMPLETE/);
  assert.throws(()=>adaptRuntime(status,{...snapshot,real_orders:true}),/REAL_ORDERS_FORBIDDEN/);
});

test('adapter maps pending open and closed data as read-only',()=>{
  const r=adaptRuntime(status,snapshot);
  assert.equal(r.pending.length,1);
  assert.equal(r.openPositions.length,1);
  assert.equal(r.closedTrades.length,1);
  assert.equal(r.paperOnly,true);
  assert.equal(r.realOrderLock,true);
  assert.equal(r.readOnly,true);
});

test('adapter exposes ledger degradation without enabling writes',()=>{
  const r=adaptRuntime({...status,ledger_integrity:false},snapshot);
  assert.equal(r.health,'DEGRADED');
  assert.equal(r.ledgerIntegrity,false);
  assert.equal('execute' in r,false);
});