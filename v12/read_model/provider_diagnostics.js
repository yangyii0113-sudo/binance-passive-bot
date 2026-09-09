'use strict';

const {SOURCE_CATALOG}=require('../providers/source_catalog.js');
const safeReason=value=>typeof value==='string'?value.split(':')[0].replace(/[^A-Z0-9_]/g,'').slice(0,80)||'SOURCE_UNAVAILABLE':null;

function buildProviderDiagnostics({asOf,providerHealth={},datasets=[]}){
  const providers=Object.entries(providerHealth).map(([providerId,row])=>Object.freeze({
    providerId,name:SOURCE_CATALOG.find(x=>x.id===providerId)?.provider||providerId,
    health:row.health,lastSuccessAt:row.lastSuccessAt,lastFailureAt:row.lastFailureAt,
    lastLatencyMs:row.lastLatencyMs,freshnessMs:row.freshnessMs,lastHttpStatus:row.lastHttpStatus,
    reason:safeReason(row.lastFailureOutcome),rateLimit:row.rateLimit,circuit:row.circuit
  }));
  const reads=datasets.map(row=>Object.freeze({...row,reason:safeReason(row.reason)}));
  return Object.freeze({
    schemaVersion:'foxyya-provider-diagnostics/1',asOf,
    status:!reads.length?'UNAVAILABLE':reads.some(x=>x.status!=='AVAILABLE')||providers.some(x=>x.health!=='HEALTHY')?'DEGRADED':'AVAILABLE',
    providers:Object.freeze(providers),datasets:Object.freeze(reads),researchOnly:true,executionWrite:false
  });
}

module.exports=Object.freeze({buildProviderDiagnostics});
