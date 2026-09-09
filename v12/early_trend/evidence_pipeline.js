'use strict';
const B=require('./evidence_builders.js');
const P=require('./evidence_policy.js');

function buildTw(policy,inputs){
  const flowParams=P.parametersFor(policy,'institutionalFlow');
  const persistenceParams=P.parametersFor(policy,'institutionalPersistence');
  const revenueParams=P.parametersFor(policy,'revenueAcceleration');
  const currentFlow=inputs?.currentFlow||{};
  return [
    B.buildInstitutionalFlowEvidence({instrumentId:inputs?.instrumentId,flowObservations:currentFlow.flowObservations,volumeObservation:currentFlow.volumeObservation,fullScaleRatio:flowParams.fullScaleRatio}),
    B.buildInstitutionalPersistenceEvidence({instrumentId:inputs?.instrumentId,sessions:inputs?.institutionalSessions,minSessions:persistenceParams.minSessions,fullScaleAverageRatio:persistenceParams.fullScaleAverageRatio}),
    B.buildRevenueAccelerationEvidence({current:inputs?.currentRevenue,previous:inputs?.previousRevenue,fullScalePct:revenueParams.fullScalePct}),
  ];
}

function buildJp(policy,inputs){
  const params=P.parametersFor(policy,'guidanceRevision');
  return [B.buildGuidanceRevisionEvidence({current:inputs?.currentFinancial,previous:inputs?.previousFinancial,fullScalePct:params.fullScalePct})];
}

function buildEvidenceSet({policy,market,inputs={}}={}){
  const frozen=P.freezeEvidencePolicy(policy);
  if(market!==undefined&&market!==frozen.market)throw Error('POLICY_MARKET_MISMATCH');
  let evidence;
  if(frozen.market==='TW')evidence=buildTw(frozen,inputs);
  else if(frozen.market==='JP')evidence=buildJp(frozen,inputs);
  else throw Error('POLICY_MARKET_UNSUPPORTED');
  return Object.freeze({schemaVersion:'foxyya-evidence-set/1',policyId:frozen.id,market:frozen.market,mode:frozen.mode,researchOnly:true,executionWrite:false,asOf:evidence.length?Math.max(...evidence.map(x=>Number.isFinite(x.asOf)?x.asOf:0)):0,evidence:Object.freeze(evidence)});
}

module.exports=Object.freeze({buildEvidenceSet});
