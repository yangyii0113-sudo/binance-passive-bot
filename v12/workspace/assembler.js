(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_WORKSPACE_CONTRACTS,
    typeof module==='object'&&module.exports?require('../core/market_core.js'):root.FOXY_V12_MARKET_CORE
  );
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_WORKSPACE_ASSEMBLER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(W,M){
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const section=data=>Object.freeze({state:data==null?'UNAVAILABLE':'AVAILABLE',data:data==null?null:data});
  function buildWorkspace(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INPUT_REQUIRED');
    const check=M.validateInstrument(input.instrument);
    if(!check.ok)throw Error('INSTRUMENT_INVALID:'+check.errors.join('|'));
    if(!finite(input.asOf)||input.asOf<0)throw Error('ASOF_INVALID');
    if(['US','TW'].includes(input.instrument.market)&&input.execution!=null)throw Error('EQUITY_EXECUTION_FORBIDDEN');
    const overviewData=(input.snapshot!=null||input.context!=null||input.earlyTrend!=null)?Object.freeze({snapshot:input.snapshot??null,context:input.context??null,earlyTrend:input.earlyTrend??null}):null;
    const sections=Object.freeze({OVERVIEW:section(overviewData),CHART:section(input.chart??null),ANALYSIS:section(input.analysis??null),MARKET_DATA:section(input.marketData??null),NEWS:section(input.news??null),HISTORY:section(input.history??null)});
    const out={market:input.instrument.market,instrumentId:input.instrument.instrumentId,instrument:Object.freeze({...input.instrument}),tabs:W.WORKSPACE_TABS,sections,asOf:input.asOf,researchOnly:input.instrument.market!=='CRYPTO',execution:input.instrument.market==='CRYPTO'?(input.execution??null):null};
    const validated=W.validateWorkspace(out);
    if(!validated.ok)throw Error('WORKSPACE_INVALID:'+validated.errors.join('|'));
    return Object.freeze(out);
  }
  return Object.freeze({buildWorkspace});
});