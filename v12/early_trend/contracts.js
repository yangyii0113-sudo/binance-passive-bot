(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_EARLY_TREND_CONTRACTS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STAGES=Object.freeze(['DETECT','EARLY_WATCH','ACCUMULATION','CONFIRMING','READY']);
  const EVIDENCE_FAMILIES=Object.freeze(['SMART_MONEY','INSTITUTIONAL','EXPECTATION','OPTIONS','BREADTH','ROTATION','LEAD_LAG','VOLATILITY','DIVERGENCE','ONCHAIN']);
  const DIRECTIONS=Object.freeze(['POSITIVE','NEGATIVE','NEUTRAL','MIXED','UNAVAILABLE']);
  const STATUSES=Object.freeze(['LIVE','DELAYED','SNAPSHOT','STALE','UNAVAILABLE']);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const result=errors=>({ok:errors.length===0,errors});
  function validateFusionResult(value){
    const errors=[];
    if(!value||typeof value!=='object'||Array.isArray(value))return result(['OBJECT_REQUIRED']);
    if(!STAGES.includes(value.stage))errors.push('STAGE_INVALID');
    if(!DIRECTIONS.includes(value.direction))errors.push('DIRECTION_INVALID');
    if(!finite(value.confidence)||value.confidence<0||value.confidence>1)errors.push('CONFIDENCE_INVALID');
    if(!Number.isInteger(value.evidenceFamilyCount)||value.evidenceFamilyCount<0)errors.push('EVIDENCE_FAMILY_COUNT_INVALID');
    for(const key of ['supportingEvidence','contradictions','invalidations','nextConfirmation'])if(!Array.isArray(value[key]))errors.push(key.toUpperCase()+'_REQUIRED');
    if(!finite(value.asOf)||value.asOf<0)errors.push('ASOF_INVALID');
    if(value.researchOnly!==true)errors.push('RESEARCH_ONLY_REQUIRED');
    return result(errors);
  }
  return Object.freeze({STAGES,EVIDENCE_FAMILIES,DIRECTIONS,STATUSES,validateFusionResult});
});