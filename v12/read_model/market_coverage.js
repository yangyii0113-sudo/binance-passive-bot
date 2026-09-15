'use strict';

const {SOURCE_CATALOG,SOURCE_STATUS}=require('../providers/source_catalog.js');

const MARKETS=Object.freeze(['CRYPTO','US','TW','CN_HK','JP','KR','EU']);
const EXTERNAL_BLOCKERS=new Set(['API_KEY_REQUIRED','ENTITLEMENT_REQUIRED','LICENSE_REVIEW_REQUIRED','LICENSE_REQUIRED','DATA_PRODUCT_REQUIRED','PROVIDER_DECISION_REQUIRED']);
const BLOCKER_LABELS=Object.freeze({
  CODE_BUG:'程式錯誤',
  PROVIDER_UNAVAILABLE:'Provider 本輪失敗',
  NOT_IMPLEMENTED:'尚未完成程式接線',
  API_KEY_REQUIRED:'需要 API 金鑰',
  ENTITLEMENT_REQUIRED:'需要資料方案權限',
  LICENSE_REVIEW_REQUIRED:'授權審查中',
  LICENSE_REQUIRED:'需要資料授權',
  DATA_PRODUCT_REQUIRED:'需要資料產品',
  PROVIDER_DECISION_REQUIRED:'需要確認資料供應方案',
  DATA_STALE:'資料已過期',
  DATA_INCOMPLETE:'資料不完整'
});

const PROFILES=Object.freeze({
  CRYPTO:Object.freeze({direction:Object.freeze(['REGIME_CLASSIFICATION','EXECUTION_RUNTIME_READ','CANDIDATE_UNIVERSE']),research:Object.freeze([]),ranking:false}),
  TW:Object.freeze({direction:Object.freeze(['INDEX','MARKET_BREADTH','SECTOR_ROTATION']),research:Object.freeze(['QUOTE','INSTITUTIONAL_FLOW']),ranking:true}),
  US:Object.freeze({direction:Object.freeze(['INDEX','MARKET_BREADTH','VOLATILITY_CONTEXT']),research:Object.freeze(['FUNDAMENTAL','QUOTE']),ranking:true}),
  CN_HK:Object.freeze({direction:Object.freeze(['INDEX','MARKET_BREADTH']),research:Object.freeze(['HISTORICAL_PRICE']),ranking:false}),
  JP:Object.freeze({direction:Object.freeze(['INDEX','MARKET_BREADTH']),research:Object.freeze(['HISTORICAL_PRICE','FUNDAMENTAL']),ranking:false}),
  KR:Object.freeze({direction:Object.freeze(['INDEX','MARKET_BREADTH']),research:Object.freeze(['QUOTE']),ranking:false}),
  EU:Object.freeze({direction:Object.freeze(['MACRO','INDEX','MARKET_BREADTH']),research:Object.freeze([]),ranking:false})
});

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const array=value=>Array.isArray(value)?value:[];
const uniqSorted=value=>Object.freeze([...new Set(value)].sort());

function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

function normalizedCatalogCapabilities(source){
  const out=new Set();
  for(const raw of array(source?.capabilities)){
    if(raw==='QUOTE'||raw==='EQUITY_REFERENCE')out.add('QUOTE');
    if(raw==='KLINE'||raw==='HISTORICAL_PRICE'||raw==='HISTORICAL_DATA')out.add('HISTORICAL_PRICE');
    if(raw==='INDEX')out.add('INDEX');
    if(raw==='MARKET_BREADTH'||raw==='MARKET_STATISTICS')out.add('MARKET_BREADTH');
    if(raw==='SECTOR_INDEX')out.add('SECTOR_ROTATION');
    if(raw==='INSTITUTIONAL_FLOW')out.add('INSTITUTIONAL_FLOW');
    if(raw==='FUTURES_POSITIONING')out.add('FUTURES_POSITIONING');
    if(['FILINGS','XBRL','FORM4','BENEFICIAL_OWNERSHIP','CORPORATE_OPEN_DATA','MONTHLY_REVENUE','FINANCIAL_DISCLOSURE','CORPORATE_DISCLOSURE','FINANCIALS'].includes(raw))out.add('FUNDAMENTAL');
    if(['CPI','EMPLOYMENT','MACRO_SERIES','FED_POLICY','FED_SPEECH','FED_RELEASE','RATES_CONTEXT','RATES','FX','EU_MACRO'].includes(raw))out.add('MACRO');
    if(['FUNDING','OPEN_INTEREST','DERIVATIVES_CONTEXT','OPTIONS_FLOW','IV','SKEW','TERM_STRUCTURE'].includes(raw))out.add('DERIVATIVES_CONTEXT');
    if(['VOLATILITY_INDEX','IV','SKEW','TERM_STRUCTURE'].includes(raw))out.add('VOLATILITY_CONTEXT');
    if(['NEWS','CATALYST'].includes(raw))out.add('NEWS');
    if(['ECONOMIC_CALENDAR','EVENT_SCHEDULE'].includes(raw))out.add('EVENT_CALENDAR');
  }
  return out;
}

function datasetCapabilities(row){
  const id=typeof row?.datasetId==='string'?row.datasetId:'';
  const out=new Set();
  if(id==='TWSE:STOCK_DAY_ALL'||id==='TPEX:tpex_mainboard_daily_close_quotes')out.add('QUOTE');
  if(id==='TWELVEDATA:QUOTE:US_DEFAULT')out.add('QUOTE');
  if(id==='TWELVEDATA:VOLATILITY:US')out.add('VOLATILITY_CONTEXT');
  if(id==='TWSE:T86'||id==='TPEX:tpex_3insti_daily_trading')out.add('INSTITUTIONAL_FLOW');
  if(id==='TWSE:t187ap05_L'||id==='TPEX:mopsfin_t187ap05_O'||id==='SEC:companyfacts')out.add('FUNDAMENTAL');
  if(id==='TWSE:MI_INDEX'){out.add('INDEX');out.add('MARKET_BREADTH');out.add('SECTOR_ROTATION');}
  if(id==='TPEX:tpex_mainborad_highlight'){out.add('INDEX');out.add('MARKET_BREADTH');}
  if(id==='TPEX:tpex_trading_volume_ratio')out.add('SECTOR_ROTATION');
  if(id==='CFTC:TFF:gpe5-46if:EQUITY_INDEX')out.add('FUTURES_POSITIONING');
  if(id.startsWith('BLS:')||id.startsWith('ECB:'))out.add('MACRO');
  return out;
}

function sourceMarkets(catalog,market){return catalog.filter(source=>source?.authority!=='SCRAPED'&&array(source?.markets).includes(market));}
function sourceForId(catalog,id){return catalog.find(source=>source?.id===id&&source?.authority!=='SCRAPED')||null;}

function homePulse(home,market){return array(home?.marketPulse).find(row=>row?.market===market)||null;}
function homeRegion(home,market){return array(home?.regions).find(row=>row?.region===market)||null;}
function researchRows(home,market){return array(home?.opportunities?.[market]);}

function inferDerivedCapabilities({market,home,cryptoExecution,researchPerformance}){
  const caps=new Set();
  const times=[];
  let stale=false;
  const pulse=homePulse(home,market);
  const region=homeRegion(home,market);
  const rows=researchRows(home,market);

  if(market==='CRYPTO'){
    if(object(cryptoExecution)&&cryptoExecution.schema==='foxyya-v12-crypto-execution-read/1'&&cryptoExecution.readOnly===true&&cryptoExecution.paperOnly===true&&cryptoExecution.realOrderLock===true){
      caps.add('EXECUTION_RUNTIME_READ');
      if(Array.isArray(cryptoExecution.candidates))caps.add('CANDIDATE_UNIVERSE');
      if(finite(cryptoExecution.asOf))times.push(cryptoExecution.asOf);
    }
    if(pulse?.status==='AVAILABLE'&&pulse?.data?.regimeStatus==='AVAILABLE')caps.add('REGIME_CLASSIFICATION');
    if(pulse?.data?.regimeStatus==='STALE')stale=true;
    if(finite(pulse?.asOf))times.push(pulse.asOf);
  }

  if(market==='TW'){
    if(pulse?.status==='AVAILABLE'&&pulse?.data?.directionCoverage==='COMPLETE'){
      caps.add('INDEX');caps.add('MARKET_BREADTH');
    }
    if(pulse?.status==='AVAILABLE'&&pulse?.data?.industryCoverage==='COMPLETE')caps.add('SECTOR_ROTATION');
    if(rows.length){caps.add('QUOTE');caps.add('INSTITUTIONAL_FLOW');}
    if(finite(pulse?.asOf))times.push(pulse.asOf);
  }

  if(market==='US'&&rows.length)caps.add('FUNDAMENTAL');
  if((market==='US'||market==='EU')&&region?.status==='AVAILABLE'&&array(region?.facts).length)caps.add('MACRO');
  if(finite(region?.asOf))times.push(region.asOf);

  const perf=researchPerformance?.[market==='TW'?'tw':market==='US'?'us':null];
  if(perf&&perf.status==='AVAILABLE')caps.add('FORWARD_VALIDATION');

  for(const event of array(home?.events)){
    const markets=array(event?.markets||event?.relatedMarkets);
    if(markets.includes(market)){
      if(event?.kind==='NEWS')caps.add('NEWS');
      if(event?.kind==='CALENDAR')caps.add('EVENT_CALENDAR');
    }
  }
  return {caps,times,stale,rows};
}

function blocker(type,capability,sourceId,reason){
  return deepFreeze({type,capability,sourceId:sourceId||null,reason,externalActionRequired:EXTERNAL_BLOCKERS.has(type),userFacingLabel:BLOCKER_LABELS[type]||'資料限制'});
}

function externalBlockersForSource(source,capability){
  const out=[];
  if(source?.status===SOURCE_STATUS.KEY_REQUIRED){
    out.push(blocker('API_KEY_REQUIRED',capability,source.id,'SOURCE_ACTIVATION_REQUIRES_API_KEY'));
    if(source.entitlementRequired===true)out.push(blocker('ENTITLEMENT_REQUIRED',capability,source.id,'SOURCE_ACTIVATION_REQUIRES_ENTITLEMENT'));
  }else if(source?.status===SOURCE_STATUS.LICENSE_REQUIRED){
    out.push(blocker('LICENSE_REQUIRED',capability,source.id,'SOURCE_LICENSE_REQUIRED_FOR_SERVER_SIDE_RESEARCH'));
  }else if(source?.status===SOURCE_STATUS.REVIEW_REQUIRED){
    if(source.accessClass==='PRODUCT_DEPENDENT')out.push(blocker('DATA_PRODUCT_REQUIRED',capability,source.id,'COMMERCIAL_DATA_PRODUCT_REQUIRED'));
    out.push(blocker('LICENSE_REVIEW_REQUIRED',capability,source.id,'SOURCE_REQUIRES_LICENSE_REVIEW'));
  }else if(source?.status===SOURCE_STATUS.DECISION_REQUIRED){
    out.push(blocker('PROVIDER_DECISION_REQUIRED',capability,source.id,'PROVIDER_SELECTION_REQUIRED'));
  }
  return out;
}

function readiness(required,available){
  if(!required.length)return 'NOT_READY';
  const count=required.filter(cap=>available.has(cap)).length;
  if(count===required.length)return 'READY';
  return count>0?'PARTIAL':'NOT_READY';
}

function activationState(profile,catalog,market){
  const required=[...profile.direction,...profile.research];
  const relevant=sourceMarkets(catalog,market).filter(source=>{
    const caps=normalizedCatalogCapabilities(source);
    return required.some(cap=>caps.has(cap));
  });
  const active=relevant.filter(source=>source.status===SOURCE_STATUS.ADOPTED||source.status===SOURCE_STATUS.EXISTING_CORE);
  const blocked=relevant.filter(source=>source.status===SOURCE_STATUS.KEY_REQUIRED||source.status===SOURCE_STATUS.REVIEW_REQUIRED||source.status===SOURCE_STATUS.LICENSE_REQUIRED||source.status===SOURCE_STATUS.DECISION_REQUIRED);
  if(active.length&&blocked.length)return 'PARTIAL';
  if(active.length)return 'ACTIVE';
  if(blocked.length)return 'BLOCKED';
  return 'NONE';
}

function sourceProjection(source){
  return deepFreeze({
    sourceId:source.id,
    provider:source.provider||null,
    status:source.status,
    authority:source.authority,
    accessClass:source.accessClass,
    capabilities:uniqSorted([...normalizedCatalogCapabilities(source)]),
    secretRequired:source.secretRequired===true,
    entitlementRequired:source.entitlementRequired===true,
    researchOnly:true,
    executionWrite:false
  });
}

function buildMarket({market,asOf,catalog,providerDiagnostics,home,cryptoExecution,researchPerformance}){
  const profile=PROFILES[market];
  const derived=inferDerivedCapabilities({market,home,cryptoExecution,researchPerformance});
  const available=new Set(derived.caps);
  const evidenceTimes=[...derived.times];
  const datasetRows=[];
  const failedCaps=new Map();
  const marketSources=sourceMarkets(catalog,market);
  const marketSourceIds=new Set(marketSources.map(x=>x.id));

  for(const row of array(providerDiagnostics?.datasets)){
    const source=sourceForId(catalog,row?.sourceId);
    if(!source||!marketSourceIds.has(source.id))continue;
    const caps=datasetCapabilities(row);
    if(!caps.size)continue;
    datasetRows.push(row);
    if(row.status==='AVAILABLE'){
      for(const cap of caps)available.add(cap);
      if(finite(row.observedAt))evidenceTimes.push(row.observedAt);
      if(finite(row.receivedAt))evidenceTimes.push(row.receivedAt);
    }else{
      for(const cap of caps){
        if(!failedCaps.has(cap))failedCaps.set(cap,[]);
        failedCaps.get(cap).push(row.sourceId);
      }
    }
  }

  for(const [cap,failedSourceIds] of failedCaps){
    const hasAvailableDataset=datasetRows.some(row=>row.status==='AVAILABLE'&&datasetCapabilities(row).has(cap));
    if(!hasAvailableDataset&&(cap==='QUOTE'||cap==='INSTITUTIONAL_FLOW'))available.delete(cap);
  }

  const targetRequired=uniqSorted([...profile.direction,...profile.research]);
  const missing=targetRequired.filter(cap=>!available.has(cap));
  const blockers=[];

  for(const cap of missing){
    const runtimeFailures=failedCaps.get(cap)||[];
    if(runtimeFailures.length){
      for(const sourceId of runtimeFailures)blockers.push(blocker('PROVIDER_UNAVAILABLE',cap,sourceId,'RUNTIME_DATASET_UNAVAILABLE'));
      continue;
    }
    const candidates=marketSources.filter(source=>normalizedCatalogCapabilities(source).has(cap));
    const external=candidates.flatMap(source=>externalBlockersForSource(source,cap));
    if(external.length){blockers.push(...external);continue;}
    if(candidates.length){
      blockers.push(blocker('NOT_IMPLEMENTED',cap,candidates[0].id,'NO_VERIFIED_RUNTIME_EVIDENCE'));
    }else{
      blockers.push(blocker('NOT_IMPLEMENTED',cap,null,'NO_APPROVED_SOURCE_PATH'));
    }
  }

  const directionReadiness=readiness(profile.direction,available);
  const researchReadiness=readiness(profile.research,available);
  const allRequiredReady=missing.length===0;
  const hasExternalBlocker=blockers.some(row=>EXTERNAL_BLOCKERS.has(row.type));
  const meaningfulAvailable=targetRequired.some(cap=>available.has(cap));
  const coverageStatus=allRequiredReady?'READY':hasExternalBlocker?'BLOCKED':meaningfulAvailable?'PARTIAL':'UNAVAILABLE';
  const rankingEligibility=profile.ranking?(researchReadiness==='READY'?'ELIGIBLE':researchReadiness==='PARTIAL'?'LIMITED':'NOT_ELIGIBLE'):'NOT_ELIGIBLE';

  const uniqueProviders=new Set(datasetRows.map(row=>row.sourceId));
  const regionalFacts=array(homeRegion(home,market)?.facts);
  const highImpactEventCount=array(home?.events).filter(event=>{
    const markets=array(event?.markets||event?.relatedMarkets);
    return markets.includes(market)&&(event?.impact==='HIGH'||event?.impact==='EXTREME');
  }).length;
  const observedTimes=datasetRows.map(row=>row.observedAt).filter(finite);
  const receivedTimes=datasetRows.map(row=>row.receivedAt).filter(finite);
  const stale=derived.stale||datasetRows.some(row=>row.status==='STALE'||String(row.reason||'').includes('STALE'));
  const freshnessStatus=stale?'STALE':evidenceTimes.length||observedTimes.length||receivedTimes.length?'FRESH':'UNKNOWN';

  const dedupedBlockers=[];
  const blockerKeys=new Set();
  for(const row of blockers){const key=[row.type,row.capability,row.sourceId].join('|');if(!blockerKeys.has(key)){blockerKeys.add(key);dedupedBlockers.push(row)}}

  return deepFreeze({
    market,
    coverageStatus,
    activationState:activationState(profile,catalog,market),
    directionReadiness,
    researchReadiness,
    rankingEligibility,
    availableCapabilities:uniqSorted([...available]),
    missingCapabilities:Object.freeze([...missing]),
    blockers:Object.freeze(dedupedBlockers),
    sources:Object.freeze(marketSources.map(sourceProjection)),
    freshness:Object.freeze({
      status:freshnessStatus,
      freshestObservedAt:observedTimes.length?Math.max(...observedTimes):null,
      freshestReceivedAt:receivedTimes.length?Math.max(...receivedTimes):null,
      oldestRequiredObservedAt:observedTimes.length?Math.min(...observedTimes):null
    }),
    evidenceCounts:Object.freeze({
      providerCount:uniqueProviders.size,
      availableDatasetCount:datasetRows.filter(row=>row.status==='AVAILABLE').length,
      unavailableDatasetCount:datasetRows.filter(row=>row.status!=='AVAILABLE').length,
      researchInstrumentCount:derived.rows.length,
      regionalFactCount:regionalFacts.length,
      highImpactEventCount
    }),
    summaryCode:`${market}_${coverageStatus}`,
    researchOnly:true,
    executionWrite:false
  });
}

function buildMarketCoverage({asOf,sourceCatalog=SOURCE_CATALOG,providerDiagnostics=null,home=null,cryptoExecution=null,researchPerformance=null}={}){
  if(!finite(asOf)||asOf<0)throw Error('ASOF_INVALID');
  const catalog=Array.isArray(sourceCatalog)?sourceCatalog:[];
  const markets={};
  for(const market of MARKETS)markets[market]=buildMarket({market,asOf,catalog,providerDiagnostics,home,cryptoExecution,researchPerformance});
  return deepFreeze({schemaVersion:'foxyya-market-coverage/1',asOf,markets,researchOnly:true,executionWrite:false});
}

module.exports=Object.freeze({MARKETS,PROFILES,buildMarketCoverage});
