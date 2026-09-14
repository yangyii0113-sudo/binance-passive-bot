'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createRuntimeReadiness}=require('../v12/staging/runtime_readiness.js');
const {startFromEnvironment}=require('../v12/staging/runtime_entry.js');

test('readiness gates startup, failures, stale publications and recovery without leaking error text',()=>{
  let now=1000;
  const state=createRuntimeReadiness({clock:()=>now,refreshSeconds:300,buildRevision:'abc123'});
  assert.equal(state.snapshot().status,'STARTING');
  state.start();state.succeed(1000);
  assert.equal(state.snapshot().ready,false,'startup probes still pending');
  state.validateStartup();
  assert.equal(state.snapshot().ready,true);
  assert.equal(state.snapshot().buildRevision,'abc123');
  state.start();state.fail(Error('DURABLE_WRITE_FAILED secret-token'));
  assert.equal(state.snapshot().status,'DEGRADED');
  assert.equal(state.snapshot().consecutiveSuccesses,0);
  assert.doesNotMatch(JSON.stringify(state.snapshot()),/secret-token/);
  now=2000;state.start();state.succeed(now);
  assert.equal(state.snapshot().ready,true);
  now+=600001;
  assert.equal(state.snapshot().status,'STALE');
  state.start();assert.equal(state.snapshot().ready,false,'in-flight work cannot hide staleness');
  state.succeed(now);assert.equal(state.snapshot().ready,true);
});

test('runtime readiness observes actual scheduled refresh success, write failure, recovery and HEAD semantics',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v12-ready-'));
  let now=1000,cycle,fail=false,resolveFirst;
  const first=new Promise(r=>resolveFirst=r);
  let runs=0;const events=[];
  const runtime=await startFromEnvironment({HOST:'127.0.0.1',PORT:'0',FOXYYA_V12_LINEAGE_PATH:path.join(dir,'test.lineage.jsonl'),FOXYYA_V12_REFRESH_SECONDS:'300'}, {
    clock:()=>now,executionBridge:null,setIntervalImpl:fn=>{cycle=fn;return 1},clearIntervalImpl:()=>{},
    onResearchError:()=>{},onResearchEvent:event=>events.push(event),
    createBootstrapImpl:()=>({async runOnce(){if(++runs===1)await first;if(fail)throw Error('DURABLE_WRITE_FAILED');return {researchOnly:true,executionWrite:false,orchestration:{published:{asOf:now}}};}})
  });
  const url=`http://127.0.0.1:${runtime.address.port}`;
  try{
    assert.equal((await fetch(url+'/ready')).status,503);
    assert.equal((await fetch(url+'/health')).status,200);
    resolveFirst();await runtime.researchReady;runtime.validateStartup();
    assert.equal((await fetch(url+'/ready')).status,200);
    fail=true;now+=300000;await cycle();
    let res=await fetch(url+'/ready');assert.equal(res.status,503);
    assert.equal((await res.json()).lastErrorCode,'DURABLE_WRITE_FAILED');
    fail=false;
    for(let i=0;i<3;i++){now+=300000;await cycle();}
    res=await fetch(url+'/ready');const body=await res.json();
    assert.equal(res.status,200);assert.equal(body.consecutiveSuccesses,3);
    assert.equal(body.successfulCycles,4);assert.equal(body.failedCycles,1);
    assert.equal(events.filter(e=>e.event==='research_refresh_succeeded').length,4);
    const head=await fetch(url+'/ready',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    assert.equal((await fetch(url+'/ready',{method:'POST'})).status,405);
  }finally{resolveFirst();await runtime.close();fs.rmSync(dir,{recursive:true,force:true});}
});
