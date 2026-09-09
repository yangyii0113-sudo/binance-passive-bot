(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_LAB_CONTRACTS);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_VERSION_REGISTRY=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const text=x=>typeof x==='string'&&x.length>0;
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const CONTROL_FREEZE_MS=30*86400000;
  function createVersionRegistry(){
    const versions=new Map(),active=new Map();
    function register(value){
      const checked=C.validateVersion(value);if(!checked.ok)throw Error('VERSION_INVALID:'+checked.errors.join('|'));
      if(versions.has(value.id))throw Error('VERSION_DUPLICATE');
      const frozen=Object.freeze({...value});versions.set(value.id,frozen);return frozen;
    }
    function activateControl(modelId,versionId,review){
      const v=versions.get(versionId);
      if(!v||v.modelId!==modelId||v.mode!=='CONTROL')throw Error('CONTROL_VERSION_INVALID');
      if(!review||!text(review.approvedBy)||!finite(review.approvedAt)||review.approvedAt<v.createdAt||!text(review.reason))throw Error('REVIEW_REQUIRED');
      const current=active.get(modelId);
      if(current&&current.version.market==='CRYPTO'&&review.approvedAt<current.review.approvedAt+CONTROL_FREEZE_MS)throw Error('CONTROL_FREEZE_ACTIVE');
      const record=Object.freeze({version:v,review:Object.freeze({...review})});active.set(modelId,record);return record;
    }
    function activeControl(modelId){return active.get(modelId)||null;}
    function get(id){return versions.get(id)||null;}
    function list(){return [...versions.values()];}
    return Object.freeze({register,activateControl,activeControl,get,list});
  }
  return Object.freeze({CONTROL_FREEZE_MS,createVersionRegistry});
});