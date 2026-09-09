(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_RESEARCH_CONTRACTS,
    typeof module==='object'&&module.exports?require('./evidence.js'):root.FOXY_V12_RESEARCH_EVIDENCE
  );
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_TW_RESEARCH=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(R,E){
  'use strict';
  const text=x=>typeof x==='string'&&x.length>0;
  function buildTWResearch(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INPUT_REQUIRED');
    if(!text(input.instrumentId)||!input.instrumentId.includes(':'))throw Error('INSTRUMENT_ID_INVALID');
    const aggregated=E.aggregateDimensions(R.TW_DIMENSIONS,input.evidence||[],input.nowMs);
    const institutionalBreakdown=aggregated.evidence.filter(x=>x.dimension==='INSTITUTIONAL'&&x.metadata&&typeof x.metadata==='object'&&!Array.isArray(x.metadata)).map(x=>Object.freeze({source:x.source,asOf:x.asOf,metadata:Object.freeze({...x.metadata})}));
    const out={market:'TW',instrumentId:input.instrumentId,direction:aggregated.direction,confidence:aggregated.confidence,dimensions:aggregated.dimensions,evidence:aggregated.evidence,contradictions:aggregated.contradictions,missingDimensions:aggregated.missingDimensions,asOf:aggregated.asOf,researchOnly:true,institutionalBreakdown:Object.freeze(institutionalBreakdown),earlyTrend:input.earlyTrend&&input.earlyTrend.researchOnly===true?input.earlyTrend:null};
    const checked=R.validateResearchRead(out);if(!checked.ok)throw Error('RESEARCH_INVALID:'+checked.errors.join('|'));
    return Object.freeze(out);
  }
  return Object.freeze({buildTWResearch});
});