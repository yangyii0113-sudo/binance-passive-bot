(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_RESULTS_CONTRACTS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const RESULT_TYPES=Object.freeze(['TRADING_RESULTS','RESEARCH_RESULTS']);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const text=x=>typeof x==='string'&&x.length>0;
  const result=errors=>({ok:errors.length===0,errors});
  function validateResultEnvelope(v){
    const errors=[];
    if(!v||typeof v!=='object'||Array.isArray(v))return result(['OBJECT_REQUIRED']);
    if(!RESULT_TYPES.includes(v.type))errors.push('TYPE_INVALID');
    if(!Number.isInteger(v.sampleCount)||v.sampleCount<0)errors.push('SAMPLE_COUNT_INVALID');
    if(!finite(v.asOf)||v.asOf<0)errors.push('ASOF_INVALID');
    if(!text(v.source))errors.push('SOURCE_REQUIRED');
    if(v.type==='TRADING_RESULTS'){
      if(v.market!=='CRYPTO')errors.push('TRADING_MARKET_INVALID');
      if(v.researchOnly!==false)errors.push('TRADING_RESEARCH_FLAG_INVALID');
    }
    if(v.type==='RESEARCH_RESULTS'){
      if(!['US','TW'].includes(v.market))errors.push('RESEARCH_MARKET_INVALID');
      if(v.researchOnly!==true)errors.push('RESEARCH_ONLY_REQUIRED');
    }
    return result(errors);
  }
  return Object.freeze({RESULT_TYPES,validateResultEnvelope});
});