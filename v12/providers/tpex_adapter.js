'use strict';
const C=require('./taiwan_common.js');
const QUOTE_SOURCE='TPEX:tpex_mainboard_daily_close_quotes',FLOW_SOURCE='TPEX:tpex_3insti_daily_trading';
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
function normalize(dataset,payload,context={}){if(dataset==='QUOTE')return normalizeDailyQuote(payload,context);if(dataset==='FLOW')return Array.isArray(payload)?payload.map(x=>normalizeInstitutionalRow(x,context)):normalizeInstitutionalRow(payload,context);throw Error('DATASET_UNSUPPORTED')}
module.exports=Object.freeze({descriptor,QUOTE_SOURCE,FLOW_SOURCE,normalizeDailyQuote,normalizeInstitutionalRow,normalize});
