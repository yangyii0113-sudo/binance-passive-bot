(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_LAB_CONTRACTS);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_LAB_REPORT=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  function buildLabReport(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INPUT_REQUIRED');
    const checked=C.validateVersion(input.version);if(!checked.ok)throw Error('VERSION_INVALID:'+checked.errors.join('|'));
    if(!Number.isInteger(input.sampleCount)||input.sampleCount<0)throw Error('SAMPLE_COUNT_INVALID');
    if(!finite(input.asOf)||input.asOf<input.version.createdAt)throw Error('ASOF_INVALID');
    if(!input.metrics||typeof input.metrics!=='object'||Array.isArray(input.metrics))throw Error('METRICS_REQUIRED');
    const metrics={};
    for(const [k,v] of Object.entries(input.metrics)){
      if(v!==null&&!finite(v))throw Error('METRIC_INVALID:'+k);
      metrics[k]=v;
    }
    return Object.freeze({schema:'foxyya-lab-report/1',version:Object.freeze({...input.version}),market:input.version.market,modelId:input.version.modelId,mode:input.version.mode,sampleCount:input.sampleCount,sampleStatus:input.sampleCount<20?'SAMPLE_INSUFFICIENT':'DESCRIPTIVE_ONLY',metrics:Object.freeze(metrics),asOf:input.asOf,researchOnly:true,autoPromote:false});
  }
  function compareReports(control,shadow){
    if(!control||!shadow||control.mode!=='CONTROL'||shadow.mode!=='SHADOW')throw Error('CONTROL_SHADOW_REQUIRED');
    if(control.modelId!==shadow.modelId||control.market!==shadow.market)throw Error('MODEL_MISMATCH');
    const deltas={};
    const keys=new Set([...Object.keys(control.metrics||{}),...Object.keys(shadow.metrics||{})]);
    for(const k of keys){
      const a=control.metrics[k],b=shadow.metrics[k];
      deltas[k]=finite(a)&&finite(b)?b-a:null;
    }
    return Object.freeze({modelId:control.modelId,market:control.market,controlVersion:control.version.id,shadowVersion:shadow.version.id,deltas:Object.freeze(deltas),autoPromote:false,requiresVersionReview:true,asOf:Math.max(control.asOf,shadow.asOf)});
  }
  return Object.freeze({buildLabReport,compareReports});
});