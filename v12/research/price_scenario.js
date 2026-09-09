(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_PRICE_SCENARIO=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const text=x=>typeof x==='string'&&x.trim().length>0;
  function validateScenario(value,topAsOf){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('SCENARIO_REQUIRED');
    if(Object.hasOwn(value,'target'))throw Error('UNCONDITIONAL_TARGET_FORBIDDEN');
    if(!Array.isArray(value.conditions)||!value.conditions.length||value.conditions.some(x=>!text(x)))throw Error('CONDITIONS_REQUIRED');
    if(!value.zone||!finite(value.zone.low)||!finite(value.zone.high)||value.zone.low<=0||value.zone.high<=0||value.zone.low>value.zone.high)throw Error('ZONE_INVALID');
    if(!text(value.invalidation))throw Error('INVALIDATION_REQUIRED');
    if(!text(value.volatilityContext))throw Error('VOLATILITY_CONTEXT_REQUIRED');
    if(!text(value.catalystContext))throw Error('CATALYST_CONTEXT_REQUIRED');
    if(!text(value.provenance))throw Error('PROVENANCE_REQUIRED');
    if(!finite(value.asOf)||value.asOf<0||value.asOf>topAsOf)throw Error('SCENARIO_ASOF_INVALID');
    return Object.freeze({...value,conditions:Object.freeze([...value.conditions]),zone:Object.freeze({...value.zone}),conditional:true});
  }
  function buildPriceScenarios(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INPUT_REQUIRED');
    if(!text(input.instrumentId))throw Error('INSTRUMENT_ID_REQUIRED');
    if(!['US','TW'].includes(input.market))throw Error('MARKET_INVALID');
    if(!finite(input.asOf)||input.asOf<0)throw Error('ASOF_INVALID');
    return Object.freeze({instrumentId:input.instrumentId,market:input.market,asOf:input.asOf,researchOnly:true,scenarios:Object.freeze({BULL_CASE:validateScenario(input.bull,input.asOf),BASE_CASE:validateScenario(input.base,input.asOf),BEAR_CASE:validateScenario(input.bear,input.asOf)})});
  }
  return Object.freeze({buildPriceScenarios});
});