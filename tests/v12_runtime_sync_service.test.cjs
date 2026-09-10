'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createRuntimeSyncService}=require('../v12/staging/runtime_sync_service.js');

function fakeReadModel(){return {schema_version:'foxyya-runtime/1',ledger:{canonical_nav:997.9}}}

test('sync service is disabled by default and performs no network or timers',async()=>{
  let fetched=0,timers=0,published=0;
  const service=createRuntimeSyncService({
    sourceUrl:null,
    fetchImpl:async()=>{fetched++;throw Error('unexpected')},
    publishRuntime:()=>{published++},
    setIntervalImpl:()=>{timers++},
    clearIntervalImpl:()=>{}
  });
  assert.equal(service.enabled,false);
  assert.equal(await service.ready,null);
  assert.equal(fetched,0);
  assert.equal(timers,0);
  assert.equal(published,0);
  await service.close();
});

test('enabled service performs initial sync and schedules refresh without overlap',async()=>{
  let calls=0,published=0,scheduled=null,intervalMs=null;
  let resolveFirst;
  const first=new Promise(resolve=>resolveFirst=resolve);
  const bridgeFactory=()=>({
    async syncOnce(){
      calls++;
      if(calls===1)await first;
      published++;
      return fakeReadModel();
    }
  });
  const service=createRuntimeSyncService({
    sourceUrl:'https://runtime.example',refreshSeconds:30,
    fetchImpl:async()=>{},publishRuntime:()=>{},bridgeFactory,
    setIntervalImpl:(fn,ms)=>{scheduled=fn;intervalMs=ms;return 7},clearIntervalImpl:()=>{}
  });
  assert.equal(service.enabled,true);
  assert.equal(intervalMs,30000);
  scheduled();
  assert.equal(calls,1,'overlapping timer must not start a second sync');
  resolveFirst();
  assert.equal((await service.ready).ledger.canonical_nav,997.9);
  await new Promise(resolve=>setImmediate(resolve));
  scheduled();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,2);
  assert.equal(published,2);
  await service.close();
});

test('sync errors are reported and do not publish fabricated runtime state',async()=>{
  const errors=[];let scheduled=null;
  const service=createRuntimeSyncService({
    sourceUrl:'https://runtime.example',refreshSeconds:30,
    fetchImpl:async()=>{},publishRuntime:()=>{},
    bridgeFactory:()=>({syncOnce:async()=>{throw Error('RUNTIME_UNAVAILABLE')}}),
    onError:error=>errors.push(error.message),
    setIntervalImpl:fn=>{scheduled=fn;return 9},clearIntervalImpl:()=>{}
  });
  assert.equal(await service.ready,null);
  assert.deepEqual(errors,['RUNTIME_UNAVAILABLE']);
  scheduled();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(errors,['RUNTIME_UNAVAILABLE','RUNTIME_UNAVAILABLE']);
  await service.close();
});

test('close clears timer and blocks later scheduled refresh',async()=>{
  let calls=0,cleared=null,scheduled=null;
  const service=createRuntimeSyncService({
    sourceUrl:'https://runtime.example',refreshSeconds:45,
    fetchImpl:async()=>{},publishRuntime:()=>{},
    bridgeFactory:()=>({syncOnce:async()=>{calls++;return fakeReadModel()}}),
    setIntervalImpl:fn=>{scheduled=fn;return 11},clearIntervalImpl:id=>{cleared=id}
  });
  await service.ready;
  await service.close();
  assert.equal(cleared,11);
  scheduled();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);
});

test('refresh interval is bounded',()=>{
  for(const refreshSeconds of [0,9,301,NaN]){
    assert.throws(()=>createRuntimeSyncService({sourceUrl:'https://runtime.example',refreshSeconds,fetchImpl:async()=>{},publishRuntime:()=>{}}),/RUNTIME_REFRESH_SECONDS_INVALID/);
  }
  assert.doesNotThrow(()=>createRuntimeSyncService({sourceUrl:'https://runtime.example',refreshSeconds:10,fetchImpl:async()=>{},publishRuntime:()=>{},setIntervalImpl:()=>1,clearIntervalImpl:()=>{}}));
  assert.doesNotThrow(()=>createRuntimeSyncService({sourceUrl:'https://runtime.example',refreshSeconds:300,fetchImpl:async()=>{},publishRuntime:()=>{},setIntervalImpl:()=>1,clearIntervalImpl:()=>{}}));
});
