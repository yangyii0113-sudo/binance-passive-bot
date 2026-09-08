(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_PROVIDER_CONTRACT=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CAPABILITIES=Object.freeze(['QUOTE','KLINE','FUNDAMENTAL','NEWS','MACRO','CALENDAR','FLOW','OPTIONS','DERIVATIVES']);
  const PROVIDER_MARKETS=Object.freeze(['CRYPTO','US','TW','KR','JP','CN_HK','EU','GLOBAL']);
  const TRANSPORTS=Object.freeze(['PUBLIC_READ_ONLY','FILE','INTERNAL_READ_ONLY']);
  const text=v=>typeof v==='string'&&v.length>0;
  const arr=v=>Array.isArray(v)&&v.length>0;
  const result=errors=>({ok:errors.length===0,errors});

  function validateProviderDescriptor(value){
    const errors=[];
    if(!value||typeof value!=='object'||Array.isArray(value))return result(['OBJECT_REQUIRED']);
    if(!text(value.id)||!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(value.id))errors.push('ID_INVALID');
    if(!text(value.sourceLabel))errors.push('SOURCE_LABEL_REQUIRED');
    if(!arr(value.markets)||value.markets.some(x=>!PROVIDER_MARKETS.includes(x)))errors.push('MARKET_INVALID');
    if(!arr(value.capabilities)||value.capabilities.some(x=>!CAPABILITIES.includes(x)))errors.push('CAPABILITY_INVALID');
    if(!TRANSPORTS.includes(value.transport))errors.push('TRANSPORT_INVALID');
    if(value.executionWrite!==false)errors.push('EXECUTION_WRITE_FORBIDDEN');
    if(!Number.isInteger(value.priority)||value.priority<0)errors.push('PRIORITY_INVALID');
    return result(errors);
  }

  function freezeDescriptor(value){
    const r=validateProviderDescriptor(value);
    if(!r.ok)throw Error(r.errors.join('|'));
    return Object.freeze({...value,markets:Object.freeze([...value.markets]),capabilities:Object.freeze([...value.capabilities])});
  }

  return Object.freeze({CAPABILITIES,PROVIDER_MARKETS,TRANSPORTS,validateProviderDescriptor,freezeDescriptor});
});