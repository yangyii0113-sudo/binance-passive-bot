'use strict';

const Home=require('../ui/home_model.js');
const Regional=require('../intelligence/regional_engine.js');

const finite=x=>typeof x==='number'&&Number.isFinite(x);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);

function assertResearchReadOnly(asset){
  if(!object(asset))throw Error('ASSET_READ_MODEL_REQUIRED');
  if(asset.researchOnly!==true||asset.executionWrite!==false)throw Error('RESEARCH_READ_ONLY_REQUIRED');
  if(typeof asset.instrumentId!=='string'||!asset.instrumentId)throw Error('INSTRUMENT_ID_REQUIRED');
  if(asset.market!=='TW'&&asset.market!=='US')throw Error('EQUITY_MARKET_REQUIRED');
  return asset;
}

function assertCryptoReadOnly(view){
  if(!view)return null;
  if(!object(view)||view.schema!=='foxyya-v12-crypto-execution-read/1'||view.readOnly!==true||view.paperOnly!==true||view.realOrderLock!==true){
    throw Error('CRYPTO_READ_ONLY_REQUIRED');
  }
  if(!Array.isArray(view.candidates))throw Error('CRYPTO_CANDIDATES_REQUIRED');
  return view;
}

function assertRegionalReadOnly(region,value){
  if(!object(value)||value.schemaVersion!=='foxyya-regional-context-read-model/1'||value.researchOnly!==true||value.executionWrite!==false){
    throw Error('REGIONAL_READ_ONLY_REQUIRED');
  }
  if(value.region!==region||!object(value.regionalSnapshot)||value.regionalSnapshot.region!==region){
    throw Error('REGION_CONTEXT_MISMATCH');
  }
  return value;
}

function withRegionStatus(snapshot,status){
  return Object.freeze({...snapshot,status});
}

function regionSnapshots(regionEvidence,regionalContexts,asOf){
  const evidenceMap=object(regionEvidence)?regionEvidence:{};
  const contextMap=object(regionalContexts)?regionalContexts:{};
  const out={};
  for(const region of Home.REGIONS){
    if(Object.hasOwn(contextMap,region)){
      const context=assertRegionalReadOnly(region,contextMap[region]);
      out[region]=withRegionStatus(context.regionalSnapshot,'AVAILABLE');
      continue;
    }
    const evidence=Array.isArray(evidenceMap[region])?evidenceMap[region]:[];
    out[region]=withRegionStatus(Regional.evaluateRegion(region,evidence,asOf),evidence.length?'AVAILABLE':'UNAVAILABLE');
  }
  return out;
}

function equityEarlyTrend(asset){
  if(!object(asset.earlyTrend))return null;
  return Object.freeze({
    market:asset.market,
    instrumentId:asset.instrumentId,
    ...asset.earlyTrend,
    sourceLineage:Object.freeze(Array.isArray(asset.sourceLineage)?[...asset.sourceLineage]:[]),
    researchOnly:true
  });
}

function equityOpportunity(asset){
  return Object.freeze({
    market:asset.market,
    instrumentId:asset.instrumentId,
    earlyTrend:asset.earlyTrend||null,
    research:asset.research||null,
    sourceLineage:Object.freeze(Array.isArray(asset.sourceLineage)?[...asset.sourceLineage]:[]),
    researchOnly:true,
    executionWrite:false
  });
}

function cryptoOpportunity(candidate){
  return Object.freeze({...candidate,market:'CRYPTO',executionReadOnly:true,executionWrite:false});
}

function buildHomeReadModel(input={}){
  if(!finite(input.asOf)||input.asOf<0)throw Error('ASOF_INVALID');
  const crypto=assertCryptoReadOnly(input.cryptoExecution||null);
  const twAssets=(Array.isArray(input.twAssets)?input.twAssets:[]).map(assertResearchReadOnly);
  const usAssets=(Array.isArray(input.usAssets)?input.usAssets:[]).map(assertResearchReadOnly);
  if(twAssets.some(x=>x.market!=='TW'))throw Error('TW_ASSET_MARKET_MISMATCH');
  if(usAssets.some(x=>x.market!=='US'))throw Error('US_ASSET_MARKET_MISMATCH');

  const regions=regionSnapshots(input.regionEvidence,input.regionalContexts,input.asOf);
  const earlyTrend=[...twAssets,...usAssets].map(equityEarlyTrend).filter(Boolean);
  const opportunities={
    CRYPTO:crypto?crypto.candidates.map(cryptoOpportunity):[],
    US:usAssets.map(equityOpportunity),
    TW:twAssets.map(equityOpportunity)
  };

  const home=Home.buildHomeModel({
    asOf:input.asOf,
    regions,
    pulses:object(input.pulses)?input.pulses:{},
    todayFocus:Array.isArray(input.todayFocus)?input.todayFocus:[],
    earlyTrend,
    opportunities,
    events:Array.isArray(input.events)?input.events:[]
  });

  return Object.freeze({
    schemaVersion:'foxyya-home-read-model/1',
    asOf:input.asOf,
    home,
    researchOnly:true,
    executionWrite:false
  });
}

module.exports=Object.freeze({buildHomeReadModel});
