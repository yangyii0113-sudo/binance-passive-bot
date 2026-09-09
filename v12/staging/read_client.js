(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FOXY_V12_STAGING_READ_CLIENT=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const HOME_ENDPOINT='/v12/api/home';

  function validateHomeReadModel(value){
    if(!value||value.schemaVersion!=='foxyya-home-read-model/1')throw new Error('HOME_READ_MODEL_REQUIRED');
    if(value.executionWrite!==false||value.researchOnly!==true)throw new Error('HOME_READ_ONLY_REQUIRED');
    return value;
  }

  function createHomeReadClient(options={}){
    const endpoint=options.endpoint===undefined?HOME_ENDPOINT:options.endpoint;
    if(endpoint!==HOME_ENDPOINT)throw new Error('STAGING_ENDPOINT_FORBIDDEN');

    const fetchImpl=options.fetchImpl||(typeof fetch==='function'?fetch.bind(globalThis):null);
    if(typeof fetchImpl!=='function')throw new Error('FETCH_REQUIRED');

    const timeoutMs=options.timeoutMs===undefined?15000:options.timeoutMs;
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('READ_TIMEOUT_INVALID');
    async function read(signal){
      const response=await fetchImpl(HOME_ENDPOINT,{
        method:'GET',signal,
        credentials:'same-origin',
        cache:'no-store',
        headers:{Accept:'application/json'}
      });

      const contentType=response&&response.headers&&typeof response.headers.get==='function'
        ?String(response.headers.get('content-type')||'').toLowerCase()
        :'';
      if(!contentType.includes('application/json'))throw new Error('CONTENT_TYPE_INVALID');

      const body=await response.json();
      if(response.status===503)return Object.freeze({status:'UNAVAILABLE',data:null});
      if(!response.ok)throw new Error('STAGING_READ_FAILED:'+response.status);

      return Object.freeze({status:'AVAILABLE',data:validateHomeReadModel(body)});
    }

    async function load(){
      const controller=new AbortController();let timer;
      try{return await Promise.race([read(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'))},timeoutMs)})])}
      finally{clearTimeout(timer)}
    }
    return Object.freeze({load});
  }

  return Object.freeze({HOME_ENDPOINT,createHomeReadClient});
});
