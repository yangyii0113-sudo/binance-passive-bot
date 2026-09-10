'use strict';

const {buildTaiwanMarketCore}=require('../read_model/tw_market_core.js');
const {regionalFacts}=require('../read_model/product_facts.js');

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);

function prepareTaiwanMarketPlan(config,{bind,loaderFor}={}){
  if(config===undefined||config===null)return null;
  if(!object(config)||typeof bind!=='function'||typeof loaderFor!=='function'||!object(config.twse)||!object(config.tpex))throw Error('TW_MARKET_CONFIG_INVALID');
  const tradeDate=config.twse.tradeDate;
  if(typeof tradeDate!=='string'||!/^\d{8}$/.test(tradeDate)||config.tpex.tradeDate!==tradeDate)throw Error('TW_MARKET_TRADE_DATE_INVALID');
  for(const key of ['endpoint'])if(typeof config.twse[key]!=='string'||!config.twse[key])throw Error('TW_MARKET_CONFIG_INVALID');
  for(const key of ['highlightEndpoint','industryTurnoverEndpoint'])if(typeof config.tpex[key]!=='string'||!config.tpex[key])throw Error('TW_MARKET_CONFIG_INVALID');
  return Object.freeze({
    tradeDate,
    twse:bind('twseMarketBreadth',{loader:loaderFor('twse-market',config.twse.endpoint),tradeDate,subjectId:'MARKET:TW:TWSE'}),
    tpex:bind('tpexMarketHighlight',{loader:loaderFor('tpex-openapi',config.tpex.highlightEndpoint),tradeDate,subjectId:'MARKET:TW:TPEX'}),
    tpexIndustryTurnover:bind('tpexIndustryTurnover',{loader:loaderFor('tpex-openapi',config.tpex.industryTurnoverEndpoint),tradeDate,subjectId:'MARKET:TW:TPEX:INDUSTRY'})
  });
}

async function loadTaiwanMarket(plan,{lineageContext,nowMs}={}){
  if(!plan)return null;
  const sources={twse:null,tpex:null,tpexIndustryTurnover:null};
  for(const [key,binding] of Object.entries({twse:plan.twse,tpex:plan.tpex,tpexIndustryTurnover:plan.tpexIndustryTurnover})){
    const source=await binding.load();
    if(source.status!=='AVAILABLE')continue;
    sources[key]=source;
    if(lineageContext){
      const subject=key==='twse'?'MARKET:TW:TWSE':key==='tpex'?'MARKET:TW:TPEX':'MARKET:TW:TPEX:INDUSTRY';
      lineageContext.remember('REGIONAL_CONTEXT','REGION:TW',source,subject);
    }
  }
  const core=buildTaiwanMarketCore({twse:sources.twse?.data||null,tpex:sources.tpex?.data||null,tpexIndustryTurnover:sources.tpexIndustryTurnover?.data||null,nowMs});
  const available=Object.values(sources).filter(Boolean).map(source=>source.data);
  const observations=available.flatMap(data=>Array.isArray(data?.observations)?data.observations:[]);
  const regionData=observations.length?Object.freeze({
    observations:Object.freeze(observations),
    facts:Object.freeze(available.flatMap(regionalFacts)),
    events:Object.freeze([]),evidence:Object.freeze([]),expectations:Object.freeze([]),scenarios:Object.freeze([]),rotation:Object.freeze([]),catalysts:Object.freeze([]),risks:Object.freeze([])
  }):null;
  const pulse=Object.freeze({
    status:core.status,
    state:core.state,
    asOf:core.asOf,
    data:Object.freeze({
      confidence:core.confidence,
      directionCoverage:core.directionCoverage,
      industryCoverage:core.industryCoverage,
      missingSources:core.missingSources,
      ...core.data
    })
  });
  return Object.freeze({core,pulse,regionData});
}

module.exports=Object.freeze({prepareTaiwanMarketPlan,loadTaiwanMarket});
