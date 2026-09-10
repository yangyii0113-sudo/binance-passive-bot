'use strict';

const {adaptRuntime}=require('../crypto/runtime_adapter.js');
const {buildRuntimeReadModel}=require('../read_model/runtime.js');

function normalizeSourceUrl(sourceUrl){
  if(typeof sourceUrl!=='string'||!sourceUrl.trim())throw Error('RUNTIME_SOURCE_URL_INVALID');
  let url;
  try{url=new URL(sourceUrl.trim())}catch(_error){throw Error('RUNTIME_SOURCE_URL_INVALID')}
  const localhost=['localhost','127.0.0.1'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&localhost))||url.username||url.password||url.pathname!=='/'||url.search||url.hash){
    throw Error('RUNTIME_SOURCE_URL_INVALID');
  }
  return url.origin;
}

function createRuntimeReadBridge({sourceUrl,fetchImpl,publishRuntime}={}){
  const base=normalizeSourceUrl(sourceUrl);
  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof publishRuntime!=='function')throw Error('RUNTIME_PUBLISHER_REQUIRED');

  async function read(path){
    const response=await fetchImpl(base+path,{
      method:'GET',
      credentials:'omit',
      cache:'no-store',
      headers:{Accept:'application/json'}
    });
    if(!response||response.ok!==true)throw Error(`RUNTIME_HTTP_${response?.status??'ERROR'}`);
    const contentType=response.headers?.get?.('content-type')||'';
    if(!/application\/json/i.test(contentType))throw Error('RUNTIME_JSON_REQUIRED');
    let value;
    try{value=await response.json()}catch(_error){throw Error('RUNTIME_JSON_INVALID')}
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('RUNTIME_JSON_INVALID');
    return value;
  }

  async function syncOnce(){
    const status=await read('/api/runtime/status');
    const snapshot=await read('/api/runtime/snapshot');
    const executionRead=adaptRuntime(status,snapshot);
    const readModel=buildRuntimeReadModel({status,executionRead});
    publishRuntime(readModel);
    return readModel;
  }

  return Object.freeze({sourceUrl:base,syncOnce});
}

module.exports=Object.freeze({createRuntimeReadBridge});
