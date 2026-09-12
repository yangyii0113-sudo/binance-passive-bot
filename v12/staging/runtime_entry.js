'use strict';

const path=require('node:path');
const {startStagingPreviewServer}=require('./server.js');
const {prepareDurableLineageStore}=require('./lineage_migration_preflight.js');
const {createDurableForwardResearchStore}=require('./durable_forward_research_store.js');
const {createForwardResearchTracker}=require('./forward_research_tracker.js');
const {createLiveResearchBootstrap}=require('./live_research_bootstrap.js');
const {createExecutionReadBridge}=require('./execution_read_bridge.js');

const LINEAGE_COMPACT_THRESHOLD_BYTES=128*1024*1024;
const BACKUP_ENV=Object.freeze({
  bucket:'FOXYYA_V12_BACKUP_BUCKET',
  region:'FOXYYA_V12_BACKUP_REGION',
  endpoint:'FOXYYA_V12_BACKUP_ENDPOINT',
  accessKeyId:'FOXYYA_V12_BACKUP_ACCESS_KEY_ID',
  secretAccessKey:'FOXYYA_V12_BACKUP_SECRET_ACCESS_KEY'
});
const HTTP_BACKUP_ENV=Object.freeze({
  baseUrl:'FOXYYA_V12_BACKUP_HTTP_URL',
  token:'FOXYYA_V12_BACKUP_HTTP_TOKEN'
});

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

  return Object.freeze({
    host,
    port,
    lineageFilePath,
    lineageCompactThresholdBytes:LINEAGE_COMPACT_THRESHOLD_BYTES,
    forwardResearchFilePath,
    refreshSeconds,
    researchOnly:true,
    executionWrite:false
  });
}

function allOrNoneConfig(env,mapping){
  const values={};
  let present=0;
  for(const [key,name] of Object.entries(mapping)){
    const value=typeof env[name]==='string'?env[name].trim():'';
    values[key]=value;
    if(value)present+=1;
  }
  if(present===0)return null;
  if(present!==Object.keys(mapping).length)throw Error('LINEAGE_BACKUP_CONFIG_INVALID');
  return Object.freeze(values);
}
function backupConfigFromEnv(env){return allOrNoneConfig(env,BACKUP_ENV);}
function httpBackupConfigFromEnv(env){return allOrNoneConfig(env,HTTP_BACKUP_ENV);}

async function startFromEnvironment(env=process.env,dependencies={}){
  const config=runtimeConfig(env);
  const fetchImpl=dependencies.fetchImpl||globalThis.fetch;
  const clock=dependencies.clock||Date.now;
  const setIntervalImpl=dependencies.setIntervalImpl||setInterval;
  const clearIntervalImpl=dependencies.clearIntervalImpl||clearInterval;
  const onResearchError=dependencies.onResearchError||((error)=>console.error('FOXYYA v12 research refresh failed:',error?.message||error));
  const prepareLineageStoreImpl=dependencies.prepareLineageStoreImpl||prepareDurableLineageStore;

  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');
  if(typeof setIntervalImpl!=='function'||typeof clearIntervalImpl!=='function')throw Error('TIMER_REQUIRED');
  if(typeof onResearchError!=='function')throw Error('RESEARCH_ERROR_HANDLER_REQUIRED');
  if(typeof prepareLineageStoreImpl!=='function')throw Error('LINEAGE_PREPARE_REQUIRED');

  const preparedLineage=await prepareLineageStoreImpl({
    filePath:config.lineageFilePath,
    now:clock,
    compactThresholdBytes:config.lineageCompactThresholdBytes,
    scratchDir:dependencies.lineageScratchDir||'/tmp',
    backupConfig:backupConfigFromEnv(env),
    httpBackupConfig:httpBackupConfigFromEnv(env),
    backupLineageFileImpl:dependencies.backupLineageFileImpl,
    backupLineageFileHttpImpl:dependencies.backupLineageFileHttpImpl
  });
  const lineageStore=preparedLineage.store;
  const lineageMigration=preparedLineage.migration;
  const forwardResearchStore=dependencies.forwardResearchStore||createDurableForwardResearchStore({filePath:config.forwardResearchFilePath,now:clock});
  const forwardResearchTracker=dependencies.forwardResearchTracker||createForwardResearchTracker({store:forwardResearchStore});

  const serverRuntime=await startStagingPreviewServer({host:config.host,port:config.port,lineageStore,forwardResearchTracker});

  const hasInjectedBridge=Object.prototype.hasOwnProperty.call(dependencies,'executionBridge');
  const executionBridge=hasInjectedBridge
    ?dependencies.executionBridge
    :(dependencies.fetchImpl===undefined?createExecutionReadBridge({fetchImpl}):null);

  const bootstrap=createLiveResearchBootstrap({fetchImpl,clock,lineageStore,publishHome:serverRuntime.app.publishHome,executionBridge});

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
    await serverRuntime.close();
  }

  return Object.freeze({
    app:serverRuntime.app,server:serverRuntime.server,address:serverRuntime.address,lineageStore,lineageMigration,
    forwardResearchStore,forwardResearchTracker,researchReady,close
  });
}

if(require.main===module){
  startFromEnvironment().then(runtime=>{
    const address=runtime.address;
    console.log(`FOXYYA v12 staging listening on ${address.address}:${address.port}`);
    console.log('FOXYYA v12 staging mode: RESEARCH_ONLY=true EXECUTION_WRITE=false');
    if(runtime.lineageMigration?.status==='COMPACTED'){
      console.log('FOXYYA v12 lineage migration completed',JSON.stringify({
        originalBytes:runtime.lineageMigration.originalBytes,
        compactedBytes:runtime.lineageMigration.compactedBytes,
        backupChannel:runtime.lineageMigration.backupChannel,
        backupKey:runtime.lineageMigration.backup?.key,
        backupSha256:runtime.lineageMigration.backup?.sha256
      }));
    }
    runtime.researchReady.then(result=>{
      if(!result){console.log('FOXYYA v12 initial research bootstrap unavailable');return;}
      const published=result.orchestration?.published;
      const home=published?.home;
      console.log('FOXYYA v12 initial research bootstrap published',JSON.stringify({
        cryptoOpportunities:Array.isArray(home?.opportunities?.CRYPTO)?home.opportunities.CRYPTO.length:0,
        twOpportunities:Array.isArray(home?.opportunities?.TW)?home.opportunities.TW.length:0,
        usOpportunities:Array.isArray(home?.opportunities?.US)?home.opportunities.US.length:0,
        eventCount:Array.isArray(home?.events)?home.events.length:0,
        twForwardSamples:published?.researchPerformance?.tw?.summary?.sampleCount??0,
        usForwardStatus:published?.researchPerformance?.us?.status||'UNAVAILABLE',
        researchOnly:result.researchOnly===true,executionWrite:result.executionWrite===true
      }));
    });

    let closing=false;
    const shutdown=()=>{if(closing)return;closing=true;runtime.close().then(()=>process.exit(0)).catch(error=>{console.error('FOXYYA v12 staging shutdown failed:',error?.message||error);process.exit(1);});};
    process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  }).catch(error=>{console.error('FOXYYA v12 staging failed to start:',error?.message||error);process.exit(1);});
}

module.exports=Object.freeze({LINEAGE_COMPACT_THRESHOLD_BYTES,runtimeConfig,startFromEnvironment});
