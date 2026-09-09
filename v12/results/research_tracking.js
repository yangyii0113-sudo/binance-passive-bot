(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_RESULTS_CONTRACTS);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_RESEARCH_TRACKING=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const TRACK_STATES=Object.freeze(['WATCH','EARLY','ACCUMULATING','READY','TRACKING','INVALIDATED']);
  const HORIZONS=Object.freeze(['1D','5D','20D']);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const text=x=>typeof x==='string'&&x.length>0;
  const round=x=>Number(x.toFixed(12));
  function validateBase(i){
    if(!i||typeof i!=='object'||Array.isArray(i))throw Error('INPUT_REQUIRED');
    if(!text(i.id)||!['US','TW'].includes(i.market)||!text(i.instrumentId))throw Error('IDENTITY_INVALID');
    if(!TRACK_STATES.includes(i.stage))throw Error('STAGE_INVALID');
    if(!['POSITIVE','NEGATIVE','NEUTRAL','MIXED','UNAVAILABLE'].includes(i.direction))throw Error('DIRECTION_INVALID');
    if(!finite(i.confidence)||i.confidence<0||i.confidence>1)throw Error('CONFIDENCE_INVALID');
    if(!i.baseline||!finite(i.baseline.price)||i.baseline.price<=0||!finite(i.baseline.asOf)||!text(i.baseline.source))throw Error('BASELINE_INVALID');
    if(!finite(i.createdAt)||i.createdAt<0)throw Error('CREATED_AT_INVALID');
  }
  function createResearchTrack(i){
    validateBase(i);
    const first=Object.freeze({stage:i.stage,at:i.createdAt,reason:'CREATED'});
    return Object.freeze({id:i.id,market:i.market,instrumentId:i.instrumentId,stage:i.stage,direction:i.direction,confidence:i.confidence,baseline:Object.freeze({...i.baseline}),createdAt:i.createdAt,updatedAt:i.createdAt,timeline:Object.freeze([first]),outcomes:Object.freeze({}),researchOnly:true});
  }
  function transitionTrack(track,stage,at,reason){
    if(!track?.researchOnly||!TRACK_STATES.includes(stage)||!finite(at)||at<track.updatedAt||!text(reason))throw Error('TRANSITION_INVALID');
    return Object.freeze({...track,stage,updatedAt:at,timeline:Object.freeze([...track.timeline,Object.freeze({stage,at,reason})])});
  }
  function recordOutcome(track,horizon,obs){
    if(!track?.researchOnly||!HORIZONS.includes(horizon))throw Error('OUTCOME_INPUT_INVALID');
    if(!obs||!finite(obs.price)||obs.price<=0||!finite(obs.asOf)||obs.asOf<track.baseline.asOf||!text(obs.source))throw Error('OUTCOME_OBSERVATION_INVALID');
    const returnPct=round(obs.price/track.baseline.price-1);
    const signedReturn=track.direction==='NEGATIVE'?round(-returnPct):track.direction==='POSITIVE'?returnPct:null;
    const outcome=Object.freeze({price:obs.price,asOf:obs.asOf,source:obs.source,returnPct,signedReturn});
    return Object.freeze({...track,updatedAt:Math.max(track.updatedAt,obs.asOf),outcomes:Object.freeze({...track.outcomes,[horizon]:outcome})});
  }
  function summarizeResearchResults(tracks,market,asOf){
    if(!Array.isArray(tracks)||!['US','TW'].includes(market)||!finite(asOf)||asOf<0)throw Error('SUMMARY_INPUT_INVALID');
    const rows=tracks.filter(t=>t?.researchOnly&&t.market===market);
    const horizons={};
    for(const h of HORIZONS){
      const xs=rows.map(t=>t.outcomes?.[h]).filter(Boolean);
      const signed=xs.map(x=>x.signedReturn).filter(finite);
      horizons[h]=Object.freeze({sampleCount:xs.length,averageReturn:xs.length?round(xs.reduce((a,x)=>a+x.returnPct,0)/xs.length):null,positiveFollowThroughRate:signed.length?signed.filter(x=>x>0).length/signed.length:null});
    }
    const out={type:'RESEARCH_RESULTS',market,sampleCount:rows.length,asOf,source:'research-tracking',researchOnly:true,horizons:Object.freeze(horizons),tracks:Object.freeze(rows)};
    const checked=C.validateResultEnvelope(out);if(!checked.ok)throw Error('RESULT_INVALID:'+checked.errors.join('|'));
    return Object.freeze(out);
  }
  return Object.freeze({TRACK_STATES,HORIZONS,createResearchTrack,transitionTrack,recordOutcome,summarizeResearchResults});
});