const test=require('node:test');
const assert=require('node:assert/strict');
const {createHomeSnapshotStore}=require('../v12/staging/read_api.js');
const {createHomeSnapshotPublisher}=require('../v12/staging/home_publisher.js');

test('publisher builds and atomically publishes a safe home read model',()=>{
  const store=createHomeSnapshotStore();
  const publisher=createHomeSnapshotPublisher({homeStore:store});
  const result=publisher.publish({asOf:1000});
  assert.equal(result.schemaVersion,'foxyya-home-read-model/1');
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
  assert.equal(store.read(),result);
});

test('failed publish leaves the previous valid snapshot untouched',()=>{
  const store=createHomeSnapshotStore();
  const publisher=createHomeSnapshotPublisher({homeStore:store});
  const first=publisher.publish({asOf:2000});
  assert.throws(()=>publisher.publish({asOf:NaN}),/ASOF_INVALID/);
  assert.equal(store.read(),first);
});

test('publisher rejects time regression without replacing current snapshot',()=>{
  const store=createHomeSnapshotStore();
  const publisher=createHomeSnapshotPublisher({homeStore:store});
  const first=publisher.publish({asOf:3000});
  assert.throws(()=>publisher.publish({asOf:2999}),/SNAPSHOT_TIME_REGRESSION/);
  assert.equal(store.read(),first);
});

test('publisher surface is read-model publication only and exposes no execution methods',()=>{
  const store=createHomeSnapshotStore();
  const publisher=createHomeSnapshotPublisher({homeStore:store});
  assert.deepEqual(Object.keys(publisher),['publish']);
  const serialized=JSON.stringify(Object.keys(publisher)).toLowerCase();
  assert.doesNotMatch(serialized,/order|trade|execute|position|fill/);
});
