'use strict';

const {createDurableSourceLineageStore}=require('./durable_source_lineage_store.js');
const {startStagingServer}=require('./server.js');
const {createLiveResearchBootstrap}=require('./live_research_bootstrap.js');
const {createExecutionReadBridge}=require('./execution_read_bridge.js');

function integer(value,label,{min,max}){
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<min||parsed>max)throw Error(label+'_INVALID');
  return parsed;
}

function runtimeConfig(env=process.env){
  const host=String(env.HOST||'0.0.0.0').trim();
  if(!host)throw Error('HOST_INVALID');
  const port=integer(env.PORT||'8080','PORT',{min:0,max:65535});
  const lineageFilePath=String(env.FOXYYA_V12_LINEAGE_PATH||'/data/foxyya-v12.lineage.jsonl').trim();
  if(!lineageFilePath)throw Error('LINEAGE_PATH_INVALID');
  const refreshSeconds=integer(env.FOXYYA_V12_REFRESH_SECONDS||'1800','REFRESH_SECONDS',{min:300,max:86400});
  return Object.freeze({host,port,lineageFilePath,refreshSeconds});
}

async function startFromEnvironment(env=process.env,dependencies={}){
  const config=runtimeConfig(env);
  const clock=dependencies.clock||Date.now;
  const fetchImpl=dependencies.fetchImpl||globalThis.fetch;
  const setIntervalImpl=dependencies.setIntervalImpl||setInterval;
  const clearIntervalImpl=dependencies.clearIntervalImpl||clearInterval;
  const onResearchError=typeof dependencies.onResearchError==='function'?dependencies.onResearchError:()=>{};
  if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');
  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof setIntervalImpl!=='function'||typeof clearIntervalImpl!=='function')throw Error('TIMER_REQUIRED');

  const lineageStore=createDurableSourceLineageStore({filePath:config.lineageFilePath,now:clock});
  const staging=await startStagingServer({
    host:config.host,
    port:config.port,
    lineageStore
  });

  const hasInjectedBridge=Object.prototype.hasOwnProperty.call(dependencies,'executionBridge');
  const executionBridge=hasInjectedBridge
    ?dependencies.executionBridge
    :(dependencies.fetchImpl===undefined?createExecutionReadBridge({fetchImpl}):null);

  const research=createLiveResearchBootstrap({
    fetchImpl,
    clock,
    lineageStore,
    publishHome:staging.publishHome,
    executionBridge
  });

  let active=false;
  let closed=false;
  async function refresh(){
    if(closed||active)return null;
    active=true;
    try{return await research.runOnce();}
    finally{active=false;}
  }

  const researchReady=refresh().catch(error=>{
    onResearchError(error);
    return null;
  });

  const timer=setIntervalImpl(()=>{
    refresh().catch(onResearchError);
  },config.refreshSeconds*1000);

  return Object.freeze({
    address:staging.address,
    researchReady,
    async close(){
      if(closed)return;
      closed=true;
      clearIntervalImpl(timer);
      await staging.close();
    }
  });
}

if(require.main===module){
  startFromEnvironment().then(runtime=>{
    const address=runtime.address;
    console.log(`FOXYYA v12 staging listening on ${address.address}:${address.port}`);
    console.log('FOXYYA v12 staging mode: RESEARCH_ONLY=true EXECUTION_WRITE=false');
    runtime.researchReady.then(result=>{
      if(result){
        const home=result.orchestration?.published?.home;
        console.log('FOXYYA v12 initial research bootstrap published',JSON.stringify({
          cryptoOpportunities:home?.opportunities?.CRYPTO?.length??0,
          twOpportunities:home?.opportunities?.TW?.length??0,
          usOpportunities:home?.opportunities?.US?.length??0,
          eventCount:home?.events?.length??0,
          researchOnly:result.researchOnly,
          executionWrite:result.executionWrite
        }));
      }else{
        console.error('FOXYYA v12 initial research bootstrap unavailable');
      }
    });
    const shutdown=async()=>{
      try{await runtime.close();process.exit(0)}catch(error){console.error(error);process.exit(1)}
    };
    process.on('SIGTERM',shutdown);
    process.on('SIGINT',shutdown);
  }).catch(error=>{
    console.error(error);
    process.exit(1);
  });
}

module.exports=Object.freeze({runtimeConfig,startFromEnvironment});