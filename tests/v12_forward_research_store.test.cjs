'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Perf=require('../v12/results/forward_performance.js');
const {createDurableForwardResearchStore}=require('../v12/staging/durable_forward_research_store.js');

const day=86400000;
const t0=Date.parse('2026-09-10T05:30:00Z');
function track(id='fwd:TWSE:2330:2026-09-10:POSITIVE'){
  return Perf.createForwardTrack({id,market:'TW',instrumentId:'TWSE:2330',direction:'POSITIVE',researchScore:82,priority:'優先覆核',createdAt:t0+1000,baseline:{sessionDate:'2026-09-10',close:100,asOf:t0,source:'TWSE:STOCK_DAY_ALL'},regime:{state:'BROAD_ADVANCE',label:'廣泛上漲',asOf:t0,source:'TW_MARKET_CORE'},researchOnly:true,executionWrite:false});
}
function session(n,close=100+n){return {sessionDate:new Date(Date.parse('2026-09-10T00:00:00Z')+n*day).toISOString().slice(0,10),close,high:close+2,low:close-3,asOf:t0+n*day,source:'TWSE:STOCK_DAY_ALL',fullyClosed:true};}

test('durable forward ledger survives restart and stays separate from execution vocabulary',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-ledger-'));
  const filePath=path.join(dir,'research.forward.jsonl');
  try{
    const store=createDurableForwardResearchStore({filePath,now:()=>t0+5000});
    const created=store.createTrack(track());
    assert.equal(created.status,'CREATED');
    const restarted=createDurableForwardResearchStore({filePath,now:()=>t0+6000});
    assert.deepEqual(restarted.getTrack(track().id),track());
    assert.equal(restarted.listTracks({market:'TW'}).length,1);
    assert.deepEqual(Object.keys(restarted).sort(),['createTrack','getTrack','listTracks','recordSession','summarize'].sort());
    assert.doesNotMatch(fs.readFileSync(filePath,'utf8'),/positionId|orderId|fill|leverage|realOrder/i);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('exact duplicate track creation is idempotent but same id with conflicting baseline is rejected',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-idempotent-'));
  const filePath=path.join(dir,'research.forward.jsonl');
  try{
    const store=createDurableForwardResearchStore({filePath,now:()=>t0+5000});
    assert.equal(store.createTrack(track()).status,'CREATED');
    assert.equal(store.createTrack(track()).status,'IDEMPOTENT');
    const conflicting=Perf.createForwardTrack({id:track().id,market:'TW',instrumentId:'TWSE:2330',direction:'POSITIVE',researchScore:82,priority:'優先覆核',createdAt:t0+2000,baseline:{sessionDate:'2026-09-10',close:101,asOf:t0,source:'TWSE'},regime:{state:'BROAD_ADVANCE',label:'廣泛上漲',asOf:t0,source:'TW_MARKET_CORE'},researchOnly:true,executionWrite:false});
    assert.throws(()=>store.createTrack(conflicting),/FORWARD_TRACK_CONFLICT/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('recorded closed sessions persist across restart and No Backfill remains enforced',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-session-'));
  const filePath=path.join(dir,'research.forward.jsonl');
  try{
    let store=createDurableForwardResearchStore({filePath,now:()=>t0+3*day});
    store.createTrack(track());
    const updated=store.recordSession(track().id,session(1,105));
    assert.equal(updated.outcomes['1D'].returnPct,.05);
    store=createDurableForwardResearchStore({filePath,now:()=>t0+4*day});
    assert.equal(store.getTrack(track().id).outcomes['1D'].returnPct,.05);
    assert.throws(()=>store.recordSession(track().id,{...session(2),sessionDate:'2026-09-09'}),/BACKFILL_FORBIDDEN/);
    assert.throws(()=>store.recordSession('missing',session(2)),/FORWARD_TRACK_NOT_FOUND/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('durable store summary reconstructs forward-only research performance after restart',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-summary-'));
  const filePath=path.join(dir,'research.forward.jsonl');
  try{
    let store=createDurableForwardResearchStore({filePath,now:()=>t0+3*day});
    store.createTrack(track('a'));
    store.createTrack(Perf.createForwardTrack({id:'b',market:'TW',instrumentId:'TWSE:2317',direction:'POSITIVE',researchScore:60,priority:'值得關注',createdAt:t0+1000,baseline:{sessionDate:'2026-09-10',close:100,asOf:t0,source:'TWSE'},regime:{state:'BROAD_ADVANCE',label:'廣泛上漲',asOf:t0,source:'TW_MARKET_CORE'},researchOnly:true,executionWrite:false}));
    store.recordSession('a',session(1,110));
    store.recordSession('b',session(1,95));
    store=createDurableForwardResearchStore({filePath,now:()=>t0+4*day});
    const summary=store.summarize('TW',t0+4*day);
    assert.equal(summary.validationMode,'FORWARD_ONLY');
    assert.equal(summary.horizons['1D'].sampleCount,2);
    assert.equal(summary.horizons['1D'].hitRate,.5);
    assert.equal(summary.regimes.BROAD_ADVANCE.horizons['1D'].sampleCount,2);
    assert.equal('winRate' in summary,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
