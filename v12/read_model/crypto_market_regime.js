'use strict';

const STATES=Object.freeze(['RISK_ON','RISK_OFF','NEUTRAL_ROTATION']);
const METHOD='BTC_ETH_SOL_24H_RETURNS_PLUS_ELIGIBLE_UNIVERSE_BREADTH_PLUS_VOLATILITY';
const DEFAULT_STALE_MS=2*60*60*1000;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);

function validateExecution(execution){
  if(!object(execution)||execution.schema!=='foxyya-v12-crypto-execution-read/1')throw Error('CRYPTO_EXECUTION_REQUIRED');
  if(execution.paperOnly!==true||execution.realOrderLock!==true||execution.readOnly!==true)throw Error('CRYPTO_EXECUTION_READ_ONLY_REQUIRED');
  if(typeof execution.strategyVersion!=='string'||!execution.strategyVersion)throw Error('STRATEGY_VERSION_REQUIRED');
  return execution;
}

function unavailableBase(execution,nowMs,reason,lastState=null){
  return Object.freeze({
    schemaVersion:'foxyya-crypto-market-regime/1',market:'CRYPTO',status:'UNAVAILABLE',state:'UNAVAILABLE',lastState,
    reason,source:'PRODUCTION_REGIME_ROUTER_READ_ONLY',classificationAuthority:execution.strategyVersion,
    asOf:execution.asOf,decisionCutoffMs:null,scanAgeMs:null,eligibleUniverseCount:null,dataInsufficientCount:null,
    evidenceCompleteness:'CLASSIFICATION_ONLY',rawInputsAvailable:false,confidence:null,method:METHOD,
    decisionBarPolicy:'FULLY_CLOSED_1H',researchOnly:true,executionWrite:false
  });
}

function buildCryptoMarketRegime({execution,nowMs,staleAfterMs=DEFAULT_STALE_MS}={}){
  validateExecution(execution);
  if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');
  if(!finite(staleAfterMs)||staleAfterMs<=0)throw Error('STALE_AFTER_INVALID');
  const scan=execution.latestScan;
  if(scan===null||scan===undefined)return unavailableBase(execution,nowMs,'NO_LATEST_SCAN');
  if(!object(scan))throw Error('LATEST_SCAN_INVALID');
  if(typeof scan.scan_id!=='string'||!scan.scan_id)throw Error('SCAN_ID_REQUIRED');
  if(!finite(scan.time_ms)||scan.time_ms<0||scan.time_ms>nowMs)throw Error('SCAN_TIME_INVALID');
  if(!STATES.includes(scan.regime))throw Error('REGIME_STATE_INVALID');
  if(scan.real_orders===true)throw Error('REAL_ORDERS_FORBIDDEN');
  const decisionCutoffMs=scan.decision_cutoff_ms;
  if(decisionCutoffMs!==null&&decisionCutoffMs!==undefined&&(!finite(decisionCutoffMs)||decisionCutoffMs<0||decisionCutoffMs>scan.time_ms))throw Error('DECISION_CUTOFF_INVALID');
  const eligible=scan.eligible_universe_count;
  if(eligible!==undefined&&eligible!==null&&(!Number.isInteger(eligible)||eligible<0))throw Error('ELIGIBLE_UNIVERSE_INVALID');
  const insufficient=scan.data_insufficient_features;
  if(insufficient!==undefined&&!Array.isArray(insufficient))throw Error('DATA_INSUFFICIENT_INVALID');
  const age=nowMs-scan.time_ms;
  const common={
    schemaVersion:'foxyya-crypto-market-regime/1',market:'CRYPTO',source:'PRODUCTION_REGIME_ROUTER_READ_ONLY',
    classificationAuthority:execution.strategyVersion,asOf:scan.time_ms,decisionCutoffMs:decisionCutoffMs??null,scanAgeMs:age,
    eligibleUniverseCount:Number.isInteger(eligible)?eligible:null,dataInsufficientCount:Array.isArray(insufficient)?insufficient.length:null,
    evidenceCompleteness:'CLASSIFICATION_ONLY',rawInputsAvailable:false,confidence:null,method:METHOD,
    decisionBarPolicy:'FULLY_CLOSED_1H',researchOnly:true,executionWrite:false
  };
  if(age>staleAfterMs)return Object.freeze({...common,status:'STALE',state:'UNAVAILABLE',lastState:scan.regime,reason:'SCAN_STALE'});
  return Object.freeze({...common,status:'AVAILABLE',state:scan.regime,lastState:null,reason:null});
}

module.exports=Object.freeze({buildCryptoMarketRegime});
