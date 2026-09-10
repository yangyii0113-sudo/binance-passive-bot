'use strict';
const C=require('./taiwan_common.js');
const Context=require('../data/context_normalizer.js');
const QUOTE_SOURCE='TPEX:tpex_mainboard_daily_close_quotes',FLOW_SOURCE='TPEX:tpex_3insti_daily_trading',REVENUE_SOURCE='TPEX:mopsfin_t187ap05_O';
const MARKET_HIGHLIGHT_SOURCE='TPEX:tpex_mainborad_highlight',INDUSTRY_TURNOVER_SOURCE='TPEX:tpex_trading_volume_ratio';
const descriptor=Object.freeze({id:'tpex-official',sourceLabel:'Taipei Exchange official OpenAPI',markets:['TW'],capabilities:['QUOTE','FLOW','FUNDAMENTAL'],transport:'PUBLIC_READ_ONLY',executionWrite:false,priority:20});
const FOREIGN='Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference';
function normalizeDailyQuote(row,{receivedAt}){
 if(!row||typeof row!=='object')throw Error('ROW_REQUIRED');const tradeDate=C.isoFromRoc(row.Date),observedAt=C.closeMs(tradeDate),instrument=C.instrument('TPEX',row.SecuritiesCompanyCode,row.CompanyName);
 const defs=[['price.open',row.Open,'TWD_PER_SHARE'],['price.high',row.High,'TWD_PER_SHARE'],['price.low',row.Low,'TWD_PER_SHARE'],['price.close',row.Close,'TWD_PER_SHARE'],['price.change',row.Change,'TWD_PER_SHARE'],['volume.shares',row.TradingShares,'SHARE'],['turnover.value',row.TransactionAmount,'TWD'],['transactions.count',row.TransactionNumber,'COUNT']];
 return Object.freeze({instrument,tradeDate,name:String(row.CompanyName??'').trim(),observations:Object.freeze(defs.map(([field,raw,unit])=>C.observation({instrument,field,raw,unit,observedAt,receivedAt,source:QUOTE_SOURCE})))});
}
function normalizeInstitutionalRow(row,{receivedAt}){
 if(!row||typeof row!=='object')throw Error('ROW_REQUIRED');const tradeDate=C.isoFromRoc(row.Date),observedAt=C.closeMs(tradeDate),instrument=C.instrument('TPEX',row.SecuritiesCompanyCode,row.CompanyName);const defs=[['flow.foreign_net',row[FOREIGN]],['flow.investment_trust_net',row['SecuritiesInvestmentTrustCompanies-Difference']],['flow.dealer_net',row['Dealers-Difference']],['flow.total_net',row.TotalDifference]];
 return Object.freeze({instrument,tradeDate,observations:Object.freeze(defs.map(([field,raw])=>C.observation({instrument,field,raw,unit:'SHARE',observedAt,receivedAt,source:FLOW_SOURCE})))});
}
function normalizeMonthlyRevenue(row,context={}){return C.monthlyRevenue('TPEX',REVENUE_SOURCE,row,context)}

function requiredNumber(value,label){const number=C.numberOrNull(value);if(number===null)throw Error(label+'_REQUIRED');return number}
function contextObservation({entityId='MARKET:TW:TPEX',field,value,unit,observedAt,receivedAt,source}){
 return Context.makeContextObservation({entityId,scope:'TW',field,value,unit,observedAt,receivedAt,source,status:'SNAPSHOT',confidence:1});
}
function normalizeMarketHighlight(row,{receivedAt}={}){
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('TPEX_HIGHLIGHT_ROW_REQUIRED');
 if(typeof receivedAt!=='number'||!Number.isFinite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');
 const tradeDate=C.isoFromRoc(row.Date),observedAt=Math.min(C.closeMs(tradeDate),receivedAt);
 const close=requiredNumber(row.CloseIndex,'TPEX_OTC_CLOSE');
 const change=requiredNumber(row.IndexChange,'TPEX_OTC_CHANGE');
 const previousClose=close-change;
 if(!Number.isFinite(previousClose)||previousClose<=0)throw Error('TPEX_OTC_PREVIOUS_CLOSE_INVALID');
 const otc=Object.freeze({close,change,changePct:change/previousClose*100});
 const listed=requiredNumber(row.ListedCompanyNumbers,'TPEX_LISTED');
 const advancers=requiredNumber(row.PriceRiseCompanyNumbers,'TPEX_ADVANCERS');
 const decliners=requiredNumber(row.PriceDeclineCompanyNumbers,'TPEX_DECLINERS');
 const unchanged=requiredNumber(row.PriceFlatCompanyNumbers,'TPEX_UNCHANGED');
 const limitUp=requiredNumber(row.LimitUpCompanyNumbers,'TPEX_LIMIT_UP');
 const limitDown=requiredNumber(row.LimitDownCompanyNumbers,'TPEX_LIMIT_DOWN');
 const untraded=requiredNumber(row.UnmatchedCompanyNumbersSuspensionStocksIncluded,'TPEX_UNTRADED');
 for(const [label,value] of Object.entries({listed,advancers,decliners,unchanged,limitUp,limitDown,untraded}))if(!Number.isInteger(value)||value<0)throw Error('TPEX_BREADTH_COUNT_INVALID:'+label);
 if(limitUp>advancers||limitDown>decliners)throw Error('TPEX_LIMIT_COUNT_INVALID');
 if(advancers+decliners+unchanged+untraded!==listed)throw Error('TPEX_BREADTH_TOTAL_MISMATCH');
 const breadth=Object.freeze({advancers,decliners,unchanged,limitUp,limitDown,untraded,listed,advanceDeclineRatio:decliners===0?(advancers>0?Infinity:0):advancers/decliners,participationPct:listed===0?0:(advancers+decliners+unchanged)/listed});
 const observations=Object.freeze([
  contextObservation({field:'market.index.otc.close',value:otc.close,unit:'INDEX',observedAt,receivedAt,source:MARKET_HIGHLIGHT_SOURCE}),
  contextObservation({field:'market.index.otc.change',value:otc.change,unit:'POINT',observedAt,receivedAt,source:MARKET_HIGHLIGHT_SOURCE}),
  contextObservation({field:'market.index.otc.change_pct',value:otc.changePct,unit:'PCT',observedAt,receivedAt,source:MARKET_HIGHLIGHT_SOURCE}),
  contextObservation({field:'market.breadth.advancers',value:breadth.advancers,unit:'COUNT',observedAt,receivedAt,source:MARKET_HIGHLIGHT_SOURCE}),
  contextObservation({field:'market.breadth.decliners',value:breadth.decliners,unit:'COUNT',observedAt,receivedAt,source:MARKET_HIGHLIGHT_SOURCE}),
  contextObservation({field:'market.breadth.unchanged',value:breadth.unchanged,unit:'COUNT',observedAt,receivedAt,source:MARKET_HIGHLIGHT_SOURCE}),
  contextObservation({field:'market.breadth.limit_up',value:breadth.limitUp,unit:'COUNT',observedAt,receivedAt,source:MARKET_HIGHLIGHT_SOURCE}),
  contextObservation({field:'market.breadth.limit_down',value:breadth.limitDown,unit:'COUNT',observedAt,receivedAt,source:MARKET_HIGHLIGHT_SOURCE}),
  contextObservation({field:'market.breadth.advance_decline_ratio',value:breadth.advanceDeclineRatio,unit:'RATIO',observedAt,receivedAt,source:MARKET_HIGHLIGHT_SOURCE}),
  contextObservation({field:'market.breadth.participation_pct',value:breadth.participationPct,unit:'RATIO',observedAt,receivedAt,source:MARKET_HIGHLIGHT_SOURCE})
 ]);
 return Object.freeze({market:'TW',venue:'TPEX',tradeDate,asOf:observedAt,otc,breadth,observations,researchOnly:true,executionWrite:false});
}
function normalizeIndustryTurnover(rows,{receivedAt}={}){
 if(!Array.isArray(rows)||!rows.length)throw Error('TPEX_INDUSTRY_ROWS_REQUIRED');
 if(typeof receivedAt!=='number'||!Number.isFinite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');
 const parsed=rows.map((row,index)=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('TPEX_INDUSTRY_ROW_INVALID:'+index);
  const tradeDate=C.isoFromRoc(row.Date),name=String(row.Sector??'').trim();
  if(!name)throw Error('TPEX_INDUSTRY_NAME_REQUIRED');
  const tradeWeightPct=requiredNumber(row.TradeWeight,'TPEX_INDUSTRY_WEIGHT');
  const tradeAmount=requiredNumber(row.TradeAmount,'TPEX_INDUSTRY_AMOUNT');
  const sharesTraded=requiredNumber(row[' NumberOfSharesTraded']??row.NumberOfSharesTraded,'TPEX_INDUSTRY_SHARES');
  if(tradeWeightPct<0||tradeAmount<0||sharesTraded<0)throw Error('TPEX_INDUSTRY_VALUE_INVALID');
  return {tradeDate,name,tradeWeightPct,tradeAmount,sharesTraded};
 });
 const dates=[...new Set(parsed.map(row=>row.tradeDate))];
 if(dates.length!==1)throw Error('TPEX_INDUSTRY_DATE_MISMATCH');
 const tradeDate=dates[0],observedAt=Math.min(C.closeMs(tradeDate),receivedAt);
 const sectors=Object.freeze(parsed.map(({name,tradeWeightPct,tradeAmount,sharesTraded})=>Object.freeze({name,tradeWeightPct,tradeAmount,sharesTraded})).sort((a,b)=>b.tradeWeightPct-a.tradeWeightPct||a.name.localeCompare(b.name,'zh-Hant')));
 const observations=Object.freeze(sectors.map((sector,index)=>contextObservation({entityId:`MARKET:TW:TPEX:SECTOR:${index+1}`,field:'market.industry.turnover_weight_pct',value:sector.tradeWeightPct,unit:'PCT',observedAt,receivedAt,source:`${INDUSTRY_TURNOVER_SOURCE}:${sector.name}`})));
 return Object.freeze({market:'TW',venue:'TPEX',tradeDate,asOf:observedAt,sectors,observations,researchOnly:true,executionWrite:false});
}

function normalize(dataset,payload,context={}){if(dataset==='QUOTE')return normalizeDailyQuote(payload,context);if(dataset==='FLOW')return Array.isArray(payload)?payload.map(x=>normalizeInstitutionalRow(x,context)):normalizeInstitutionalRow(payload,context);if(dataset==='MONTHLY_REVENUE')return normalizeMonthlyRevenue(payload,context);if(dataset==='MARKET_HIGHLIGHT')return normalizeMarketHighlight(payload,context);if(dataset==='INDUSTRY_TURNOVER')return normalizeIndustryTurnover(payload,context);throw Error('DATASET_UNSUPPORTED')}
module.exports=Object.freeze({descriptor,QUOTE_SOURCE,FLOW_SOURCE,REVENUE_SOURCE,MARKET_HIGHLIGHT_SOURCE,INDUSTRY_TURNOVER_SOURCE,normalizeDailyQuote,normalizeInstitutionalRow,normalizeMonthlyRevenue,normalizeMarketHighlight,normalizeIndustryTurnover,normalize});
