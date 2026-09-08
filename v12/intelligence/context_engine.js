(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_INTELLIGENCE_CONTRACTS);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_CONTEXT_ENGINE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const text=x=>typeof x==='string'&&x.length>0;
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  function normalizeItems(name,items,asOf,requireConditional=false){
    if(!Array.isArray(items))throw Error(name.toUpperCase()+'_ARRAY_REQUIRED');
    return items.map((x,i)=>{
      if(!x||typeof x!=='object'||Array.isArray(x)||!text(x.text)||!text(x.source)||!finite(x.asOf)||x.asOf<0||x.asOf>asOf)throw Error(name.toUpperCase()+'_ITEM_INVALID_'+i);
      if(requireConditional&&x.conditional!==true)throw Error('SCENARIO_CONDITIONAL_REQUIRED');
      return Object.freeze({...x});
    });
  }
  function buildContext(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INPUT_REQUIRED');
    if(!finite(input.asOf)||input.asOf<0)throw Error('ASOF_INVALID');
    const regionCheck=C.validateRegionalSnapshot(input.regionSnapshot);
    if(!regionCheck.ok)throw Error('REGION_SNAPSHOT_INVALID:'+regionCheck.errors.join('|'));
    const facts=normalizeItems('facts',input.facts,input.asOf);
    const expectations=normalizeItems('expectations',input.expectations,input.asOf);
    const scenarios=normalizeItems('scenarios',input.scenarios,input.asOf,true);
    const rotation=normalizeItems('rotation',input.rotation,input.asOf);
    const catalysts=normalizeItems('catalysts',input.catalysts,input.asOf);
    const risks=normalizeItems('risks',input.risks,input.asOf);
    return Object.freeze({
      region:input.regionSnapshot.region,
      marketBias:input.regionSnapshot.bias,
      score:input.regionSnapshot.score,
      confidence:input.regionSnapshot.confidence,
      asOf:input.asOf,
      facts:Object.freeze(facts),
      expectations:Object.freeze(expectations),
      scenarios:Object.freeze(scenarios),
      rotation:Object.freeze(rotation),
      catalysts:Object.freeze(catalysts),
      risks:Object.freeze(risks),
      researchOnly:true
    });
  }
  return Object.freeze({buildContext});
});