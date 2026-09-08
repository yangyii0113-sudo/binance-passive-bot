(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_CONTRACTS);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_QUALITY_GATE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';

  function policyErrors(policy){
    const errors=[];
    if(!policy||typeof policy!=='object'||Array.isArray(policy))return ['POLICY_REQUIRED'];
    if(!Number.isFinite(policy.liveMaxAgeMs)||policy.liveMaxAgeMs<0)errors.push('LIVE_MAX_AGE_INVALID');
    if(!Number.isFinite(policy.staleMaxAgeMs)||policy.staleMaxAgeMs<0)errors.push('STALE_MAX_AGE_INVALID');
    if(Number.isFinite(policy.liveMaxAgeMs)&&Number.isFinite(policy.staleMaxAgeMs)&&policy.staleMaxAgeMs<policy.liveMaxAgeMs)errors.push('AGE_POLICY_ORDER_INVALID');
    return errors;
  }

  function assessObservation(observation,nowMs,policy){
    const validation=C.validateObservation(observation);
    const pErrors=policyErrors(policy);
    const timeOk=Number.isFinite(nowMs)&&nowMs>=0;
    if(!validation.ok||pErrors.length||!timeOk){
      return {
        ok:false,
        status:'UNAVAILABLE',
        freshnessMs:null,
        confidence:0,
        reasons:[...validation.errors,...pErrors,...(timeOk?[]:['NOW_INVALID'])]
      };
    }

    const freshnessMs=Math.max(0,nowMs-observation.observedAt);
    if(observation.status==='UNAVAILABLE'){
      return {ok:true,status:'UNAVAILABLE',freshnessMs,confidence:observation.confidence,reasons:['SOURCE_UNAVAILABLE']};
    }

    let status=observation.status;
    const reasons=[];
    if(freshnessMs>policy.staleMaxAgeMs){
      if(status!=='STALE')reasons.push('AGE_EXCEEDS_STALE_MAX');
      status='STALE';
    }else if(status==='LIVE'&&freshnessMs>policy.liveMaxAgeMs){
      status='DELAYED';
      reasons.push('AGE_EXCEEDS_LIVE_MAX');
    }

    return {ok:true,status,freshnessMs,confidence:observation.confidence,reasons};
  }

  return Object.freeze({assessObservation});
});