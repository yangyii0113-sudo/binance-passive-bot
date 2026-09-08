(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('../core/market_core.js'):root.FOXY_V12_MARKET_CORE,
    typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_CONTRACTS
  );
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_NORMALIZER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(M,C){
  'use strict';
  function makeObservation(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INPUT_REQUIRED');
    const check=M.validateInstrument(input.instrument);
    if(!check.ok)throw Error('INSTRUMENT_INVALID:'+check.errors.join('|'));
    const value={
      schemaVersion:'foxyya-observation/1',
      instrumentId:input.instrument.instrumentId,
      market:input.instrument.market,
      field:input.field,
      value:input.value,
      unit:input.unit,
      currency:input.currency||input.instrument.currency,
      observedAt:input.observedAt,
      receivedAt:input.receivedAt,
      source:input.source,
      status:input.status,
      confidence:input.confidence
    };
    const validated=C.validateObservation(value);
    if(!validated.ok)throw Error('OBSERVATION_INVALID:'+validated.errors.join('|'));
    return Object.freeze(value);
  }
  return Object.freeze({makeObservation});
});