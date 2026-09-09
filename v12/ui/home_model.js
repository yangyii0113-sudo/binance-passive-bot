(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_HOME_MODEL=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const REGIONS=Object.freeze(['US','TW','CN_HK','JP','KR','EU','CRYPTO']);
  const PRIMARY_MARKETS=Object.freeze(['CRYPTO','US','TW']);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const unavailableRegion=(region,asOf)=>Object.freeze({region,status:'UNAVAILABLE',bias:'UNAVAILABLE',confidence:0,asOf,evidence:Object.freeze([]),contradictions:Object.freeze([]),researchOnly:true});
  const unavailablePulse=(market,asOf)=>Object.freeze({market,status:'UNAVAILABLE',asOf,data:null});
  const regionStatus=snapshot=>snapshot?.status==='AVAILABLE'?'AVAILABLE':snapshot?.status==='UNAVAILABLE'?'UNAVAILABLE':snapshot?.bias==='UNAVAILABLE'?'UNAVAILABLE':'AVAILABLE';
  function buildHomeModel(input={}){
    if(!finite(input.asOf)||input.asOf<0)throw Error('ASOF_INVALID');
    const regionMap=input.regions&&typeof input.regions==='object'?input.regions:{};
    const pulseMap=input.pulses&&typeof input.pulses==='object'?input.pulses:{};
    const regions=REGIONS.map(region=>regionMap[region]?Object.freeze({...regionMap[region],status:regionStatus(regionMap[region])}):unavailableRegion(region,input.asOf));
    const marketPulse=PRIMARY_MARKETS.map(market=>pulseMap[market]?Object.freeze({market,status:'AVAILABLE',...pulseMap[market]}):unavailablePulse(market,input.asOf));
    return Object.freeze({schema:'foxyya-home-model/1',asOf:input.asOf,regions:Object.freeze(regions),marketPulse:Object.freeze(marketPulse),todayFocus:Object.freeze(Array.isArray(input.todayFocus)?[...input.todayFocus]:[]),earlyTrend:Object.freeze(Array.isArray(input.earlyTrend)?[...input.earlyTrend]:[]),opportunities:Object.freeze(input.opportunities&&typeof input.opportunities==='object'?{...input.opportunities}:{CRYPTO:[],US:[],TW:[]}),events:Object.freeze(Array.isArray(input.events)?[...input.events]:[])});
  }
  return Object.freeze({REGIONS,PRIMARY_MARKETS,buildHomeModel});
});