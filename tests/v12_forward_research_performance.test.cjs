'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Perf=require('../v12/results/forward_performance.js');

const day=86400000;
const t0=Date.parse('2026-09-10T05:30:00Z');

function trackInput(overrides={}){
  return {
    id:'fwd:TWSE:2330:2026-09-10:POSITIVE',market:'TW',instrumentId:'TWSE:2330',direction:'POSITIVE',
    researchScore:82,priority:'優先覆核',createdAt:t0+1000,
    baseline:{sessionDate:'2026-09-10',close:100,asOf:t0,source:'TWSE:STOCK_DAY_ALL'},
    regime:{state:'BROAD_ADVANCE',label:'廣泛上漲',asOf:t0,source:'TW_MARKET_CORE'},
    researchOnly:true,executionWrite:false,...overrides
  };
}
function session(n,{close=100+n,high=102+n,low=99,source='TWSE:STOCK_DAY_ALL'}={}){
  const date=new Date(Date.parse('2026-09-10T00:00:00Z')+n*day).toISOString().slice(0,10);
  return {sessionDate:date,close,high,low,asOf:t0+n*day,source,fullyClosed:true};
}

test('forward track freezes baseline and regime without execution authority',()=>{
  const track=Perf.createForwardTrack(trackInput());
  assert.equal(track.validationMode,'FORWARD_ONLY');
  assert.equal(track.regime.state,'BROAD_ADVANCE');
  assert.equal(track.baseline.close,100);
  assert.equal(Object.isFrozen(track),true);
  assert.equal(track.researchOnly,true);
  assert.equal(track.executionWrite,false);
  assert.doesNotMatch(JSON.stringify(track),/positionId|orderId|leverage|fill|pnl/i);
});

test('closed sessions are strictly forward-only, fully closed, unique and cannot be backfilled',()=>{
  let track=Perf.createForwardTrack(trackInput());
  assert.throws(()=>Perf.recordClosedSession(track,{...session(1),fullyClosed:false}),/FULLY_CLOSED_SESSION_REQUIRED/);
  assert.throws(()=>Perf.recordClosedSession(track,{...session(1),asOf:t0}),/FORWARD_ONLY_REQUIRED/);
  track=Perf.recordClosedSession(track,session(1));
  assert.throws(()=>Perf.recordClosedSession(track,session(1)),/DUPLICATE_SESSION/);
  assert.throws(()=>Perf.recordClosedSession(track,{...session(2),sessionDate:'2026-09-09'}),/BACKFILL_FORBIDDEN/);
});

test('1D 5D 20D outcomes compute directional return plus cumulative MFE and MAE from closed sessions only',()=>{
  let track=Perf.createForwardTrack(trackInput());
  for(let i=1;i<=20;i++)track=Perf.recordClosedSession(track,session(i,{close:100+i,high:102+i,low:i<4?95:98}));
  assert.equal(track.status,'COMPLETE');
  assert.deepEqual(Object.keys(track.outcomes),['1D','5D','20D']);
  assert.equal(track.outcomes['1D'].returnPct,.01);
  assert.equal(track.outcomes['1D'].directionalReturnPct,.01);
  assert.equal(track.outcomes['1D'].hit,true);
  assert.equal(track.outcomes['1D'].mfePct,.03);
  assert.equal(track.outcomes['1D'].maePct,-.05);
  assert.equal(track.outcomes['5D'].returnPct,.05);
  assert.equal(track.outcomes['5D'].mfePct,.07);
  assert.equal(track.outcomes['5D'].maePct,-.05);
  assert.equal(track.outcomes['20D'].returnPct,.2);
  assert.equal(track.outcomes['20D'].mfePct,.22);
  assert.equal(track.outcomes['20D'].maePct,-.05);
});

test('negative research inverts follow-through, MFE and MAE correctly',()=>{
  let track=Perf.createForwardTrack(trackInput({id:'neg',direction:'NEGATIVE'}));
  track=Perf.recordClosedSession(track,session(1,{close:95,high:103,low:92}));
  const out=track.outcomes['1D'];
  assert.equal(out.returnPct,-.05);
  assert.equal(out.directionalReturnPct,.05);
  assert.equal(out.hit,true);
  assert.equal(out.mfePct,.08);
  assert.equal(out.maePct,-.03);
});

test('summary keeps TW and US separate and reports hit rate, mean directional return, MFE, MAE and regime breakdown',()=>{
  let a=Perf.createForwardTrack(trackInput({id:'a'}));
  let b=Perf.createForwardTrack(trackInput({id:'b',instrumentId:'TWSE:2317',baseline:{sessionDate:'2026-09-10',close:100,asOf:t0,source:'TWSE'},regime:{state:'BROAD_ADVANCE',label:'廣泛上漲',asOf:t0,source:'TW_MARKET_CORE'}}));
  a=Perf.recordClosedSession(a,session(1,{close:110,high:112,low:98}));
  b=Perf.recordClosedSession(b,session(1,{close:95,high:101,low:94}));
  const tw=Perf.summarizeForwardPerformance([a,b],{market:'TW',asOf:t0+2*day});
  assert.equal(tw.type,'RESEARCH_RESULTS');
  assert.equal(tw.validationMode,'FORWARD_ONLY');
  assert.equal(tw.market,'TW');
  assert.equal(tw.horizons['1D'].sampleCount,2);
  assert.equal(tw.horizons['1D'].hitRate,.5);
  assert.equal(tw.horizons['1D'].meanDirectionalReturnPct,.025);
  assert.equal(tw.horizons['1D'].meanMfePct,.065);
  assert.equal(tw.horizons['1D'].meanMaePct,-.04);
  assert.equal(tw.horizons['1D'].sampleStatus,'SAMPLE_INSUFFICIENT');
  assert.equal(tw.regimes.BROAD_ADVANCE.horizons['1D'].sampleCount,2);
  assert.equal('winRate' in tw,false);
  assert.equal(tw.researchOnly,true);
  assert.equal(tw.executionWrite,false);
  const us=Perf.summarizeForwardPerformance([a,b],{market:'US',asOf:t0+2*day});
  assert.equal(us.horizons['1D'].sampleCount,0);
});

test('regime and baseline timestamps cannot use future knowledge',()=>{
  assert.throws(()=>Perf.createForwardTrack(trackInput({baseline:{sessionDate:'2026-09-10',close:100,asOf:t0+5000,source:'TWSE'}})),/LOOKAHEAD_FORBIDDEN/);
  assert.throws(()=>Perf.createForwardTrack(trackInput({regime:{state:'BROAD_ADVANCE',label:'廣泛上漲',asOf:t0+5000,source:'TW_MARKET_CORE'}})),/LOOKAHEAD_FORBIDDEN/);
});
