'use strict';

const {createRuntimeReadBridge}=require('./runtime_read_bridge.js');

function createRuntimeSyncService({
  sourceUrl=null,
  refreshSeconds=30,
  fetchImpl=globalThis.fetch,
  publishRuntime,
  bridgeFactory=createRuntimeReadBridge,
  setIntervalImpl=setInterval,
  clearIntervalImpl=clearInterval,
  onError=()=>{}
}={}){
  const sourceDisabled=sourceUrl===null||sourceUrl===undefined||String(sourceUrl).trim()==='';
  if(sourceDisabled){
    return Object.freeze({enabled:false,ready:Promise.resolve(null),close:async()=>{}});
  }

  if(!Number.isInteger(refreshSeconds)||refreshSeconds<10||refreshSeconds>300)throw Error('RUNTIME_REFRESH_SECONDS_INVALID');
  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof publishRuntime!=='function')throw Error('RUNTIME_PUBLISHER_REQUIRED');
  if(typeof bridgeFactory!=='function')throw Error('RUNTIME_BRIDGE_FACTORY_REQUIRED');
  if(typeof setIntervalImpl!=='function'||typeof clearIntervalImpl!=='function')throw Error('TIMER_REQUIRED');
  if(typeof onError!=='function')throw Error('RUNTIME_ERROR_HANDLER_REQUIRED');

  const bridge=bridgeFactory({sourceUrl:String(sourceUrl).trim(),fetchImpl,publishRuntime});
  if(!bridge||typeof bridge.syncOnce!=='function')throw Error('RUNTIME_BRIDGE_INVALID');

  let running=false;
  let closed=false;
  let timer=null;

  async function sync(){
    if(closed||running)return null;
    running=true;
    try{return await bridge.syncOnce()}
    catch(error){onError(error);return null}
    finally{running=false}
  }

  const ready=sync();
  timer=setIntervalImpl(()=>{void sync()},refreshSeconds*1000);

  async function close(){
    if(closed)return;
    closed=true;
    if(timer!==null)clearIntervalImpl(timer);
    timer=null;
  }

  return Object.freeze({enabled:true,ready,close});
}

module.exports=Object.freeze({createRuntimeSyncService});
