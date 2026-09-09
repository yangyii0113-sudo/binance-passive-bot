'use strict';
const M=require('../core/market_core.js');
const N=require('../data/normalizer.js');

const SUBMISSIONS_SOURCE='SEC:submissions';
const COMPANYFACTS_SOURCE='SEC:companyfacts';
const descriptor=Object.freeze({
  id:'sec-edgar-official',
  sourceLabel:'SEC EDGAR data.sec.gov',
  markets:['US'],
  capabilities:['FUNDAMENTAL'],
  transport:'PUBLIC_READ_ONLY',
  executionWrite:false,
  priority:30,
  serverOnly:true,
});

function cik10(value){
  const s=String(value??'').replace(/^CIK/i,'').trim();
  if(!/^\d{1,10}$/.test(s))throw Error('CIK_INVALID');
  return s.padStart(10,'0');
}
function secAcceptanceMs(value){
  const s=String(value??'').trim();
  const m=s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if(!m)throw Error('ACCEPTANCE_TIME_INVALID');
  const ms=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]);
  const d=new Date(ms);
  if(d.getUTCFullYear()!==+m[1]||d.getUTCMonth()+1!==+m[2]||d.getUTCDate()!==+m[3]||d.getUTCHours()!==+m[4]||d.getUTCMinutes()!==+m[5]||d.getUTCSeconds()!==+m[6])throw Error('ACCEPTANCE_TIME_INVALID');
  return ms;
}
function validateInstrument(instrument){
  const r=M.validateInstrument(instrument);
  if(!r.ok||instrument.market!=='US')throw Error('US_INSTRUMENT_REQUIRED:'+r.errors.join('|'));
}
function normalizeSubmissions(payload,{instrument,receivedAt}){
  validateInstrument(instrument);
  if(!payload||typeof payload!=='object'||!payload.filings||!payload.filings.recent)throw Error('PAYLOAD_REQUIRED');
  const recent=payload.filings.recent;
  const keys=['accessionNumber','filingDate','reportDate','acceptanceDateTime','form','primaryDocument'];
  if(keys.some(k=>!Array.isArray(recent[k])))throw Error('RECENT_COLUMNS_REQUIRED');
  const n=recent.accessionNumber.length;
  if(keys.some(k=>recent[k].length!==n))throw Error('COLUMN_MISMATCH');
  const filings=[];
  for(let i=0;i<n;i++)filings.push(Object.freeze({
    accessionNumber:String(recent.accessionNumber[i]??''),form:String(recent.form[i]??''),filedDate:String(recent.filingDate[i]??''),reportDate:String(recent.reportDate[i]??'')||null,
    acceptedAt:secAcceptanceMs(recent.acceptanceDateTime[i]),primaryDocument:String(recent.primaryDocument[i]??''),source:SUBMISSIONS_SOURCE,status:'SNAPSHOT',researchOnly:true,receivedAt,
  }));
  return Object.freeze({cik:cik10(payload.cik),name:String(payload.name??''),instrument,filings:Object.freeze(filings),source:SUBMISSIONS_SOURCE,receivedAt});
}
function canonicalUnit(unit){
  if(unit==='USD/shares')return'USD_PER_SHARE';
  if(unit==='shares')return'SHARE';
  if(unit==='pure')return'PURE';
  return String(unit||'').replace(/\//g,'_PER_').toUpperCase();
}
function normalizeCompanyFact(payload,{instrument,taxonomy,concept,unit,receivedAt}){
  validateInstrument(instrument);
  if(!payload||typeof payload!=='object')throw Error('PAYLOAD_REQUIRED');
  if(typeof taxonomy!=='string'||!taxonomy||typeof concept!=='string'||!concept||typeof unit!=='string'||!unit)throw Error('CONCEPT_REQUIRED');
  const fact=payload.facts?.[taxonomy]?.[concept];
  const entries=fact?.units?.[unit];
  if(!Array.isArray(entries)||!entries.length)return Object.freeze({cik:cik10(payload.cik),instrument,taxonomy,concept,unit,status:'UNAVAILABLE',knowledgeTime:'RECEIVED_AT',pointInTimeSafe:false,rows:Object.freeze([]),observations:Object.freeze([]),source:COMPANYFACTS_SOURCE,receivedAt});
  const rows=[];const observations=[];const outputUnit=canonicalUnit(unit);
  for(const row of entries){
    if(typeof row.val!=='number'||!Number.isFinite(row.val))continue;
    rows.push(Object.freeze({accessionNumber:String(row.accn??''),form:String(row.form??''),filedDate:String(row.filed??''),reportStart:row.start||null,reportEnd:row.end||null,fy:row.fy??null,fp:row.fp??null,frame:row.frame??null}));
    observations.push(N.makeObservation({instrument,field:`fundamental.sec.${taxonomy}.${concept}`,value:row.val,unit:outputUnit,currency:instrument.currency,observedAt:receivedAt,receivedAt,source:COMPANYFACTS_SOURCE,status:'SNAPSHOT',confidence:1}));
  }
  return Object.freeze({cik:cik10(payload.cik),instrument,taxonomy,concept,unit:outputUnit,label:String(fact.label??''),description:String(fact.description??''),status:observations.length?'SNAPSHOT':'UNAVAILABLE',knowledgeTime:'RECEIVED_AT',pointInTimeSafe:false,rows:Object.freeze(rows),observations:Object.freeze(observations),source:COMPANYFACTS_SOURCE,receivedAt});
}
function normalize(dataset,payload,context={}){
  if(dataset==='SUBMISSIONS')return normalizeSubmissions(payload,context);
  if(dataset==='COMPANY_FACT')return normalizeCompanyFact(payload,context);
  throw Error('DATASET_UNSUPPORTED');
}
module.exports=Object.freeze({descriptor,SUBMISSIONS_SOURCE,COMPANYFACTS_SOURCE,cik10,secAcceptanceMs,normalizeSubmissions,normalizeCompanyFact,normalize});
