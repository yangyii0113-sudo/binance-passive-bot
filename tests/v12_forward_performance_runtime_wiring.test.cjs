'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const Entry=require('../v12/staging/runtime_entry.js');
const HomeDom=require('../v12/ui/home_dom.js');

function request(address,pathname){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:address.address,port:address.port,path:pathname,method:'GET'},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));
    });
    req.on('error',reject);req.end();
  });
}

test('runtime config defines a durable forward-research ledger path and rejects wrong suffix',()=>{
  const cfg=Entry.runtimeConfig({});
  assert.equal(cfg.forwardResearchFilePath,'/data/foxyya-v12-forward-research.forward.jsonl');
  assert.throws(()=>Entry.runtimeConfig({FOXYYA_V12_FORWARD_RESEARCH_PATH:'/tmp/forward.jsonl'}),/FORWARD_LEDGER_PATH_INVALID/);
  assert.equal(Entry.runtimeConfig({FOXYYA_V12_FORWARD_RESEARCH_PATH:'/tmp/research.forward.jsonl'}).forwardResearchFilePath,'/tmp/research.forward.jsonl');
});

test('staging runtime wires durable forward tracker into Home even when upstream providers are unavailable',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-runtime-'));
  const forwardResearchFilePath=path.join(dir,'runtime.forward.jsonl');
  const lineageFilePath=path.join(dir,'runtime.lineage.jsonl');
  const runtime=await Entry.startFromEnvironment({
    HOST:'127.0.0.1',PORT:'0',FOXYYA_V12_LINEAGE_PATH:lineageFilePath,
    FOXYYA_V12_FORWARD_RESEARCH_PATH:forwardResearchFilePath,FOXYYA_V12_REFRESH_SECONDS:'1800'
  },{
    fetchImpl:async()=>{throw Error('NETWORK_DOWN')},
    clock:()=>Date.parse('2026-09-11T05:00:00Z'),
    setIntervalImpl(){return 1},clearIntervalImpl(){},onResearchError(error){throw error}
  });
  try{
    await runtime.researchReady;
    assert.ok(runtime.forwardResearchStore);
    assert.ok(runtime.forwardResearchTracker);
    const res=await request(runtime.address,'/v12/api/home');
    assert.equal(res.status,200);
    const home=JSON.parse(res.body);
    assert.equal(home.researchPerformance.schemaVersion,'foxyya-research-performance-read/1');
    assert.equal(home.researchPerformance.tw.status,'FORWARD_TRACKING');
    assert.equal(home.researchPerformance.tw.summary.sampleCount,0);
    assert.equal(home.researchPerformance.us.status,'WAITING_LEGAL_DATA_SOURCE');
    assert.equal(home.researchPerformance.researchOnly,true);
    assert.equal(home.researchPerformance.executionWrite,false);
    assert.equal(home.executionWrite,false);
  }finally{
    await runtime.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('Home DOM upgrades the legacy Results research panel and keeps research performance separate from trading results',()=>{
  const calls=[];
  const nodes=new Map();
  for(const target of HomeDom.TARGETS)nodes.set(target.selector,{});
  const legacyResearchPanel={};
  nodes.set('#results .results-grid > .panel:nth-child(2)',legacyResearchPanel);
  const doc={querySelector(selector){calls.push(selector);return nodes.get(selector)||null}};
  const plan={schemaVersion:'foxyya-home-render/1',researchOnly:true,executionWrite:false};
  for(const target of HomeDom.TARGETS)plan[target.field]='x';
  plan.researchPerformanceHtml='<b>台股前瞻追蹤</b>';
  HomeDom.applyHomeRender(doc,plan);
  assert.match(legacyResearchPanel.innerHTML,/data-research-performance/);
  assert.match(legacyResearchPanel.innerHTML,/台股前瞻追蹤/);
  assert.ok(calls.includes('[data-research-performance]'));
  assert.ok(calls.includes('#results .results-grid > .panel:nth-child(2)'));
});
