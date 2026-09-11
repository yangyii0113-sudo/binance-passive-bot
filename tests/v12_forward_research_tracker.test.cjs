'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createDurableForwardResearchStore}=require('../v12/staging/durable_forward_research_store.js');
const {createForwardResearchTracker}=require('../v12/staging/forward_research_tracker.js');

const t0=Date.parse('2026-09-10T06:00:00Z');
const day=86400000;
function fact(field,value,asOf,source='TWSE:STOCK_DAY_ALL'){return Object.freeze({field,value,unit:'TWD',status:'SNAPSHOT',source,observedAt:asOf,receivedAt:asOf});}
function twRow({asOf=t0,close=100,high=102,low=98,direction='POSITIVE',score=82,rank=1}={}){return Object.freeze({market:'TW',instrumentId:'TWSE:2330',asOf,rank,researchScore:score,priority:'優先覆核',facts:Object.freeze([fact('price.high',high,asOf),fact('price.low',low,asOf),fact('price.close',close,asOf)]),dataGaps:Object.freeze({}),research:Object.freeze({direction,confidence:.78,dimensions:Object.freeze({TREND:'POSITIVE'}),missingDimensions:Object.freeze([]),contradictions:Object.freeze([])}),earlyTrend:Object.freeze({stage:'CONFIRMING',confidence:.7}),researchOnly:true,executionWrite:false});}
function home({asOf=t0+1000,tw=[twRow()],regime='BROAD_ADVANCE'}={}){return Object.freeze({schemaVersion:'foxyya-home-read-model/1',asOf,home:Object.freeze({regions:Object.freeze([]),marketPulse:Object.freeze([Object.freeze({market:'TW',status:'AVAILABLE',state:regime,asOf:t0,data:Object.freeze({directionCoverage:'FULL'})})]),earlyTrend:Object.freeze([]),opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([Object.freeze({market:'US',instrumentId:'NASDAQ:NVDA',asOf:t0,research:Object.freeze({direction:'POSITIVE',confidence:.7}),facts:Object.freeze([]),dataGaps:Object.freeze({realtimeQuote:'UNAVAILABLE'}),researchOnly:true,executionWrite:false})]),TW:Object.freeze(tw)}),events:Object.freeze([]),todayFocus:Object.freeze([])}),cryptoExecution:null,cryptoResults:null,providerDiagnostics:null,researchOnly:true,executionWrite:false});}

test('first live ingest creates one TW forward baseline and explicitly blocks US without legal price data',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-tracker-'));
  try{
    const store=createDurableForwardResearchStore({filePath:path.join(dir,'forward.forward.jsonl'),now:()=>t0+5000});
    const tracker=createForwardResearchTracker({store});
    const result=tracker.ingest(home());
    assert.equal(result.tw.created,1);
    assert.equal(result.tw.sessionsRecorded,0);
    assert.equal(result.tw.activeTracks,1);
    assert.equal(result.us.status,'WAITING_LEGAL_DATA_SOURCE');
    assert.equal(result.us.created,0);
    const track=store.listTracks({market:'TW'})[0];
    assert.equal(track.instrumentId,'TWSE:2330');
    assert.equal(track.direction,'POSITIVE');
    assert.equal(track.baseline.close,100);
    assert.equal(track.regime.state,'BROAD_ADVANCE');
    assert.equal(track.sessions.length,0);
    assert.equal(track.validationMode,'FORWARD_ONLY');
    assert.equal(result.researchOnly,true);
    assert.equal(result.executionWrite,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('same closed-session snapshot is idempotent and never creates duplicate forward baselines',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-tracker-idem-'));
  try{
    const store=createDurableForwardResearchStore({filePath:path.join(dir,'forward.forward.jsonl'),now:()=>t0+5000});
    const tracker=createForwardResearchTracker({store});
    tracker.ingest(home());
    const again=tracker.ingest(home({asOf:t0+2000}));
    assert.equal(again.tw.created,0);
    assert.equal(again.tw.sessionsRecorded,0);
    assert.equal(store.listTracks({market:'TW'}).length,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('next fully closed session updates older tracks before creating the new day research baseline',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-tracker-next-'));
  try{
    let now=t0+5000;
    const store=createDurableForwardResearchStore({filePath:path.join(dir,'forward.forward.jsonl'),now:()=>now});
    const tracker=createForwardResearchTracker({store});
    tracker.ingest(home());
    now=t0+day+5000;
    const nextAsOf=t0+day;
    const result=tracker.ingest(home({asOf:nextAsOf+1000,tw:[twRow({asOf:nextAsOf,close:105,high:107,low:99})]}));
    assert.equal(result.tw.sessionsRecorded,1);
    assert.equal(result.tw.created,1);
    const tracks=store.listTracks({market:'TW'});
    assert.equal(tracks.length,2);
    const old=tracks.find(row=>row.baseline.close===100);
    const fresh=tracks.find(row=>row.baseline.close===105);
    assert.equal(old.outcomes['1D'].returnPct,.05);
    assert.equal(old.outcomes['1D'].mfePct,.07);
    assert.equal(old.outcomes['1D'].maePct,-.01);
    assert.equal(fresh.sessions.length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('existing directional research keeps accumulating outcomes even when current research is no longer directional',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-tracker-neutral-'));
  try{
    let now=t0+5000;
    const store=createDurableForwardResearchStore({filePath:path.join(dir,'forward.forward.jsonl'),now:()=>now});
    const tracker=createForwardResearchTracker({store});
    tracker.ingest(home());
    now=t0+day+5000;
    const nextAsOf=t0+day;
    const result=tracker.ingest(home({asOf:nextAsOf+1000,tw:[twRow({asOf:nextAsOf,close:97,high:101,low:95,direction:'UNAVAILABLE',score:40})]}));
    assert.equal(result.tw.sessionsRecorded,1);
    assert.equal(result.tw.created,0,'non-directional current research must not create a new validation track');
    assert.equal(store.listTracks({market:'TW'}).length,1);
    assert.equal(store.listTracks({market:'TW'})[0].outcomes['1D'].returnPct,-.03);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('tracker refuses incomplete or mixed-date TW quote facts instead of fabricating a session',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-tracker-bad-'));
  try{
    const store=createDurableForwardResearchStore({filePath:path.join(dir,'forward.forward.jsonl'),now:()=>t0+5000});
    const tracker=createForwardResearchTracker({store});
    const bad={...twRow(),facts:Object.freeze([fact('price.close',100,t0),fact('price.high',102,t0+1),fact('price.low',98,t0)])};
    const result=tracker.ingest(home({tw:[Object.freeze(bad)]}));
    assert.equal(result.tw.created,0);
    assert.equal(result.tw.invalidSnapshots,1);
    assert.equal(store.listTracks({market:'TW'}).length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
