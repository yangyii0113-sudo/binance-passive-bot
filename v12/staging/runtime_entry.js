'use strict';

const {startStagingPreviewServer}=require('./server.js');
const {createDurableSourceLineageStore}=require('./durable_source_lineage_store.js');
const {createLiveResearchBootstrap}=require('./live_research_bootstrap.js');
const {createRuntimeSyncService}=require('./runtime_sync_service.js');

function runtimeConfig(env=process.env){
  const host=typeof env.HOST==='string'&&env.HOST.trim()?env.HOST.trim():'0.0.0.0';
  const rawPort=env.PORT===undefined||env.PORT===null||String(env.PORT).trim()===''?'8080':String(env.PORT).trim();
  if(!/^\d+$/.test(rawPort))throw Error('PORT_INVALID');
  const port=Number(rawPort);
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('PORT_INVALID');

  const lineageFilePath=typeof env.FOXYYA_V12_LINEAGE_PATH==='string'&&env.FOXYYA_V12_LINEAGE_PATH.trim()
    ?env.FOXYYA_V12_LINEAGE_PATH.trim()
    :'/data/foxyya-v12.lineage.jsonl';
  if(!lineageFilePath.endsWith('.lineage.jsonl'))throw Error('LINEAGE_JOURNAL_PATH_INVALID');

  const rawRefresh=env.FOXYYA_V12_REFRESH_SECONDS===undefined||env.FOXYYA_V12_REFRESH_SECONDS===null||String(env.FOXYYA_V12_REFRESH_SECONDS).trim()===''
    ?'1800'
    :String(env.FOXYYA_V12_REFRESH_SECONDS).trim();
  if(!/^\d+$/.test(rawRefresh))throw Error('REFRESH_SECONDS_INVALID');
  const refreshSeconds=Number(rawRefresh);
  if(!Number.isInteger(refreshSeconds)||refreshSeconds<300||refreshSeconds>86400)throw Error('REFRESH_SECONDS_INVALID');

  const runtimeSourceRaw=env.FOXYYA_V12_RUNTIME_SOURCE_URL===undefined||env.FOXYYA_V12_RUNTIME_SOURCE_URL===null
    ?''
    :String(env.FOXYYA_V12_RUNTIME_SOURCE_URL).trim();
  const runtimeSourceUrl=runtimeSourceRaw||null;

  const rawRuntimeRefresh=env.FOXYYA_V12_RUNTIME_REFRESH_SECONDS===undefined||env.FOXYYA_V12_RUNTIME_REFRESH_SECONDS===null||String(env.FOXYYA_V12_RUNTIME_REFRESH_SECONDS).trim()===''
    ?'30'
    :String(env.FOXYYA_V12_RUNTIME_REFRESH_SECONDS).trim();
  if(!/^\d+$/.test(rawRuntimeRefresh))throw Error('RUNTIME_REFRESH_SECONDS_INVALID');
  const runtimeRefreshSeconds=Number(rawRuntimeRefresh);
  if(!Number.isInteger(runtimeRefreshSeconds)||runtimeRefreshSeconds<10||runtimeRefreshSeconds>300)throw Error('RUNTIME_REFRESH_SECONDS_INVALID');

  return Object.freeze({
    host,
    port,
    lineageFilePath,
    refreshSeconds,
    runtimeSourceUrl,
    runtimeRefreshSeconds,
    researchOnly:true,
    executionWrite:false
  });
}

async function startFromEnvironment(env=process.env,dependencies={}){
  const config=runtimeConfig(env);
  const fetchImpl=dependencies.fetchImpl||globalThis.fetch;
  const clock=dependencies.clock||Date.now;
  const setIntervalImpl=dependencies.setIntervalImpl||setInterval;
  const clearIntervalImpl=dependencies.clearIntervalImpl||clearInterval;
  const onResearchError=dependencies.onResearchError||((error)=>console.error('FOXYYA v12 research refresh failed:',error?.message||error));
  const onRuntimeError=dependencies.onRuntimeError||((error)=>console.error('FOXYYA v12 runtime read sync failed:',error?.message||error));
  const runtimeSyncFactory=dependencies.runtimeSyncFactory||createRuntimeSyncService;

  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');
  if(typeof setIntervalImpl!=='function'||typeof clearIntervalImpl!=='function')throw Error('TIMER_REQUIRED');
  if(typeof onResearchError!=='function')throw Error('RESEARCH_ERROR_HANDLER_REQUIRED');
  if(typeof onRuntimeError!=='function')throw Error('RUNTIME_ERROR_HANDLER_REQUIRED');
  if(typeof runtimeSyncFactory!=='function')throw Error('RUNTIME_SYNC_FACTORY_REQUIRED');

  const lineageStore=createDurableSourceLineageStore({filePath:config.lineageFilePath,now:clock});
  const serverRuntime=await startStagingPreviewServer({
    host:config.host,
    port:config.port,
    lineageStore
  });
  const bootstrap=createLiveResearchBootstrap({
    fetchImpl,
    clock,
    lineageStore,
    publishHome:serverRuntime.app.publishHome
  });

  const runtimeSync=runtimeSyncFactory({
    sourceUrl:config.runtimeSourceUrl,
    refreshSeconds:config.runtimeRefreshSeconds,
    fetchImpl,
    publishRuntime:serverRuntime.app.publishRuntime,
    setIntervalImpl,
    clearIntervalImpl,
    onError:onRuntimeError
  });

  let running=false;
  let closed=false;
  async function refreshResearch(){
    if(closed||running)return null;
    running=true;
    try{return await bootstrap.runOnce()}
    catch(error){onResearchError(error);return null}
    finally{running=false}
  }

  const researchReady=refreshResearch();
  const refreshTimer=setIntervalImpl(()=>{void refreshResearch()},config.refreshSeconds*1000);

  async function close(){
    if(closed)return;
    closed=true;
    clearIntervalImpl(refreshTimer);
    await runtimeSync.close();
    await serverRuntime.close();
  }

  return Object.freeze({
    app:serverRuntime.app,
    server:serverRuntime.server,
    address:serverRuntime.address,
    lineageStore,
    researchReady,
    close
  });
}

if(require.main===module){
  startFromEnvironment().then(runtime=>{
    const address=runtime.address;
    console.log(`FOXYYA v12 staging listening on ${address.address}:${address.port}`);
    console.log('FOXYYA v12 staging mode: RESEARCH_ONLY=true EXECUTION_WRITE=false');
    runtime.researchReady.then(result=>{
      if(!result){
        console.log('FOXYYA v12 initial research bootstrap unavailable');
        return;
      }
      const home=result.orchestration?.published?.home;
      console.log('FOXYYA v12 initial research bootstrap published',JSON.stringify({
        twOpportunities:Array.isArray(home?.opportunities?.TW)?home.opportunities.TW.length:0,
        usOpportunities:Array.isArray(home?.opportunities?.US)?home.opportunities.US.length:0,
        researchOnly:result.researchOnly===true,
        executionWrite:result.executionWrite===true
      }));
    });

    let closing=false;
    const shutdown=()=>{
      if(closing)return;
      closing=true;
      runtime.close().then(()=>process.exit(0)).catch(error=>{
        console.error('FOXYYA v12 staging shutdown failed:',error?.message||error);
        process.exit(1);
      });
    };
    process.once('SIGTERM',shutdown);
    process.once('SIGINT',shutdown);
  }).catch(error=>{
    console.error('FOXYYA v12 staging failed to start:',error?.message||error);
    process.exit(1);
  });
}

module.exports=Object.freeze({runtimeConfig,startFromEnvironment});
