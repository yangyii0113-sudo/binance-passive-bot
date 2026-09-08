(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_INTELLIGENCE_CONTRACTS);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_REGIONAL_ENGINE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const STATUS_WEIGHT=Object.freeze({LIVE:1,DELAYED:.75,SNAPSHOT:.5,STALE:0,UNAVAILABLE:0});
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const text=x=>typeof x==='string'&&x.length>0;
  const round=x=>Number(x.toFixed(6));
  function biasFor(score){
    if(score>=.65)return'STRONG_BULLISH';
    if(score>=.2)return'BULLISH';
    if(score<=-.65)return'STRONG_BEARISH';
    if(score<=-.2)return'BEARISH';
    return'NEUTRAL';
  }
  function validEvidence(x,nowMs){
    return x&&typeof x==='object'&&!Array.isArray(x)&&text(x.family)&&finite(x.direction)&&x.direction>=-1&&x.direction<=1&&finite(x.confidence)&&x.confidence>=0&&x.confidence<=1&&C.EVIDENCE_STATUSES.includes(x.status)&&finite(x.asOf)&&x.asOf>=0&&x.asOf<=nowMs&&text(x.source);
  }
  function evaluateRegion(region,evidence,nowMs){
    if(!C.REGION_IDS.includes(region))throw Error('REGION_INVALID');
    if(!Array.isArray(evidence))throw Error('EVIDENCE_REQUIRED');
    if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');
    const excluded=[],usable=[];
    for(const item of evidence){
      if(!validEvidence(item,nowMs)){excluded.push(item);continue}
      const statusWeight=STATUS_WEIGHT[item.status];
      if(statusWeight<=0){excluded.push(item);continue}
      usable.push({...item,effectiveWeight:item.confidence*statusWeight});
    }
    if(!usable.length){
      const out={region,bias:'UNAVAILABLE',score:null,confidence:0,asOf:nowMs,evidence:[],contradictions:[],excluded,researchOnly:true};
      const checked=C.validateRegionalSnapshot(out);if(!checked.ok)throw Error(checked.errors.join('|'));return out;
    }
    const weight=usable.reduce((a,x)=>a+x.effectiveWeight,0);
    const score=weight>0?usable.reduce((a,x)=>a+x.direction*x.effectiveWeight,0)/weight:0;
    const families=new Set(usable.map(x=>x.family)).size;
    const confidence=Math.min(1,weight/Math.max(3,families));
    const sign=score===0?0:score>0?1:-1;
    const contradictions=usable.filter(x=>sign&&Math.abs(x.direction)>=.2&&Math.sign(x.direction)!==sign).map(({effectiveWeight,...x})=>x);
    const supports=usable.filter(x=>!sign||Math.abs(x.direction)<.2||Math.sign(x.direction)===sign).map(({effectiveWeight,...x})=>x);
    const out={region,bias:biasFor(score),score:round(score),confidence:round(confidence),asOf:Math.max(...usable.map(x=>x.asOf)),evidence:supports,contradictions,excluded,researchOnly:true};
    const checked=C.validateRegionalSnapshot(out);if(!checked.ok)throw Error(checked.errors.join('|'));return out;
  }
  return Object.freeze({STATUS_WEIGHT,evaluateRegion});
});