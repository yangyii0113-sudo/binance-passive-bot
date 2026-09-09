(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_RESEARCH_CONTRACTS);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_RESEARCH_EVIDENCE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(R){
  'use strict';
  const STATUS_WEIGHT=Object.freeze({LIVE:1,DELAYED:.75,SNAPSHOT:.5,STALE:0,UNAVAILABLE:0});
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const text=x=>typeof x==='string'&&x.length>0;
  const round=x=>Number(x.toFixed(6));
  function directionFor(score,hasPos=false,hasNeg=false){
    if(score>=.15)return'POSITIVE';
    if(score<=-.15)return'NEGATIVE';
    if(hasPos&&hasNeg)return'MIXED';
    return'NEUTRAL';
  }
  function valid(x,expected,nowMs){
    return x&&typeof x==='object'&&!Array.isArray(x)&&expected.includes(x.dimension)&&finite(x.score)&&x.score>=-1&&x.score<=1&&finite(x.confidence)&&x.confidence>=0&&x.confidence<=1&&Object.hasOwn(STATUS_WEIGHT,x.status)&&finite(x.asOf)&&x.asOf>=0&&x.asOf<=nowMs&&text(x.source)&&text(x.label);
  }
  function aggregateDimensions(expectedDimensions,evidence,nowMs){
    if(!Array.isArray(expectedDimensions)||!expectedDimensions.length)throw Error('DIMENSIONS_REQUIRED');
    if(!Array.isArray(evidence))throw Error('EVIDENCE_REQUIRED');
    if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');
    const selected=new Map(),excluded=[];
    for(const item of evidence){
      if(!valid(item,expectedDimensions,nowMs)){excluded.push(item);continue}
      const statusWeight=STATUS_WEIGHT[item.status];
      if(statusWeight<=0){excluded.push(item);continue}
      const effectiveWeight=item.confidence*statusWeight;
      const key=item.dimension+'|'+item.source;
      const prev=selected.get(key);
      if(!prev||effectiveWeight>prev.effectiveWeight||(effectiveWeight===prev.effectiveWeight&&Math.abs(item.score)>Math.abs(prev.score))) selected.set(key,{...item,effectiveWeight});
    }
    const usable=[...selected.values()];
    const dimensions={}; const contradictions=[];
    for(const dimension of expectedDimensions){
      const items=usable.filter(x=>x.dimension===dimension);
      if(!items.length)continue;
      const weight=items.reduce((a,x)=>a+x.effectiveWeight,0);
      const score=weight?items.reduce((a,x)=>a+x.score*x.effectiveWeight,0)/weight:0;
      const hasPos=items.some(x=>x.score>=.15),hasNeg=items.some(x=>x.score<=-.15);
      const direction=directionFor(score,hasPos,hasNeg);
      const sign=score===0?0:Math.sign(score);
      const conflicts=items.filter(x=>sign&&Math.abs(x.score)>=.15&&Math.sign(x.score)!==sign);
      contradictions.push(...conflicts.map(({effectiveWeight,...x})=>x));
      dimensions[dimension]=Object.freeze({direction,score:round(score),confidence:round(Math.min(1,weight/items.length)),evidenceCount:items.length});
    }
    const present=Object.keys(dimensions);
    const missingDimensions=expectedDimensions.filter(x=>!Object.hasOwn(dimensions,x));
    if(!present.length)return Object.freeze({direction:'UNAVAILABLE',score:null,confidence:0,dimensions:Object.freeze({}),evidence:Object.freeze([]),contradictions:Object.freeze([]),missingDimensions:Object.freeze([...expectedDimensions]),excluded:Object.freeze(excluded),asOf:nowMs});
    const dimensionRows=present.map(k=>dimensions[k]);
    const totalDimWeight=dimensionRows.reduce((a,x)=>a+x.confidence,0);
    const overallScore=totalDimWeight?dimensionRows.reduce((a,x)=>a+x.score*x.confidence,0)/totalDimWeight:0;
    const hasPos=dimensionRows.some(x=>x.score>=.15),hasNeg=dimensionRows.some(x=>x.score<=-.15);
    const coverage=present.length/expectedDimensions.length;
    const avgConfidence=dimensionRows.reduce((a,x)=>a+x.confidence,0)/dimensionRows.length;
    const clean=usable.map(({effectiveWeight,...x})=>Object.freeze(x));
    return Object.freeze({direction:directionFor(overallScore,hasPos,hasNeg),score:round(overallScore),confidence:round(avgConfidence*coverage),dimensions:Object.freeze(dimensions),evidence:Object.freeze(clean),contradictions:Object.freeze(contradictions),missingDimensions:Object.freeze(missingDimensions),excluded:Object.freeze(excluded),asOf:Math.max(...usable.map(x=>x.asOf))});
  }
  return Object.freeze({STATUS_WEIGHT,aggregateDimensions});
});