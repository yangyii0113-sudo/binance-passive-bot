'use strict';

const {createPublicSourceLoader}=require('./public_source_loader.js');
const {createOfficialSourceBindings}=require('./official_source_binding.js');
const {createStagingDataOrchestrator}=require('./data_orchestrator.js');
const EvidencePolicy=require('../early_trend/evidence_policy.js');

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

function makeLoader(sourceId,endpoint,fetchImpl,clock){
  return createPublicSourceLoader({sourceId,endpoint,fetchImpl,clock});
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

function createStagingSourcePipeline({fetchImpl,clock=Date.now,publishHome}={}){
  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');
  if(typeof publishHome!=='function')throw Error('PUBLISH_HOME_REQUIRED');

  const bindings=createOfficialSourceBindings();
  const orchestrator=createStagingDataOrchestrator({publishHome});

  function preflight(input){
    const twQuotes=arrayConfig(input.twQuotes,'TW_QUOTES').map(item=>{
      if(!object(item))throw Error('TW_QUOTE_CONFIG_INVALID');
      const loader=makeLoader('twse-openapi',item.endpoint,fetchImpl,clock);
      return Object.freeze({
        symbol:String(item.symbol||''),
        binding:bindings.twseDailyQuote({loader,symbol:item.symbol})
      });
    });

    const twAssets=arrayConfig(input.twAssets,'TW_ASSETS').map(item=>{
      if(!object(item))throw Error('TW_ASSET_CONFIG_INVALID');
      const policy=assertTWPolicy(item.policy);
      const quoteLoader=makeLoader('twse-openapi',item.quoteEndpoint,fetchImpl,clock);
      const flowLoader=makeLoader('twse-t86',item.flowEndpoint,fetchImpl,clock);
      let revenueBinding=null;
      if(item.revenueEndpoint!==undefined){
        const revenueLoader=makeLoader('twse-openapi',item.revenueEndpoint,fetchImpl,clock);
        revenueBinding=bindings.twseMonthlyRevenue({loader:revenueLoader,symbol:item.symbol});
      }
      return Object.freeze({
        config:item,
        policy,
        quoteBinding:bindings.twseDailyQuote({loader:quoteLoader,symbol:item.symbol}),
        flowBinding:bindings.twseInstitutional({loader:flowLoader,symbol:item.symbol,tradeDate:item.tradeDate}),
        revenueBinding
      });
    });

    const usAssets=arrayConfig(input.usAssets,'US_ASSETS').map(item=>{
      if(!object(item)||!object(item.sec))throw Error('US_ASSET_CONFIG_INVALID');
      const loader=makeLoader('sec-edgar',item.sec.endpoint,fetchImpl,clock);
      const binding=bindings.secCompanyFact({
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
        const loader=makeLoader('bls-public',item.endpoint,fetchImpl,clock);
        sources.push(bindings.blsSeries({loader,definitions:item.definitions}));
      }
      for(const item of arrayConfig(value.ecb,'REGION_ECB')){
        if(!object(item))throw Error('REGION_ECB_CONFIG_INVALID');
        const loader=makeLoader('ecb-data',item.endpoint,fetchImpl,clock);
        sources.push(bindings.ecbSeries({loader,definition:item.definition}));
      }
      regions[region]=Object.freeze(sources);
    }

    return Object.freeze({
      twQuotes:Object.freeze(twQuotes),
      twAssets:Object.freeze(twAssets),
      usAssets:Object.freeze(usAssets),
      regions:Object.freeze(regions)
    });
  }

  function twLoader(item){
    return async()=>{
      const quote=await item.quoteBinding.load();
      if(quote.status==='UNAVAILABLE')return readonlyEnvelope('UNAVAILABLE',null,'QUOTE_'+quote.reason);

      const flow=await item.flowBinding.load();
      if(flow.status==='UNAVAILABLE')return readonlyEnvelope('UNAVAILABLE',null,'FLOW_'+flow.reason);

      const cfg=item.config;
      let currentRevenue=cfg.currentRevenue||null;
      if(item.revenueBinding){
        const revenue=await item.revenueBinding.load();
        currentRevenue=revenue.status==='AVAILABLE'?revenue.data:null;
      }

      return readonlyEnvelope('AVAILABLE',Object.freeze({
        policy:item.policy,
        currentQuote:quote.data,
        currentFlow:flow.data,
        institutionalSessions:Object.freeze(Array.isArray(cfg.institutionalSessions)?[...cfg.institutionalSessions]:[]),
        currentRevenue,
        previousRevenue:cfg.previousRevenue||null,
        researchEvidence:Object.freeze(Array.isArray(cfg.researchEvidence)?[...cfg.researchEvidence]:[])
      }));
    };
  }

  function usLoader(item){
    return async()=>{
      const source=await item.binding.load();
      if(source.status==='UNAVAILABLE')return source;
      const cfg=item.config;
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

  function regionLoader(sourceBindings){
    return async()=>{
      const available=[];
      for(const binding of sourceBindings){
        const source=await binding.load();
        if(source.status==='AVAILABLE')available.push(source.data);
      }
      if(!available.length)return readonlyEnvelope('UNAVAILABLE',null,'ALL_SOURCES_UNAVAILABLE');

      const observations=[];
      for(const data of available)observations.push(...collectObservations(data));
      return readonlyEnvelope('AVAILABLE',Object.freeze({
        observations:Object.freeze(observations),
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

  async function run(input={}){
    if(!finite(input.nowMs)||input.nowMs<0)throw Error('NOW_INVALID');

    // Build every loader/binding and validate policies before the first network
    // request so forbidden endpoints and invalid governance fail closed.
    const plan=preflight(input);

    const twse=[];
    for(const item of plan.twQuotes){
      const source=await item.binding.load();
      if(source.status==='AVAILABLE'){
        twse.push(Object.freeze({
          status:'AVAILABLE',
          sourceId:source.sourceId,
          instrumentId:source.data.instrument.instrumentId,
          receivedAt:source.receivedAt,
          researchOnly:true,
          executionWrite:false
        }));
      }else{
        twse.push(Object.freeze({
          status:'UNAVAILABLE',
          sourceId:source.sourceId,
          symbol:item.symbol,
          reason:source.reason,
          researchOnly:true,
          executionWrite:false
        }));
      }
    }

    const regionLoaders={};
    for(const [region,sourceBindings] of Object.entries(plan.regions))regionLoaders[region]=regionLoader(sourceBindings);

    const orchestration=await orchestrator.run({
      nowMs:input.nowMs,
      twAssets:plan.twAssets.map(twLoader),
      usAssets:plan.usAssets.map(usLoader),
      regions:regionLoaders,
      pulses:object(input.pulses)?input.pulses:{},
      todayFocus:Array.isArray(input.todayFocus)?input.todayFocus:[],
      events:Array.isArray(input.events)?input.events:[]
    });

    return Object.freeze({
      schemaVersion:'foxyya-staging-source-pipeline-result/1',
      asOf:input.nowMs,
      sources:Object.freeze({TWSE:Object.freeze(twse)}),
      orchestration,
      researchOnly:true,
      executionWrite:false
    });
  }

  return Object.freeze({run});
}

module.exports=Object.freeze({createStagingSourcePipeline});
