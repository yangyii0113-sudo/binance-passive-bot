(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./provider_contract.js'):root.FOXY_V12_PROVIDER_CONTRACT);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_PROVIDER_REGISTRY=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';

  function createRegistry(){
    const entries=new Map();

    function register(descriptor,adapter){
      const frozen=P.freezeDescriptor(descriptor);
      if(entries.has(frozen.id))throw Error('PROVIDER_DUPLICATE');
      if(!adapter||typeof adapter.normalize!=='function')throw Error('NORMALIZE_REQUIRED');
      const entry=Object.freeze({descriptor:frozen,adapter});
      entries.set(frozen.id,entry);
      return entry;
    }

    function resolve(market,capability){
      const matches=[...entries.values()].filter(e=>e.descriptor.markets.includes(market)&&e.descriptor.capabilities.includes(capability));
      matches.sort((a,b)=>a.descriptor.priority-b.descriptor.priority||a.descriptor.id.localeCompare(b.descriptor.id));
      return matches[0]||null;
    }

    function list(){
      return [...entries.values()].sort((a,b)=>a.descriptor.priority-b.descriptor.priority||a.descriptor.id.localeCompare(b.descriptor.id));
    }

    return Object.freeze({register,resolve,list});
  }

  return Object.freeze({createRegistry});
});