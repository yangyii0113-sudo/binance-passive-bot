(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FOXY_V12_CONTRACTS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const MARKET_IDS = Object.freeze(['ALL','CRYPTO','US','TW']);
  const CONFIDENCE_STATES = Object.freeze(['LIVE','DELAYED','SNAPSHOT','STALE','UNAVAILABLE']);
  const STOCK_MARKETS = new Set(['US','TW']);
  const STOCK_FORBIDDEN_EXECUTION = new Set(['PENDING','PENDING_INTENT','OPEN','FILLED','EXECUTABLE']);

  const ok = () => ({ok:true, errors:[]});
  const fail = (...errors) => ({ok:false, errors});
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const text = value => typeof value === 'string' && value.length > 0;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);

  function baseMarketErrors(value){
    const errors = [];
    if (!object(value)) return ['OBJECT_REQUIRED'];
    if (!MARKET_IDS.includes(value.market) || value.market === 'ALL') errors.push('MARKET_INVALID');
    if (!finite(value.asOf) || value.asOf < 0) errors.push('ASOF_INVALID');
    if (!text(value.source)) errors.push('SOURCE_REQUIRED');
    if (!CONFIDENCE_STATES.includes(value.confidence)) errors.push('CONFIDENCE_INVALID');
    return errors;
  }

  function validateMarketPulse(value){
    const errors = baseMarketErrors(value);
    if (!text(value?.label)) errors.push('LABEL_REQUIRED');
    if (!text(value?.regime)) errors.push('REGIME_REQUIRED');
    if (!object(value?.primary)) errors.push('PRIMARY_REQUIRED');
    if (!object(value?.secondary)) errors.push('SECONDARY_REQUIRED');
    if (!object(value?.breadth)) errors.push('BREADTH_REQUIRED');
    if (!text(value?.volumeState)) errors.push('VOLUME_STATE_REQUIRED');
    if (!text(value?.riskState)) errors.push('RISK_STATE_REQUIRED');
    return errors.length ? fail(...errors) : ok();
  }

  function validateAssetSnapshot(value){
    const errors = baseMarketErrors(value);
    if (!text(value?.symbol)) errors.push('SYMBOL_REQUIRED');
    if (!text(value?.name)) errors.push('NAME_REQUIRED');
    if (value?.price !== null && value?.price !== undefined && !finite(value.price)) errors.push('PRICE_INVALID');
    if (value?.changePct !== null && value?.changePct !== undefined && !finite(value.changePct)) errors.push('CHANGE_INVALID');
    return errors.length ? fail(...errors) : ok();
  }

  function validateResearchRead(value){
    const errors = baseMarketErrors(value);
    if (!text(value?.symbol)) errors.push('SYMBOL_REQUIRED');
    if (!object(value?.dimensions)) errors.push('DIMENSIONS_REQUIRED');
    else for (const key of ['trend','momentum','fundamental','expectation','flow','risk']) {
      if (!text(value.dimensions[key])) errors.push('DIMENSION_'+key.toUpperCase()+'_REQUIRED');
    }
    if (!object(value?.scenarios) || !object(value.scenarios.bull) || !object(value.scenarios.base) || !object(value.scenarios.bear)) {
      errors.push('SCENARIOS_REQUIRED');
    }
    if (STOCK_MARKETS.has(value?.market) && STOCK_FORBIDDEN_EXECUTION.has(value?.executionState)) {
      errors.push('STOCK_EXECUTION_FORBIDDEN');
    }
    return errors.length ? fail(...errors) : ok();
  }

  function validateExecutionSnapshot(value){
    const errors = [];
    if (!object(value)) return fail('OBJECT_REQUIRED');
    if (value.paperOnly !== true) errors.push('PAPER_ONLY_REQUIRED');
    if (value.realOrderLock !== true) errors.push('REAL_ORDER_LOCK_REQUIRED');
    if (!text(value.strategyVersion)) errors.push('STRATEGY_VERSION_REQUIRED');
    for (const key of ['qualified','pending','open']) if (!Number.isInteger(value[key]) || value[key] < 0) errors.push(key.toUpperCase()+'_INVALID');
    if (typeof value.ledgerIntegrity !== 'boolean') errors.push('LEDGER_INTEGRITY_REQUIRED');
    if (!finite(value.asOf) || value.asOf < 0) errors.push('ASOF_INVALID');
    return errors.length ? fail(...errors) : ok();
  }

  return Object.freeze({
    MARKET_IDS,
    CONFIDENCE_STATES,
    validateMarketPulse,
    validateAssetSnapshot,
    validateResearchRead,
    validateExecutionSnapshot,
  });
});