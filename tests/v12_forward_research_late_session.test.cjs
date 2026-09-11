'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createDurableForwardResearchStore}=require('../v12/staging/durable_forward_research_store.js');
const {createForwardResearchTracker}=require('../v12/staging/forward_research_tracker.js');

const baselineAsOf=Date.parse('2026-09-10T05:30:00Z');
const createdAt=Date.parse('2026-09-11T06:00:00Z');
const lateSessionAsOf=Date.parse('2026-09-11T05:30:00Z');
const refreshAsOf=Date.parse('2026-09-11T09:30:00Z');

function fact(field,value,asOf){return Object.freeze({field,value,unit:'TWD',status:'SNAPSHOT',source:'TWSE:STOCK_DAY_ALL',observedAt:asOf,receivedAt:asOf});}
function twRow(asOf,close,high,low){return Object.freeze({market:'TW',instrumentId:'TWSE:2330',asOf,rank:1,researchScore:82,priority:'優先覆核',facts:Object.freeze([fact('price.high',high,asOf),fact('price.low',low,asOf),fact('price.close',close,asOf)]),dataGaps:Object.freeze({}),research:Object.freeze({direction:'POSITIVE',confidence:.78,dimensions:Object.freeze({TREND:'POSITIVE'}),missingDimensions:Object.freeze([]),contradictions:Object.freeze([])}),earlyTrend:Object.freeze({stage:'CONFIRMING',confidence:.7}),researchOnly:true,executionWrite:false});}
function home(asOf,row){return Object.freeze({schemaVersion:'foxyya-home-read-model/1',asOf,home:Object.freeze({regions:Object.freeze([]),marketPulse:Object.freeze([Object.freeze({market:'TW',status:'AVAILABLE',state:'BROAD_ADVANCE',asOf,data:Object.freeze({directionCoverage:'FULL'})})]),earlyTrend:Object.freeze([]),opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([row])}),events:Object.freeze([]),todayFocus:Object.freeze([])}),cryptoExecution:null,cryptoResults:null,providerDiagnostics:null,researchOnly:true,executionWrite:false});}

test('late provider catch-up session that closed before track creation is not counted as forward and does not abort refresh',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-forward-late-session-'));
  try{
    let now=createdAt+1000;
    const store=createDurableForwardResearchStore({filePath:path.join(dir,'forward.forward.jsonl'),now:()=>now});
    const tracker=createForwardResearchTracker({store});

    const first=tracker.ingest(home(createdAt,twRow(baselineAsOf,100,102,98)));
    assert.equal(first.tw.created,1);
    assert.equal(first.tw.sessionsRecorded,0);

    now=refreshAsOf+1000;
    const second=tracker.ingest(home(refreshAsOf,twRow(lateSessionAsOf,105,107,99)));
    assert.equal(second.tw.sessionsRecorded,0,'pre-creation catch-up must not become a forward outcome');
    assert.equal(second.tw.created,1,'newly available closed session may seed a new baseline');

    const tracks=store.listTracks({market:'TW'});
    assert.equal(tracks.length,2);
    const old=tracks.find(row=>row.baseline.asOf===baselineAsOf);
    const fresh=tracks.find(row=>row.baseline.asOf===lateSessionAsOf);
    assert.ok(old);
    assert.ok(fresh);
    assert.equal(old.sessions.length,0);
    assert.equal(fresh.sessions.length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
