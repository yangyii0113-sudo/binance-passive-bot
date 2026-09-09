'use strict';

const {createPublicSourceLoader}=require('./public_source_loader.js');
const {createOfficialSourceBindings}=require('./official_source_binding.js');
const {createStagingDataOrchestrator}=require('./data_orchestrator.js');
const EvidencePolicy=require('../early_trend/evidence_policy.js');
const Lineage=require('../data/source_lineage.js');
const {regionalFacts}=require('../read_model/product_facts.js');
const {buildProviderDiagnostics}=require('../read_model/provider_diagnostics.js');

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);

function readonlyEnvelope(status,data,reason){
  return Object.freeze({
    status,
    data:status==='AVAILABLE'?data:null,
    reason:status==='UNAVAILABLE'?(reason||'UNAVAILABLE'):undefined,
    researchOnly:true,
    executionWrite:false
  });
}

function arrayConfig(value,label){
  if(value===undefined)return [];
  if(!Array.isArray(value))throw Error(label+'_INVALID');
  return value;
}

function validateProviderGovernance(value){
  if(value===undefined||value===null)return null;
  if(!object(value)||typeof value.run!=='function'||typeof value.snapshot!=='function')throw Error('PROVIDER_GOVERNANCE_INVALID');
  return value;
}

function validateLineageStore(value){
  if(value===undefined||value===null)return null;
  if(!object(value))throw Error('LINEAGE_STORE_INVALID');
  for(const method of ['recordSource','recordOutput','source','output','traceOutput']){
    if(typeof value[method]!=='function')throw Error('LINEAGE_STORE_INVALID');
  }
  return value;
}

function makeLoader(sourceId,endpoint,fetchImpl,clock,governance,usedProviderIds){
  if(usedProviderIds)usedProviderIds.add(sourceId);
  return createPublicSourceLoader({sourceId,endpoint,fetchImpl,clock,governance});
}

function collectObservations(data){
  const observations=[];
  if(Array.isArray(data?.observations))observations.push(...data.observations);
  for(const series of Array.isArray(data?.series)?data.series:[]){
    if(Array.isArray(series?.observations))observations.push(...series.observations);
  }
  return observations;
}

function assertTWPolicy(policy){
  const check=EvidencePolicy.validateEvidencePolicy(policy);
  if(!check.ok||policy?.market!=='TW')throw Error('EVIDENCE_POLICY_INVALID:'+check.errors.join('|'));
  return policy;
}

function validateResearchHistory(value){
  if(value===undefined)return null;
  if(!object(value))throw Error('RESEARCH_HISTORY_INVALID');
  for(const method of ['recordRevenue','previousRevenue','recordInstitutionalSession','institutionalSessions']){
    if(typeof value[method]!=='function')throw Error('RESEARCH_HISTORY_INVALID');
  }
  return value;
}

function historyMeta(item){
  return Object.freeze({
    modelVersion:typeof item.config?.modelVersion==='string'&&item.config.modelVersion?item.config.modelVersion:null,
    policyVersion:typeof item.policy?.id==='string'&&item.policy.id?item.policy.id:null
  });
}

function taiwanExchange(value){
  const exchange=value===undefined||value===null||String(value).trim()===''
    ?'TWSE'
    :String(value).trim().toUpperCase();
  if(exchange!=='TWSE'&&exchange!=='TPEX')throw Error('TW_EXCHANGE_INVALID');
  return exchange;
}

function assertLineageTraceableInputs(input){
  for(const item of arrayConfig(input.twAssets,'TW_ASSETS')){
    if(Array.isArray(item?.researchEvidence)&&item.researchEvidence.length)throw Error('LINEAGE_EXTERNAL_EVIDENCE_FORBIDDEN');
  }
  for(const item of arrayConfig(input.usAssets,'US_ASSETS')){
    if((Array.isArray(item?.researchEvidence)&&item.researchEvidence.length)||(Array.isArray(item?.earlyEvidence)&&item.earlyEvidence.length)){
      throw Error('LINEAGE_EXTERNAL_EVIDENCE_FORBIDDEN');
    }
  }
}

function lineageKey(outputType,subjectId){return outputType+'|'+subjectId;}

function createRunLineageContext({store,publishHome}){
  const sourceRecordsByOutput=new Map();

  function remember(outputType,outputSubjectId,envelope,sourceSubjectId=outputSubjectId){
    if(!envelope||envelope.status!=='AVAILABLE')return null;
    const meta=envelope.lineageMeta;
    if(!object(meta)||typeof meta.sourceId!=='string'||typeof meta.datasetId!=='string'||typeof meta.bindingVersion!=='string'||typeof meta.adapterVersion!=='string'||typeof meta.canonicalSchemaVersion!=='string'){
      throw Error('LINEAGE_META_INVALID');
    }
    const source=Lineage.createSourceObservationLineage({
      sourceId:meta.sourceId,
      datasetId:meta.datasetId,
      subjectId:sourceSubjectId,
      fetchStartedAt:envelope.fetchStartedAt,
      receivedAt:envelope.receivedAt,
      bindingVersion:meta.bindingVersion,
      adapterVersion:meta.adapterVersion,
      canonicalSchemaVersion:meta.canonicalSchemaVersion,
      sourceStatus:'AVAILABLE',
      observations:collectObservations(envelope.data),
      researchOnly:true,
      executionWrite:false
    });
    store.recordSource(source);
    const key=lineageKey(outputType,outputSubjectId);
    const records=sourceRecordsByOutput.get(key)||[];
    records.push(source);
    sourceRecordsByOutput.set(key,records);
    return source;
  }

  function attachOutput(model,outputType,subjectId,asOf){
    const records=sourceRecordsByOutput.get(lineageKey(outputType,subjectId))||[];
    if(!records.length)throw Error('LINEAGE_SOURCE_REQUIRED');
    const output=Lineage.createResearchOutputLineage({
      outputType,
      subjectId,
      asOf,
      outputSchemaVersion:model.schemaVersion,
      sourceLineageRefs:records.map(x=>x.lineageRef),
      observationRefs:records.flatMap(x=>x.observationRefs),
      researchOnly:true,
      executionWrite:false
    });
    store.recordOutput(output);
    return Object.freeze({...model,lineageRef:output.lineageRef});
  }

  function publish(input={}){
    const twAssets=(Array.isArray(input.twAssets)?input.twAssets:[]).map(model=>attachOutput(model,'TW_RESEARCH',model.instrumentId,input.asOf));
    const usAssets=(Array.isArray(input.usAssets)?input.usAssets:[]).map(model=>attachOutput(model,'US_RESEARCH',model.instrumentId,input.asOf));
    const regionalContexts={};
    for(const [region,model] of Object.entries(object(input.regionalContexts)?input.regionalContexts:{})){
      regionalContexts[region]=attachOutput(model,'REGIONAL_CONTEXT','REGION:'+region,input.asOf);
    }
    return publishHome({...input,twAssets,usAssets,regionalContexts:Object.freeze(regionalContexts)});
  }

  return Object.freeze({remember,publish});
}

function createStagingSourcePipeline({fetchImpl,clock=Date.now,publishHome,researchHistory,providerGovernance,lineageStore}={}){
  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');
  if(typeof publishHome!=='function')throw Error('PUBLISH_HOME_REQUIRED');
  const history=validateResearchHistory(researchHistory);
  const providerRuntime=validateProviderGovernance(providerGovernance);
  const lineage=validateLineageStore(lineageStore);

  const bindings=createOfficialSourceBindings();

  function preflight(input,datasetReads){
    function bind(name,options){
      const binding=bindings[name](options);
      return Object.freeze({async load(){
        let envelope;
        const startedAt=Number(clock());
        try{envelope=await binding.load()}catch(error){
          envelope={status:'UNAVAILABLE',sourceId:binding.lineageMeta.sourceId,
            lineageMeta:binding.lineageMeta,reason:error?.message||'CANONICAL_VALIDATION_FAILED',
            fetchStartedAt:startedAt,receivedAt:Number(clock()),data:null,researchOnly:true,executionWrite:false};
        }
        let observations=envelope.status==='AVAILABLE'?collectObservations(envelope.data):[];
        if(envelope.status==='AVAILABLE'&&!observations.some(item=>item?.status!=='UNAVAILABLE'&&finite(item?.observedAt))){
          envelope={...envelope,status:'UNAVAILABLE',
            reason:observations.length?'CANONICAL_OBSERVATIONS_UNAVAILABLE':'CANONICAL_OBSERVATIONS_EMPTY',data:null};
          observations=[];
        }
        const observedTimes=observations.map(item=>item?.observedAt).filter(finite);
        datasetReads.push(Object.freeze({
          sourceId:envelope.sourceId,datasetId:envelope.lineageMeta.datasetId,
          subjectId:options.instrument?.instrumentId||options.symbol||null,
          status:envelope.status,reason:envelope.reason||null,
          receivedAt:envelope.receivedAt,
          observedAt:observedTimes.length?Math.max(...observedTimes):null
        }));
        return envelope;
      }});
    }
    const usedProviderIds=new Set();
    const loaderFor=(sourceId,endpoint)=>makeLoader(sourceId,endpoint,fetchImpl,clock,providerRuntime,usedProviderIds);

    const twQuotes=arrayConfig(input.twQuotes,'TW_QUOTES').map(item=>{
      if(!object(item))throw Error('TW_QUOTE_CONFIG_INVALID');
      const exchange=taiwanExchange(item.exchange);
      const sourceId=exchange==='TWSE'?'twse-openapi':'tpex-openapi';
      const loader=loaderFor(sourceId,item.endpoint);
      const binding=exchange==='TWSE'
        ?bind('twseDailyQuote',{loader,symbol:item.symbol})
        :bind('tpexDailyQuote',{loader,symbol:item.symbol});
      return Object.freeze({
        exchange,
        symbol:String(item.symbol||''),
        binding
      });
    });

    const twAssets=arrayConfig(input.twAssets,'TW_ASSETS').map(item=>{
      if(!object(item))throw Error('TW_ASSET_CONFIG_INVALID');
      if(history&&(item.previousRevenue!==undefined||item.institutionalSessions!==undefined)){
        throw Error('RESEARCH_HISTORY_OVERRIDE_FORBIDDEN');
      }
      const policy=assertTWPolicy(item.policy);
      const exchange=taiwanExchange(item.exchange);
      let quoteBinding;
      let flowBinding;
      let revenueBinding=null;

      if(exchange==='TWSE'){
        const quoteLoader=loaderFor('twse-openapi',item.quoteEndpoint);
        const flowLoader=loaderFor('twse-t86',item.flowEndpoint);
        quoteBinding=bind('twseDailyQuote',{loader:quoteLoader,symbol:item.symbol});
        flowBinding=bind('twseInstitutional',{loader:flowLoader,symbol:item.symbol,tradeDate:item.tradeDate});
        if(item.revenueEndpoint!==undefined){
          const revenueLoader=loaderFor('twse-openapi',item.revenueEndpoint);
          revenueBinding=bind('twseMonthlyRevenue',{loader:revenueLoader,symbol:item.symbol});
        }
      }else{
        const quoteLoader=loaderFor('tpex-openapi',item.quoteEndpoint);
        const flowLoader=loaderFor('tpex-openapi',item.flowEndpoint);
        quoteBinding=bind('tpexDailyQuote',{loader:quoteLoader,symbol:item.symbol});
        flowBinding=bind('tpexInstitutional',{loader:flowLoader,symbol:item.symbol});
        if(item.revenueEndpoint!==undefined){
          const revenueLoader=loaderFor('tpex-openapi',item.revenueEndpoint);
          revenueBinding=bind('tpexMonthlyRevenue',{loader:revenueLoader,symbol:item.symbol});
        }
      }

      return Object.freeze({
        exchange,
        config:item,
        policy,
        quoteBinding,
        flowBinding,
        revenueBinding
      });
    });

    const usAssets=arrayConfig(input.usAssets,'US_ASSETS').map(item=>{
      if(!object(item)||!object(item.sec))throw Error('US_ASSET_CONFIG_INVALID');
      const loader=loaderFor('sec-edgar',item.sec.endpoint);
      const binding=bind('secCompanyFact',{
        loader,
        instrument:item.instrument,
        taxonomy:item.sec.taxonomy,
        concept:item.sec.concept,
        unit:item.sec.unit
      });
      return Object.freeze({config:item,binding});
    });

    const regions={};
    const regionConfig=input.regions===undefined?{}:input.regions;
    if(!object(regionConfig))throw Error('REGIONS_INVALID');
    for(const [region,value] of Object.entries(regionConfig)){
      if(!object(value))throw Error('REGION_CONFIG_INVALID:'+region);
      const sources=[];
      for(const item of arrayConfig(value.bls,'REGION_BLS')){
        if(!object(item))throw Error('REGION_BLS_CONFIG_INVALID');
        const loader=loaderFor('bls-public',item.endpoint);
        sources.push(bind('blsSeries',{loader,definitions:item.definitions}));
      }
      for(const item of arrayConfig(value.ecb,'REGION_ECB')){
        if(!object(item))throw Error('REGION_ECB_CONFIG_INVALID');
        const loader=loaderFor('ecb-data',item.endpoint);
        sources.push(bind('ecbSeries',{loader,definition:item.definition}));
      }
      regions[region]=Object.freeze(sources);
    }

    return Object.freeze({
      twQuotes:Object.freeze(twQuotes),
      twAssets:Object.freeze(twAssets),
      usAssets:Object.freeze(usAssets),
      regions:Object.freeze(regions),
      providerIds:Object.freeze([...usedProviderIds].sort())
    });
  }

  function twLoader(item,historyWrites,lineageContext){
    return async()=>{
      const quote=await item.quoteBinding.load();
      if(quote.status==='UNAVAILABLE')return readonlyEnvelope('UNAVAILABLE',null,'QUOTE_'+quote.reason);

      const instrumentId=quote.data?.instrument?.instrumentId;
      if(typeof instrumentId!=='string'||!instrumentId)throw Error('TW_INSTRUMENT_ID_INVALID');
      if(lineageContext)lineageContext.remember('TW_RESEARCH',instrumentId,quote,instrumentId);

      const flow=await item.flowBinding.load();
      if(flow.status==='UNAVAILABLE')return readonlyEnvelope('UNAVAILABLE',null,'FLOW_'+flow.reason);
      if(lineageContext)lineageContext.remember('TW_RESEARCH',instrumentId,flow,instrumentId);

      const cfg=item.config;
      let currentRevenue=cfg.currentRevenue||null;
      if(item.revenueBinding){
        const revenue=await item.revenueBinding.load();
        currentRevenue=revenue.status==='AVAILABLE'?revenue.data:null;
        if(lineageContext&&revenue.status==='AVAILABLE')lineageContext.remember('TW_RESEARCH',instrumentId,revenue,instrumentId);
      }

      let institutionalSessions;
      let previousRevenue;
      if(history){
        institutionalSessions=history.institutionalSessions(instrumentId);
        previousRevenue=currentRevenue?history.previousRevenue(instrumentId,currentRevenue.reportPeriod):null;
      }else{
        institutionalSessions=Array.isArray(cfg.institutionalSessions)?[...cfg.institutionalSessions]:[];
        previousRevenue=cfg.previousRevenue||null;
      }

      if(history){
        historyWrites.push(Object.freeze({
          session:Object.freeze({quote:quote.data,flow:flow.data}),
          revenue:currentRevenue,
          meta:historyMeta(item)
        }));
      }

      return readonlyEnvelope('AVAILABLE',Object.freeze({
        policy:item.policy,
        currentQuote:quote.data,
        currentFlow:flow.data,
        institutionalSessions:Object.freeze([...institutionalSessions]),
        currentRevenue,
        previousRevenue,
        researchEvidence:Object.freeze(Array.isArray(cfg.researchEvidence)?[...cfg.researchEvidence]:[])
      }));
    };
  }

  function usLoader(item,lineageContext){
    return async()=>{
      const source=await item.binding.load();
      if(source.status==='UNAVAILABLE')return source;
      const cfg=item.config;
      const instrumentId=cfg.instrument?.instrumentId;
      if(typeof instrumentId!=='string'||!instrumentId)throw Error('US_INSTRUMENT_ID_INVALID');
      if(lineageContext)lineageContext.remember('US_RESEARCH',instrumentId,source,instrumentId);
      return readonlyEnvelope('AVAILABLE',Object.freeze({
        instrument:cfg.instrument,
        fundamentalFacts:Object.freeze([source.data]),
        researchEvidence:Object.freeze(Array.isArray(cfg.researchEvidence)?[...cfg.researchEvidence]:[]),
        earlyEvidence:Object.freeze(Array.isArray(cfg.earlyEvidence)?[...cfg.earlyEvidence]:[]),
        earnings:cfg.earnings||null,
        realtimeQuoteAvailable:cfg.realtimeQuoteAvailable===true,
        consensusAvailable:cfg.consensusAvailable===true,
        optionsAvailable:cfg.optionsAvailable===true
      }));
    };
  }

  function regionLoader(region,sourceBindings,lineageContext){
    return async()=>{
      const available=[];
      for(const binding of sourceBindings){
        const source=await binding.load();
        if(source.status==='AVAILABLE'){
          available.push(source.data);
          if(lineageContext)lineageContext.remember('REGIONAL_CONTEXT','REGION:'+region,source,'REGION:'+region);
        }
      }
      if(!available.length)return readonlyEnvelope('UNAVAILABLE',null,'ALL_SOURCES_UNAVAILABLE');

      const observations=[];
      for(const data of available)observations.push(...collectObservations(data));
      return readonlyEnvelope('AVAILABLE',Object.freeze({
        observations:Object.freeze(observations),
        facts:Object.freeze(available.flatMap(regionalFacts)),
        events:Object.freeze([]),
        evidence:Object.freeze([]),
        expectations:Object.freeze([]),
        scenarios:Object.freeze([]),
        rotation:Object.freeze([]),
        catalysts:Object.freeze([]),
        risks:Object.freeze([])
      }));
    };
  }

  function providerHealth(providerIds){
    if(!providerRuntime)return Object.freeze({});
    const snapshots={};
    for(const id of providerIds)snapshots[id]=providerRuntime.snapshot(id);
    return Object.freeze(snapshots);
  }

  async function run(input={}){
    if(!finite(input.nowMs)||input.nowMs<0)throw Error('NOW_INVALID');
    if(lineage)assertLineageTraceableInputs(input);

    // Build every loader/binding, validate governance, and reject manual history
    // overrides before the first network request.
    const datasetReads=[];
    const plan=preflight(input,datasetReads);
    const publishWithDiagnostics=value=>publishHome({...value,providerDiagnostics:buildProviderDiagnostics({
      asOf:Math.max(value.asOf,Number(clock())),providerHealth:providerHealth(plan.providerIds),datasets:datasetReads
    })});
    const historyWrites=[];
    const lineageContext=lineage?createRunLineageContext({store:lineage,publishHome:publishWithDiagnostics}):null;
    const orchestrator=createStagingDataOrchestrator({publishHome:lineageContext?lineageContext.publish:publishWithDiagnostics});

    const marketSources={TWSE:[],TPEX:[]};
    for(const item of plan.twQuotes){
      const source=await item.binding.load();
      const output=source.status==='AVAILABLE'
        ?Object.freeze({
          status:'AVAILABLE',
          sourceId:source.sourceId,
          instrumentId:source.data.instrument.instrumentId,
          receivedAt:source.receivedAt,
          researchOnly:true,
          executionWrite:false
        })
        :Object.freeze({
          status:'UNAVAILABLE',
          sourceId:source.sourceId,
          symbol:item.symbol,
          reason:source.reason,
          researchOnly:true,
          executionWrite:false
        });
      marketSources[item.exchange].push(output);
    }

    const regionLoaders={};
    for(const [region,sourceBindings] of Object.entries(plan.regions))regionLoaders[region]=regionLoader(region,sourceBindings,lineageContext);

    const orchestration=await orchestrator.run({
      nowMs:input.nowMs,
      crypto:input.crypto,
      twAssets:plan.twAssets.map(item=>twLoader(item,historyWrites,lineageContext)),
      usAssets:plan.usAssets.map(item=>usLoader(item,lineageContext)),
      regions:regionLoaders,
      pulses:object(input.pulses)?input.pulses:{},
      todayFocus:Array.isArray(input.todayFocus)?input.todayFocus:[],
      events:Array.isArray(input.events)?input.events:[]
    });

    // Durable research history advances only after the current Home snapshot was
    // accepted. Current observations are therefore never visible as their own
    // prior evidence during this run.
    if(history){
      for(const write of historyWrites){
        history.recordInstitutionalSession(write.session,write.meta);
        if(write.revenue)history.recordRevenue(write.revenue,write.meta);
      }
    }

    return Object.freeze({
      schemaVersion:'foxyya-staging-source-pipeline-result/1',
      asOf:orchestration.asOf,
      sources:Object.freeze({
        TWSE:Object.freeze(marketSources.TWSE),
        TPEX:Object.freeze(marketSources.TPEX)
      }),
      providerHealth:providerHealth(plan.providerIds),
      orchestration,
      researchOnly:true,
      executionWrite:false
    });
  }

  return Object.freeze({run});
}

module.exports=Object.freeze({createStagingSourcePipeline});
