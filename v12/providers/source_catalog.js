'use strict';

const SOURCE_STATUS=Object.freeze({
  EXISTING_CORE:'EXISTING_CORE',
  ADOPTED:'ADOPTED',
  KEY_REQUIRED:'KEY_REQUIRED',
  REVIEW_REQUIRED:'REVIEW_REQUIRED',
  DECISION_REQUIRED:'DECISION_REQUIRED',
});

const source=(x)=>Object.freeze({
  priority:1,
  authority:'OFFICIAL',
  accessClass:'PUBLIC',
  serverOnly:true,
  secretRequired:false,
  liveEligible:false,
  latencyClass:'UNKNOWN',
  evidenceRole:'FACT',
  capabilities:[],
  markets:[],
  ...x,
});

const SOURCE_CATALOG=Object.freeze([
  source({id:'binance-usdm-public',provider:'Binance USD-M Public API',status:SOURCE_STATUS.EXISTING_CORE,markets:['CRYPTO'],capabilities:['QUOTE','KLINE','FUNDING','OPEN_INTEREST','DERIVATIVES_CONTEXT'],serverOnly:false,liveEligible:true,latencyClass:'REALTIME'}),
  source({id:'sec-edgar',provider:'SEC EDGAR data.sec.gov',status:SOURCE_STATUS.ADOPTED,markets:['US'],capabilities:['FILINGS','XBRL','FORM4','BENEFICIAL_OWNERSHIP'],latencyClass:'FILING_DRIVEN'}),
  source({id:'us-equity-realtime',provider:null,status:SOURCE_STATUS.DECISION_REQUIRED,authority:'LICENSED',accessClass:'LICENSED',markets:['US'],capabilities:['QUOTE','INTRADAY_CHART','RELATIVE_VOLUME'],latencyClass:'UNRESOLVED',liveEligible:false}),
  source({id:'finra-research',provider:'FINRA Developer APIs / OTC Transparency',status:SOURCE_STATUS.ADOPTED,markets:['US'],capabilities:['SHORT_VOLUME','SHORT_INTEREST','OTC_ACTIVITY'],latencyClass:'DELAYED',evidenceRole:'CONFIRMATION'}),
  source({id:'bls-public',provider:'BLS Public Data API',status:SOURCE_STATUS.ADOPTED,markets:['GLOBAL','US'],capabilities:['CPI','EMPLOYMENT','MACRO_SERIES'],latencyClass:'RELEASE_DRIVEN'}),
  source({id:'fed-official',provider:'Federal Reserve official feeds',status:SOURCE_STATUS.ADOPTED,markets:['GLOBAL','US'],capabilities:['FED_POLICY','FED_SPEECH','FED_RELEASE','RATES_CONTEXT'],latencyClass:'RELEASE_DRIVEN'}),
  source({id:'cftc-cot',provider:'CFTC COT Public Reporting API',status:SOURCE_STATUS.ADOPTED,markets:['GLOBAL','US'],capabilities:['FUTURES_POSITIONING'],latencyClass:'WEEKLY',evidenceRole:'CONFIRMATION'}),
  source({id:'twse-openapi',provider:'TWSE OpenAPI',status:SOURCE_STATUS.ADOPTED,markets:['TW'],capabilities:['EQUITY_REFERENCE','CORPORATE_OPEN_DATA','MONTHLY_REVENUE'],latencyClass:'DATASET_DEFINED'}),
  source({id:'twse-t86',provider:'TWSE T86 official institutional trading report',status:SOURCE_STATUS.ADOPTED,markets:['TW'],capabilities:['INSTITUTIONAL_FLOW'],latencyClass:'EOD_DELAYED',evidenceRole:'CONFIRMATION',liveEligible:false}),
  source({id:'tpex-openapi',provider:'TPEx OpenAPI',status:SOURCE_STATUS.ADOPTED,markets:['TW'],capabilities:['EQUITY_REFERENCE','MARGIN_SHORT','INSTITUTIONAL_FLOW'],latencyClass:'DATASET_DEFINED'}),
  source({id:'twse-mops',provider:'TWSE/MOPS official interfaces',status:SOURCE_STATUS.REVIEW_REQUIRED,markets:['TW'],capabilities:['FINANCIAL_DISCLOSURE','CORPORATE_DISCLOSURE','MONTHLY_REVENUE'],latencyClass:'FILING_DRIVEN'}),
  source({id:'krx-openapi',provider:'KRX Data Marketplace Open API',status:SOURCE_STATUS.KEY_REQUIRED,markets:['KR'],capabilities:['EQUITY_REFERENCE','INDEX','MARKET_STATISTICS'],accessClass:'API_KEY',secretRequired:true,serverOnly:true,latencyClass:'DATASET_DEFINED'}),
  source({id:'jpx-jquants',provider:'JPX J-Quants API V2',status:SOURCE_STATUS.KEY_REQUIRED,markets:['JP'],capabilities:['EQUITY_REFERENCE','HISTORICAL_PRICE','FINANCIALS','EARNINGS_SCHEDULE'],accessClass:'API_KEY',secretRequired:true,serverOnly:true,latencyClass:'PLAN_DEFINED'}),
  source({id:'hkex-marketplace',provider:'HKEX Data Marketplace',status:SOURCE_STATUS.REVIEW_REQUIRED,markets:['CN_HK'],capabilities:['EQUITY_REFERENCE','HOLDINGS','HISTORICAL_DATA'],accessClass:'PRODUCT_DEPENDENT',secretRequired:false,serverOnly:true,latencyClass:'PRODUCT_DEFINED'}),
  source({id:'ecb-data',provider:'ECB Data Portal API',status:SOURCE_STATUS.ADOPTED,markets:['EU','GLOBAL'],capabilities:['RATES','FX','EU_MACRO'],latencyClass:'SERIES_DEFINED'}),
  source({id:'eu-equity-realtime',provider:null,status:SOURCE_STATUS.DECISION_REQUIRED,authority:'LICENSED',accessClass:'LICENSED',markets:['EU'],capabilities:['QUOTE','MARKET_BREADTH'],latencyClass:'UNRESOLVED',liveEligible:false}),
  source({id:'official-news',provider:'Official issuer/regulator/central-bank feeds',status:SOURCE_STATUS.ADOPTED,markets:['GLOBAL','CRYPTO','US','TW','KR','JP','CN_HK','EU'],capabilities:['NEWS','CATALYST'],accessClass:'MIXED',latencyClass:'RELEASE_DRIVEN'}),
  source({id:'official-calendar',provider:'Official BLS/Fed/issuer schedules',status:SOURCE_STATUS.ADOPTED,markets:['GLOBAL','CRYPTO','US','TW','KR','JP','CN_HK','EU'],capabilities:['ECONOMIC_CALENDAR','EVENT_SCHEDULE'],latencyClass:'SCHEDULED'}),
  source({id:'us-consensus-revisions',provider:null,status:SOURCE_STATUS.DECISION_REQUIRED,authority:'LICENSED',accessClass:'LICENSED',markets:['US'],capabilities:['CONSENSUS','ESTIMATE_REVISION','TARGET_REVISION'],latencyClass:'UNRESOLVED'}),
  source({id:'us-options-analytics',provider:null,status:SOURCE_STATUS.DECISION_REQUIRED,authority:'LICENSED',accessClass:'LICENSED',markets:['US'],capabilities:['OPTIONS_FLOW','IV','SKEW','TERM_STRUCTURE'],latencyClass:'UNRESOLVED'}),
]);

function validateSourceCatalog(catalog){
  const errors=[];
  const ids=new Set();
  for(const item of catalog){
    if(!item || typeof item!=='object'){errors.push('OBJECT_REQUIRED');continue;}
    if(typeof item.id!=='string'||!item.id)errors.push('ID_REQUIRED');
    else if(ids.has(item.id))errors.push('DUPLICATE_ID:'+item.id); else ids.add(item.id);
    if(item.authority==='SCRAPED')errors.push('SCRAPED_FORBIDDEN:'+item.id);
    if(item.secretRequired===true && item.serverOnly!==true)errors.push('SECRET_MUST_BE_SERVER_ONLY:'+item.id);
    if(item.status===SOURCE_STATUS.DECISION_REQUIRED && item.liveEligible===true)errors.push('UNRESOLVED_CANNOT_BE_LIVE:'+item.id);
    if(!Array.isArray(item.capabilities)||!item.capabilities.length)errors.push('CAPABILITIES_REQUIRED:'+item.id);
    if(!Array.isArray(item.markets)||!item.markets.length)errors.push('MARKETS_REQUIRED:'+item.id);
  }
  return {ok:errors.length===0,errors};
}

function findSources({market,capability}){
  return SOURCE_CATALOG.filter(item=>
    item.markets.includes(market) && item.capabilities.includes(capability)
  ).sort((a,b)=>a.priority-b.priority || a.id.localeCompare(b.id));
}

module.exports=Object.freeze({SOURCE_STATUS,SOURCE_CATALOG,validateSourceCatalog,findSources});
