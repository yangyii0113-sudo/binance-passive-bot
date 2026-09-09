const test=require('node:test');
const assert=require('node:assert/strict');
const L=require('../v12/lab/contracts.js');
const {createVersionRegistry}=require('../v12/lab/version_registry.js');
const version=(id,mode)=>({id,modelId:'crypto-A',market:'CRYPTO',mode,version:id,createdAt:1000,rulesHash:'a'.repeat(64)});

test('lab modes separate CONTROL and SHADOW',()=>{
  assert.deepEqual(L.LAB_MODES,['CONTROL','SHADOW']);
});

test('registered versions are immutable and duplicate ids are rejected',()=>{
  const r=createVersionRegistry();
  const v=r.register(version('A-1','CONTROL'));
  assert.equal(Object.isFrozen(v),true);
  assert.throws(()=>r.register(version('A-1','SHADOW')),/VERSION_DUPLICATE/);
});

test('registering shadow cannot replace active control',()=>{
  const r=createVersionRegistry();
  r.register(version('A-1','CONTROL'));
  r.activateControl('crypto-A','A-1',{approvedBy:'Owen',approvedAt:1100,reason:'baseline'});
  r.register(version('A-shadow','SHADOW'));
  assert.equal(r.activeControl('crypto-A').version.id,'A-1');
});

test('control activation requires explicit review metadata',()=>{
  const r=createVersionRegistry();r.register(version('A-2','CONTROL'));
  assert.throws(()=>r.activateControl('crypto-A','A-2',{}),/REVIEW_REQUIRED/);
});

test('active Crypto control is frozen for thirty days before replacement',()=>{
  const DAY=86400000,r=createVersionRegistry();
  r.register(version('A-1','CONTROL'));r.activateControl('crypto-A','A-1',{approvedBy:'Owen',approvedAt:1000,reason:'baseline'});
  r.register({...version('A-2','CONTROL'),createdAt:2000});
  assert.throws(()=>r.activateControl('crypto-A','A-2',{approvedBy:'Owen',approvedAt:1000+29*DAY,reason:'review'}),/CONTROL_FREEZE_ACTIVE/);
  assert.equal(r.activateControl('crypto-A','A-2',{approvedBy:'Owen',approvedAt:1000+30*DAY,reason:'review'}).version.id,'A-2');
});