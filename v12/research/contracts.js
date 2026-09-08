(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_RESEARCH_CONTRACTS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const RESEARCH_DIRECTIONS=Object.freeze(['POSITIVE','NEUTRAL','NEGATIVE','MIXED','UNAVAILABLE']);
  const US_DIMENSIONS=Object.freeze(['TREND','MOMENTUM','FUNDAMENTAL','EXPECTATION','FLOW','RISK']);
  const TW_DIMENSIONS=Object.freeze(['TREND','MOMENTUM','REVENUE','FUNDAMENTAL','INSTITUTIONAL','MARGIN_SHORT','SECTOR','OVERSEAS_LINK','RISK']);
  const FORBIDDEN_KEYS=Object.freeze(['executionState','executionAllowed','order','placeOrder','action']);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const text=x=>typeof x==='string'&&x.length>0;
  const result=errors=>({ok:errors.length===0,errors});
  function validateResearchRead(value){
    const errors=[];
    if(!value||typeof value!=='object'||Array.isArray(value))return result(['OBJECT_REQUIRED']);
    if(!['US','TW'].includes(value.market))errors.push('MARKET_INVALID');
    if(!text(value.instrumentId))errors.push('INSTRUMENT_ID_REQUIRED');
    if(!RESEARCH_DIRECTIONS.includes(value.direction))errors.push('DIRECTION_INVALID');
    if(!finite(value.confidence)||value.confidence<0||value.confidence>1)errors.push('CONFIDENCE_INVALID');
    if(!value.dimensions||typeof value.dimensions!=='object'||Array.isArray(value.dimensions))errors.push('DIMENSIONS_REQUIRED');
    for(const key of ['evidence','contradictions','missingDimensions'])if(!Array.isArray(value[key]))errors.push(key.toUpperCase()+'_REQUIRED');
    if(!finite(value.asOf)||value.asOf<0)errors.push('ASOF_INVALID');
    if(value.researchOnly!==true)errors.push('RESEARCH_ONLY_REQUIRED');
    for(const key of FORBIDDEN_KEYS)if(Object.hasOwn(value,key))errors.push('EXECUTION_FIELD_FORBIDDEN:'+key);
    return result(errors);
  }
  return Object.freeze({RESEARCH_DIRECTIONS,US_DIMENSIONS,TW_DIMENSIONS,FORBIDDEN_KEYS,validateResearchRead});
});