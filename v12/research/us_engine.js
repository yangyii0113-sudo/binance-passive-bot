(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_RESEARCH_CONTRACTS,
    typeof module==='object'&&module.exports?require('./evidence.js'):root.FOXY_V12_RESEARCH_EVIDENCE,
    typeof module==='object'&&module.exports?require('./earnings.js'):root.FOXY_V12_EARNINGS
  );
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_US_RESEARCH=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(R,E,G){
  'use strict';
  const text=x=>typeof x==='string'&&x.length>0;
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  function earningsContext(value){
    if(value==null)return null;
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('EARNINGS_INVALID');
    const out={...value};
    if(finite(value.actualEPS)&&finite(value.consensusEPS))out.epsSurprise=G.surprise(value.actualEPS,value.consensusEPS);
    if(finite(value.actualRevenue)&&finite(value.consensusRevenue))out.revenueSurprise=G.surprise(value.actualRevenue,value.consensusRevenue);
    if(finite(value.currentEstimateEPS)&&finite(value.priorEstimateEPS))out.epsRevision=G.revision(value.currentEstimateEPS,value.priorEstimateEPS);
    if(finite(value.currentEstimateRevenue)&&finite(value.priorEstimateRevenue))out.revenueRevision=G.revision(value.currentEstimateRevenue,value.priorEstimateRevenue);
    return Object.freeze(out);
  }
  function buildUSResearch(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INPUT_REQUIRED');
    if(!text(input.instrumentId)||!input.instrumentId.includes(':'))throw Error('INSTRUMENT_ID_INVALID');
    const aggregated=E.aggregateDimensions(R.US_DIMENSIONS,input.evidence||[],input.nowMs);
    const out={market:'US',instrumentId:input.instrumentId,direction:aggregated.direction,confidence:aggregated.confidence,dimensions:aggregated.dimensions,evidence:aggregated.evidence,contradictions:aggregated.contradictions,missingDimensions:aggregated.missingDimensions,asOf:aggregated.asOf,researchOnly:true,earnings:earningsContext(input.earnings),earlyTrend:input.earlyTrend&&input.earlyTrend.researchOnly===true?input.earlyTrend:null};
    const checked=R.validateResearchRead(out);if(!checked.ok)throw Error('RESEARCH_INVALID:'+checked.errors.join('|'));
    return Object.freeze(out);
  }
  return Object.freeze({buildUSResearch});
});