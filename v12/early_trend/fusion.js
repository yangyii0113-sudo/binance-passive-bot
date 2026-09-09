(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_EARLY_TREND_CONTRACTS);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_EARLY_TREND_FUSION=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const STATUS_WEIGHT=Object.freeze({LIVE:1,DELAYED:.75,SNAPSHOT:.5,STALE:0,UNAVAILABLE:0});
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const text=x=>typeof x==='string'&&x.length>0;
  const round=x=>Number(x.toFixed(6));

  function validEvidence(x,nowMs){
    return x&&typeof x==='object'&&!Array.isArray(x)&&C.EVIDENCE_FAMILIES.includes(x.family)&&finite(x.direction)&&x.direction>=-1&&x.direction<=1&&finite(x.confidence)&&x.confidence>=0&&x.confidence<=1&&C.STATUSES.includes(x.status)&&finite(x.asOf)&&x.asOf>=0&&x.asOf<=nowMs&&text(x.source);
  }

  function directionFor(score,positiveCount,negativeCount){
    if(score>=.15)return'POSITIVE';
    if(score<=-.15)return'NEGATIVE';
    if(positiveCount&&negativeCount)return'MIXED';
    return'NEUTRAL';
  }

  function stageFor(families,score,confidence){
    if(families<=1)return'DETECT';
    if(families===2)return'EARLY_WATCH';
    if(families===3)return'ACCUMULATION';
    if(families>=5&&Math.abs(score)>=.5&&confidence>=.6)return'READY';
    if(families>=4&&Math.abs(score)>=.35)return'CONFIRMING';
    return'ACCUMULATION';
  }

  function fuseEvidence(evidence,nowMs){
    if(!Array.isArray(evidence))throw Error('EVIDENCE_REQUIRED');
    if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');
    const bestByFamily=new Map(),excluded=[];
    for(const item of evidence){
      if(!validEvidence(item,nowMs)){excluded.push(item);continue}
      const statusWeight=STATUS_WEIGHT[item.status];
      if(statusWeight<=0){excluded.push(item);continue}
      const effectiveWeight=item.confidence*statusWeight;
      const basisCount=Number.isInteger(item.basisCount)&&item.basisCount>0?item.basisCount:1;
      const prev=bestByFamily.get(item.family);
      const better=!prev||effectiveWeight>prev.effectiveWeight||(effectiveWeight===prev.effectiveWeight&&basisCount>prev.basisCount)||(effectiveWeight===prev.effectiveWeight&&basisCount===prev.basisCount&&item.asOf>prev.asOf);
      if(better)bestByFamily.set(item.family,{...item,basisCount,effectiveWeight});
    }
    const usable=[...bestByFamily.values()];
    if(!usable.length){
      const out={stage:'DETECT',direction:'UNAVAILABLE',confidence:0,evidenceFamilyCount:0,supportingEvidence:[],contradictions:[],invalidations:[],nextConfirmation:[],asOf:nowMs,researchOnly:true,excluded};
      const v=C.validateFusionResult(out);if(!v.ok)throw Error(v.errors.join('|'));return out;
    }
    const totalWeight=usable.reduce((a,x)=>a+x.effectiveWeight,0);
    const score=totalWeight?usable.reduce((a,x)=>a+x.direction*x.effectiveWeight,0)/totalWeight:0;
    const sign=score===0?0:score>0?1:-1;
    const contradictions=usable.filter(x=>sign&&Math.abs(x.direction)>=.15&&Math.sign(x.direction)!==sign);
    const supporting=usable.filter(x=>!sign||Math.abs(x.direction)<.15||Math.sign(x.direction)===sign);
    const contradictionWeight=contradictions.reduce((a,x)=>a+x.effectiveWeight,0);
    const agreement=totalWeight?1-contradictionWeight/totalWeight:0;
    const baseConfidence=Math.min(1,totalWeight/Math.max(3,usable.length));
    const confidence=baseConfidence*(.5+.5*agreement);
    const positiveCount=usable.filter(x=>x.direction>=.15).length,negativeCount=usable.filter(x=>x.direction<=-.15).length;
    const invalidations=[...new Set(usable.map(x=>x.invalidation).filter(text))];
    const nextConfirmation=[...new Set(usable.map(x=>x.nextConfirmation).filter(text))];
    const clean=x=>{const {effectiveWeight,...rest}=x;return Object.freeze(rest)};
    const out={
      stage:stageFor(usable.length,score,confidence),
      direction:directionFor(score,positiveCount,negativeCount),
      confidence:round(confidence),
      score:round(score),
      evidenceFamilyCount:usable.length,
      supportingEvidence:supporting.map(clean),
      contradictions:contradictions.map(clean),
      invalidations,
      nextConfirmation,
      asOf:Math.max(...usable.map(x=>x.asOf)),
      researchOnly:true,
      excluded
    };
    const v=C.validateFusionResult(out);if(!v.ok)throw Error(v.errors.join('|'));return out;
  }

  return Object.freeze({fuseEvidence});
});