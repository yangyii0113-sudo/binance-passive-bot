const test=require('node:test');
const assert=require('node:assert/strict');
const T=require('../v12/results/research_tracking.js');

test('research track is not a position or fill',()=>{
  const t=T.createResearchTrack({id:'r1',market:'US',instrumentId:'NASDAQ:NVDA',stage:'EARLY',direction:'POSITIVE',confidence:.7,baseline:{price:100,asOf:1000,source:'fixture'},createdAt:1000});
  assert.equal(t.researchOnly,true);
  assert.equal('positionId' in t,false);
  assert.equal('fill' in t,false);
});

test('research stage transition is explicit',()=>{
  const t=T.createResearchTrack({id:'r1',market:'TW',instrumentId:'TWSE:2330',stage:'ACCUMULATING',direction:'POSITIVE',confidence:.7,baseline:{price:100,asOf:1000,source:'fixture'},createdAt:1000});
  const next=T.transitionTrack(t,'READY',1100,'evidence confirmed');
  assert.equal(next.stage,'READY');
  assert.equal(next.timeline.length,2);
});

test('research outcomes calculate follow-through without creating trade pnl',()=>{
  const t=T.createResearchTrack({id:'r1',market:'US',instrumentId:'NASDAQ:NVDA',stage:'READY',direction:'POSITIVE',confidence:.8,baseline:{price:100,asOf:1000,source:'fixture'},createdAt:1000});
  const with1=T.recordOutcome(t,'1D',{price:105,asOf:2000,source:'fixture'});
  assert.equal(with1.outcomes['1D'].returnPct,.05);
  assert.equal('pnl' in with1.outcomes['1D'],false);
});

test('research summary is separate from trading win rate',()=>{
  let a=T.createResearchTrack({id:'a',market:'US',instrumentId:'NASDAQ:A',stage:'TRACKING',direction:'POSITIVE',confidence:.8,baseline:{price:100,asOf:1,source:'x'},createdAt:1});
  let b=T.createResearchTrack({id:'b',market:'US',instrumentId:'NASDAQ:B',stage:'TRACKING',direction:'POSITIVE',confidence:.8,baseline:{price:100,asOf:1,source:'x'},createdAt:1});
  a=T.recordOutcome(a,'5D',{price:110,asOf:5,source:'x'}); b=T.recordOutcome(b,'5D',{price:95,asOf:5,source:'x'});
  const r=T.summarizeResearchResults([a,b],'US',10);
  assert.equal(r.type,'RESEARCH_RESULTS');
  assert.equal(r.horizons['5D'].sampleCount,2);
  assert.equal(r.horizons['5D'].positiveFollowThroughRate,.5);
  assert.equal('winRate' in r,false);
});