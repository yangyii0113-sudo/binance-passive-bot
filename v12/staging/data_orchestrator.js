'use strict';

const Crypto=require('../crypto/runtime_adapter.js');
const TW=require('../read_model/tw_asset_snapshot.js');
const US=require('../read_model/us_asset_snapshot.js');
const Regional=require('../read_model/regional_context_snapshot.js');

const finite=x=>typeof x==='number'&&Number.isFinite(x);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.length>0;

function freezeDiagnostic(value){
  return Object.freeze({...value});
}

function latestReceivedAt(value,current=0){
  let latest=current;
  if(Array.isArray(value)){
    for(const item of value)latest=latestReceivedAt(item,latest);
    return latest;
  }
  if(!object(value))return latest;
  if(finite(value.receivedAt)&&value.receivedAt>=0)latest=Math.max(latest,value.receivedAt);
  for(const child of Object.values(value))latest=latestReceivedAt(child,latest);
  return latest;
}

async function loadEnvelope(loader,label){
  if(typeof loader!=='function')throw Error('LOADER_INVALID:'+label);
  let envelope;
  try{
    envelope=await loader();
  }catch(error){
    return Object.freeze({
      available:false,
      data:null,
      diagnostic:freezeDiagnostic({status:'UNAVAILABLE',reason:'LOAD_FAILED:'+(text(error?.message)?error.message:'UNKNOWN')})
    });
  }
  if(!object(envelope)||(envelope.status!=='AVAILABLE'&&envelope.status!=='UNAVAILABLE'))throw Error('SOURCE_RESULT_INVALID:'+label);
  if(envelope.status==='UNAVAILABLE'){
    return Object.freeze({
      available:false,
      data:null,
      diagnostic:freezeDiagnostic({status:'UNAVAILABLE',reason:text(envelope.reason)?envelope.reason:'UNAVAILABLE'})
    });
  }
  if(!object(envelope.data))throw Error('SOURCE_DATA_REQUIRED:'+label);
  return Object.freeze({available:true,data:envelope.data,diagnostic:null});
}

async function loadAssetGroup(loaders,label,builder,nowMs){
  if(loaders===undefined)return Object.freeze({models:Object.freeze([]),diagnostics:Object.freeze([])});
  if(!Array.isArray(loaders))throw Error(label+'_LOADERS_INVALID');
  const models=[];
  const diagnostics=[];
  for(let i=0;i<loaders.length;i++){
    const loaded=await loadEnvelope(loaders[i],label+':'+i);
    if(!loaded.available){diagnostics.push(loaded.diagnostic);continue}
    const knowledgeTime=Math.max(nowMs,latestReceivedAt(loaded.data,nowMs));
    const model=builder({...loaded.data,nowMs:knowledgeTime});
    models.push(model);
    diagnostics.push(freezeDiagnostic({status:'AVAILABLE',instrumentId:model.instrumentId,schemaVersion:model.schemaVersion}));
  }
  return Object.freeze({models:Object.freeze(models),diagnostics:Object.freeze(diagnostics)});
}

async function loadRegions(loaders,nowMs){
  if(loaders===undefined)return Object.freeze({models:Object.freeze({}),diagnostics:Object.freeze({})});
  if(!object(loaders))throw Error('REGION_LOADERS_INVALID');
  const models={};
  const diagnostics={};
  for(const [region,loader] of Object.entries(loaders)){
    const loaded=await loadEnvelope(loader,'REGION:'+region);
    if(!loaded.available){diagnostics[region]=loaded.diagnostic;continue}
    const knowledgeTime=Math.max(nowMs,latestReceivedAt(loaded.data,nowMs));
    const model=Regional.buildRegionalContextSnapshot({...loaded.data,region,nowMs:knowledgeTime});
    models[region]=model;
    diagnostics[region]=freezeDiagnostic({status:'AVAILABLE',region,schemaVersion:model.schemaVersion});
  }
  return Object.freeze({models:Object.freeze(models),diagnostics:Object.freeze(diagnostics)});
}

function modelAsOf(value){return finite(value?.asOf)&&value.asOf>=0?value.asOf:0}

function createStagingDataOrchestrator({publishHome}={}){
  if(typeof publishHome!=='function')throw Error('PUBLISH_HOME_REQUIRED');

  async function run(input={}){
    if(!finite(input.nowMs)||input.nowMs<0)throw Error('NOW_INVALID');
    const nowMs=input.nowMs;

    let cryptoExecution=null;
    let cryptoDiagnostic=freezeDiagnostic({status:'UNAVAILABLE',reason:'NOT_CONFIGURED'});
    if(input.crypto!==undefined){
      const loaded=await loadEnvelope(input.crypto,'CRYPTO');
      if(loaded.available){
        const data=loaded.data;
        if(!object(data.status)||!object(data.snapshot))throw Error('CRYPTO_RUNTIME_INPUT_REQUIRED');
        cryptoExecution=Crypto.adaptRuntime(data.status,data.snapshot);
        cryptoDiagnostic=freezeDiagnostic({status:'AVAILABLE',schemaVersion:cryptoExecution.schema,health:cryptoExecution.health});
      }else{
        cryptoDiagnostic=loaded.diagnostic;
      }
    }

    const tw=await loadAssetGroup(input.twAssets,'TW',TW.buildTWAssetResearchSnapshot,nowMs);
    const us=await loadAssetGroup(input.usAssets,'US',US.buildUSAssetResearchSnapshot,nowMs);
    const regions=await loadRegions(input.regions,nowMs);

    const publishAsOf=Math.max(
      nowMs,
      modelAsOf(cryptoExecution),
      ...tw.models.map(modelAsOf),
      ...us.models.map(modelAsOf),
      ...Object.values(regions.models).map(modelAsOf)
    );

    const published=publishHome({
      asOf:publishAsOf,
      cryptoExecution,
      twAssets:tw.models,
      usAssets:us.models,
      regionalContexts:regions.models,
      pulses:object(input.pulses)?input.pulses:{},
      todayFocus:Array.isArray(input.todayFocus)?input.todayFocus:[],
      events:Array.isArray(input.events)?input.events:[]
    });

    return Object.freeze({
      schemaVersion:'foxyya-staging-orchestration-result/1',
      asOf:publishAsOf,
      published,
      diagnostics:Object.freeze({
        CRYPTO:cryptoDiagnostic,
        TW:tw.diagnostics,
        US:us.diagnostics,
        REGIONS:regions.diagnostics
      }),
      researchOnly:true,
      executionWrite:false
    });
  }

  return Object.freeze({run});
}

module.exports=Object.freeze({createStagingDataOrchestrator});
