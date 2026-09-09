(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_LAB_CONTRACTS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LAB_MODES=Object.freeze(['CONTROL','SHADOW']);
  const LAB_MARKETS=Object.freeze(['CRYPTO','US','TW','CROSS']);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const text=x=>typeof x==='string'&&x.length>0;
  const result=errors=>({ok:errors.length===0,errors});
  function validateVersion(v){
    const errors=[];
    if(!v||typeof v!=='object'||Array.isArray(v))return result(['OBJECT_REQUIRED']);
    for(const k of ['id','modelId','version'])if(!text(v[k]))errors.push(k.toUpperCase()+'_REQUIRED');
    if(!LAB_MARKETS.includes(v.market))errors.push('MARKET_INVALID');
    if(!LAB_MODES.includes(v.mode))errors.push('MODE_INVALID');
    if(!finite(v.createdAt)||v.createdAt<0)errors.push('CREATED_AT_INVALID');
    if(!text(v.rulesHash)||!/^[a-f0-9]{64}$/i.test(v.rulesHash))errors.push('RULES_HASH_INVALID');
    return result(errors);
  }
  return Object.freeze({LAB_MODES,LAB_MARKETS,validateVersion});
});