(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_INTELLIGENCE_CONTRACTS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const REGION_IDS=Object.freeze(['US','TW','CN_HK','JP','KR','EU','CRYPTO']);
  const BIAS_STATES=Object.freeze(['STRONG_BULLISH','BULLISH','NEUTRAL','BEARISH','STRONG_BEARISH','UNAVAILABLE']);
  const EVIDENCE_STATUSES=Object.freeze(['LIVE','DELAYED','SNAPSHOT','STALE','UNAVAILABLE']);
  const result=(value,errors)=>({ok:errors.length===0,errors,value});
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  function validateRegionalSnapshot(value){
    const errors=[];
    if(!value||typeof value!=='object'||Array.isArray(value))return result(value,['OBJECT_REQUIRED']);
    if(!REGION_IDS.includes(value.region))errors.push('REGION_INVALID');
    if(!BIAS_STATES.includes(value.bias))errors.push('BIAS_INVALID');
    if(value.bias!=='UNAVAILABLE'&&(!finite(value.score)||value.score<-1||value.score>1))errors.push('SCORE_INVALID');
    if(!finite(value.confidence)||value.confidence<0||value.confidence>1)errors.push('CONFIDENCE_INVALID');
    if(!finite(value.asOf)||value.asOf<0)errors.push('ASOF_INVALID');
    if(!Array.isArray(value.evidence))errors.push('EVIDENCE_REQUIRED');
    if(!Array.isArray(value.contradictions))errors.push('CONTRADICTIONS_REQUIRED');
    if(value.researchOnly!==true)errors.push('RESEARCH_ONLY_REQUIRED');
    return result(value,errors);
  }
  return Object.freeze({REGION_IDS,BIAS_STATES,EVIDENCE_STATUSES,validateRegionalSnapshot});
});