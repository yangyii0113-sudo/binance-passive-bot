'use strict';

const path=require('node:path');
const {startStagingPreviewServer}=require('./server.js');
const {createDurableSourceLineageStore}=require('./durable_source_lineage_store.js');
const {createDurableForwardResearchStore}=require('./durable_forward_research_store.js');
const {createForwardResearchTracker}=require('./forward_research_tracker.js');
const {createLiveResearchBootstrap}=require('./live_research_bootstrap.js');
const {createExecutionReadBridge}=require('./execution_read_bridge.js');
const {DEFAULT_POLICY,normalizeLineagePolicy}=require('./lineage_storage_policy.js');

function parseIntegerSetting(env,name,defaultValue,{min=0}={}){
  const raw=env[name];
  if(raw===undefined||raw===null||String(raw).trim()==='')return defaultValue;
  const text=String(raw).trim();
  if(!/^\d+$/.test(text))throw Error('LINEAGE_STORAGE_POLICY_INVALID');
  const value=Number(text);
  if(!Number.isSafeInteger(value)||value<min)throw Error('LINEAGE_STORAGE_POLICY_INVALID');
  return value;
}

function parseRatioSetting(env,name,defaultValue){
  const raw=env[name];
  if(raw===undefined||raw===null||String(raw).trim()==='')return defaultValue;
  const text=String(raw).trim();
  if(!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(text))throw Error('LINEAGE_STORAGE_POLICY_INVALID');
  const value=Number(text);
  if(!Number.isFinite(value))throw Error('LINEAGE_STORAGE_POLICY_INVALID');
  return value;
}

function runtimeConfig(env=process.env){
  const host=typeof env.HOST==='string'&&env.HOST.trim()?env.HOST.trim():'0.0.0.0';
  const rawPort=env.PORT===undefined||env.PORT===null||String(env.PORT).trim()===''?'8080':String(env.PORT).trim();
  if(!/^\d+$/.test(rawPort))throw Error('PORT_INVALID');
  const port=Number(rawPort);
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('PORT_INVALID');

  const explicitLineagePath=typeof env.FOXYYA_V12_LINEAGE_PATH==='string'&&env.FOXYYA_V12_LINEAGE_PATH.trim();
  const lineageFilePath=explicitLineagePath
    ?env.FOXYYA_V12_LINEAGE_PATH.trim()
    :'/data/foxyya-v12.lineage.jsonl';
  if(!lineageFilePath.endsWith('.lineage.jsonl'))throw Error('LINEAGE_JOURNAL_PATH_INVALID');

  const explicitForwardPath=typeof env.FOXYYA_V12_FORWARD_RESEARCH_PATH==='string'&&env.FOXYYA_V12_FORWARD_RESEARCH_PATH.trim();
  const forwardResearchFilePath=explicitForwardPath
    ?env.FOXYYA_V12_FORWARD_RESEARCH_PATH.trim()
    :(explicitLineagePath
      ?path.join(path.dirname(lineageFilePath),'foxyya-v12-forward-research.forward.jsonl')
      :'/data/foxyya-v12-forward-research.forward.jsonl');
  if(!forwardResearchFilePath.endsWith('.forward.jsonl'))throw Error('FORWARD_LEDGER_PATH_INVALID');

  const rawRefresh=env.FOXYYA_V12_REFRESH_SECONDS===undefined||env.FOXYYA_V12_REFRESH_SECONDS===null||String(env.FOXYYA_V12_REFRESH_SECONDS).trim()===''
    ?'1800'
    :String(env.FOXYYA_V12_REFRESH_SECONDS).trim();
  if(!/^\d+$/.test(rawRefresh))throw Error('REFRESH_SECONDS_INVALID');
  const refreshSeconds=Number(rawRefresh);
  if(!Number.isInteger(refreshSeconds)||refreshSeconds<300||refreshSeconds>86400)throw Error('REFRESH_SECONDS_INVALID');

  const lineagePolicy=normalizeLineagePolicy({
    retainedTargetBytes:parseIntegerSetting(env,'FOXYYA_V12_LINEAGE_RETAINED_TARGET_BYTES',DEFAULT_POLICY.retainedTargetBytes,{min:1}),
    compactionTriggerBytes:parseIntegerSetting(env,'FOXYYA_V12_LINEAGE_COMPACTION_TRIGGER_BYTES',DEFAULT_POLICY.compactionTriggerBytes,{min:1}),
    activeRotationBytes:parseIntegerSetting(env,'FOXYYA_V12_LINEAGE_ACTIVE_ROTATION_BYTES',DEFAULT_POLICY.activeRotationBytes,{min:1}),
    softHighWaterRatio:parseRatioSetting(env,'FOXYYA_V12_LINEAGE_SOFT_HIGH_WATER',DEFAULT_POLICY.softHighWaterRatio),
    criticalHighWaterRatio:parseRatioSetting(env,'FOXYYA_V12_LINEAGE_CRITICAL_HIGH_WATER',DEFAULT_POLICY.criticalHighWaterRatio),
    reserveBytes:parseIntegerSetting(env,'FOXYYA_V12_LINEAGE_RESERVE_BYTES',DEFAULT_POLICY.reserveBytes,{min:0}),
    checkpointAuditRecords:parseIntegerSetting(env,'FOXYYA_V12_LINEAGE_CHECKPOINT_AUDIT_RECORDS',DEFAULT_POLICY.checkpointAuditRecords,{min:1})
  });

  return Object.freeze({
    host,
    port,
    lineageFilePath,
    forwardResearchFilePath,
    refreshSeconds,
    lineagePolicy,
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
  const onLineageMaintenance=dependencies.onLineageMaintenance||((result)=>{
    if(!result||result.status==='NOOP')return;
    const after=result.after||null;
    console.log('FOXYYA v12 lineage maintenance',JSON.stringify({
      status:result.status,
      trigger:result.trigger||null,
      activeBytes:after?.activeBytes??null,
      checkpointBytes:after?.checkpointBytes??null,
      totalBytes:after?.totalBytes??null,
      physicalBytes:after?.physicalBytes??null,
      usedRatio:after?.filesystem?.usedRatio??null,
      availableBytes:after?.filesystem?.availableBytes??null
    }));
  });

  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');
  if(typeof setIntervalImpl!=='function'||typeof clearIntervalImpl!=='function')throw Error('TIMER_REQUIRED');
  if(typeof onResearchError!=='function')throw Error('RESEARCH_ERROR_HANDLER_REQUIRED');
  if(typeof onLineageMaintenance!=='function')throw Error('LINEAGE_MAINTENANCE_HANDLER_REQUIRED');

  const lineageStore=createDurableSourceLineageStore({
    filePath:config.lineageFilePath,
    now:clock,
    policy:config.lineagePolicy
  });
  const forwardResearchStore=dependencies.forwardResearchStore||createDurableForwardResearchStore({filePath:config.forwardResearchFilePath,now:clock});
  const forwardResearchTracker=dependencies.forwardResearchTracker||createForwardResearchTracker({store:forwardResearchStore});

  const serverRuntime=await startStagingPreviewServer({
    host:config.host,
    port:config.port,
    lineageStore,
    forwardResearchTracker
  });

  const hasInjectedBridge=Object.prototype.hasOwnProperty.call(dependencies,'executionBridge');
  const executionBridge=hasInjectedBridge
    ?dependencies.executionBridge
    :(dependencies.fetchImpl===undefined?createExecutionReadBridge({fetchImpl}):null);

  const bootstrap=createLiveResearchBootstrap({
    fetchImpl,
    clock,
    lineageStore,
    publishHome:serverRuntime.app.publishHome,
    executionBridge
  });

  function maintainLineage(){
    const result=lineageStore.maintenance();
    onLineageMaintenance(result);
    if(result?.status==='LINEAGE_COMPACTION_SPACE_REQUIRED')throw Error('LINEAGE_COMPACTION_SPACE_REQUIRED');
    return result;
  }

  let running=false;
  let closed=false;
  async function refreshResearch(){
    if(closed||running)return null;
    running=true;
    try{
      maintainLineage();
      const result=await bootstrap.runOnce();
      maintainLineage();
      return result;
    }
    catch(error){onResearchError(error);return null}
    finally{running=false}
  }

  const researchReady=refreshResearch();
  const refreshTimer=setIntervalImpl(()=>{void refreshResearch()},config.refreshSeconds*1000);

  async function close(){
    if(closed)return;
    closed=true;
    clearIntervalImpl(refreshTimer);
    await serverRuntime.close();
  }

  return Object.freeze({
    app:serverRuntime.app,
    server:serverRuntime.server,
    address:serverRuntime.address,
    lineageStore,
    forwardResearchStore,
    forwardResearchTracker,
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
      const published=result.orchestration?.published;
      const home=published?.home;
      console.log('FOXYYA v12 initial research bootstrap published',JSON.stringify({
        cryptoOpportunities:Array.isArray(home?.opportunities?.CRYPTO)?home.opportunities.CRYPTO.length:0,
        twOpportunities:Array.isArray(home?.opportunities?.TW)?home.opportunities.TW.length:0,
        usOpportunities:Array.isArray(home?.opportunities?.US)?home.opportunities.US.length:0,
        eventCount:Array.isArray(home?.events)?home.events.length:0,
        twForwardSamples:published?.researchPerformance?.tw?.summary?.sampleCount??0,
        usForwardStatus:published?.researchPerformance?.us?.status||'UNAVAILABLE',
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
