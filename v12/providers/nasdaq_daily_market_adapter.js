'use strict';

const Context=require('../data/context_normalizer.js');
const SOURCE='NASDAQTRADER:DAILY_MARKET_FILES';
const REQUIRED=Object.freeze(['Date','N100','Composite','Industrial','Bank','Insurance','Financial','Transportation','Telecom','Biotech','Computer','NasdaqTrades','Volume','DolVol','MktVal','Advances','Declines','Unchanged']);
const SECTORS=Object.freeze([
  ['INDUSTRIAL','Industrial','Nasdaq Industrial Index'],
  ['BANK','Bank','Nasdaq Bank Index'],
  ['INSURANCE','Insurance','Nasdaq Insurance Index'],
  ['FINANCIAL','Financial','Nasdaq Other Finance Index'],
  ['TRANSPORTATION','Transportation','Nasdaq Transportation Index'],
  ['TELECOM','Telecom','Nasdaq Telecommunications Index'],
  ['BIOTECH','Biotech','Nasdaq Biotechnology Index'],
  ['COMPUTER','Computer','Nasdaq Computer Index']
]);

function finite(value){return typeof value==='number'&&Number.isFinite(value)}
function parseCsvLine(line){
  const out=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(quoted&&line[i+1]==='"'){value+='"';i++;continue;}
      quoted=!quoted;continue;
    }
    if(ch===','&&!quoted){out.push(value.trim());value='';continue;}
    value+=ch;
  }
  if(quoted)throw Error('NASDAQ_CSV_QUOTE_INVALID');
  out.push(value.trim());
  return out;
}
function parseDate(value){
  const match=String(value??'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  if(!match)throw Error('NASDAQ_DATE_INVALID');
  const month=Number(match[1]),day=Number(match[2]),year=Number(match[3]);
  const iso=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const check=new Date(`${iso}T00:00:00Z`);
  if(check.getUTCFullYear()!==year||check.getUTCMonth()+1!==month||check.getUTCDate()!==day)throw Error('NASDAQ_DATE_INVALID');
  return iso;
}
function numeric(value,label,{integer=false,nonNegative=false}={}){
  const n=Number(String(value??'').replace(/,/g,'').trim());
  if(!finite(n)||(integer&&!Number.isInteger(n))||(nonNegative&&n<0))throw Error(`NASDAQ_VALUE_INVALID:${label}`);
  return n;
}
function pctChange(current,previous,label){
  if(!finite(previous)||previous===0)throw Error(`NASDAQ_PRIOR_VALUE_INVALID:${label}`);
  return (current/previous-1)*100;
}
function parseRows(text,receivedAt){
  if(typeof text!=='string'||!text.trim())throw Error('NASDAQ_TEXT_REQUIRED');
  if(!finite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length<3)throw Error('NASDAQ_PRIOR_ROW_REQUIRED');
  const headers=parseCsvLine(lines[0]);
  for(const key of REQUIRED)if(!headers.includes(key))throw Error(`NASDAQ_SCHEMA_REQUIRED:${key}`);
  const rows=[];
  for(const line of lines.slice(1)){
    const values=parseCsvLine(line);
    if(values.length!==headers.length)throw Error('NASDAQ_ROW_WIDTH_INVALID');
    const row=Object.fromEntries(headers.map((key,index)=>[key,values[index]]));
    const tradeDate=parseDate(row.Date);
    const dateMs=Date.parse(`${tradeDate}T00:00:00Z`);
    if(dateMs<=receivedAt)rows.push(Object.freeze({...row,tradeDate,dateMs}));
  }
  rows.sort((a,b)=>a.dateMs-b.dateMs);
  if(rows.length<2)throw Error('NASDAQ_PRIOR_ROW_REQUIRED');
  for(let i=1;i<rows.length;i++)if(rows[i].tradeDate===rows[i-1].tradeDate)throw Error('NASDAQ_DUPLICATE_DATE');
  return Object.freeze(rows);
}
function observation(field,value,unit,receivedAt,entityId='MARKET:US:NASDAQ'){
  return Context.makeContextObservation({entityId,scope:'US',field,value,unit,observedAt:receivedAt,receivedAt,source:SOURCE,status:'SNAPSHOT',confidence:1});
}
function indexPair(current,previous,key){
  const close=numeric(current[key],key);
  const prior=numeric(previous[key],key);
  return Object.freeze({close,changePct:pctChange(close,prior,key)});
}
function normalizeYearToDateText(text,{receivedAt}={}){
  const rows=parseRows(text,receivedAt);
  const current=rows[rows.length-1],previous=rows[rows.length-2];
  const composite=indexPair(current,previous,'Composite');
  const nasdaq100=indexPair(current,previous,'N100');
  const advances=numeric(current.Advances,'Advances',{integer:true,nonNegative:true});
  const declines=numeric(current.Declines,'Declines',{integer:true,nonNegative:true});
  const unchanged=numeric(current.Unchanged,'Unchanged',{integer:true,nonNegative:true});
  const ratio=declines===0?(advances>0?Infinity:0):advances/declines;
  const breadth=Object.freeze({advancers:advances,decliners:declines,unchanged,advanceDeclineRatio:ratio,issueCount:advances+declines+unchanged});
  const sectors=Object.freeze(SECTORS.map(([id,key,name])=>{
    const close=numeric(current[key],key),prior=numeric(previous[key],key);
    return Object.freeze({id,name,close,changePct:pctChange(close,prior,key)});
  }));
  const liquidity=Object.freeze({
    trades:numeric(current.NasdaqTrades,'NasdaqTrades',{nonNegative:true}),
    shareVolume:numeric(current.Volume,'Volume',{nonNegative:true}),
    dollarVolume:numeric(current.DolVol,'DolVol',{nonNegative:true}),
    marketValueThousands:numeric(current.MktVal,'MktVal',{nonNegative:true})
  });
  const observations=[
    observation('market.index.nasdaq_composite.close',composite.close,'INDEX',receivedAt),
    observation('market.index.nasdaq_composite.change_pct',composite.changePct,'PCT',receivedAt),
    observation('market.index.nasdaq_100.close',nasdaq100.close,'INDEX',receivedAt),
    observation('market.index.nasdaq_100.change_pct',nasdaq100.changePct,'PCT',receivedAt),
    observation('market.breadth.advancers',advances,'COUNT',receivedAt),
    observation('market.breadth.decliners',declines,'COUNT',receivedAt),
    observation('market.breadth.unchanged',unchanged,'COUNT',receivedAt),
    observation('market.breadth.issue_count',breadth.issueCount,'COUNT',receivedAt),
    observation('market.volume.shares',liquidity.shareVolume,'SHARE',receivedAt),
    observation('market.volume.dollar',liquidity.dollarVolume,'USD',receivedAt),
    observation('market.trades.count',liquidity.trades,'COUNT',receivedAt)
  ];
  if(finite(ratio))observations.push(observation('market.breadth.advance_decline_ratio',ratio,'RATIO',receivedAt));
  sectors.forEach(row=>{
    observations.push(observation('market.sector.index.close',row.close,'INDEX',receivedAt,`MARKET:US:NASDAQ:SECTOR:${row.id}`));
    observations.push(observation('market.sector.index.change_pct',row.changePct,'PCT',receivedAt,`MARKET:US:NASDAQ:SECTOR:${row.id}`));
  });
  return Object.freeze({
    schemaVersion:'foxyya-us-nasdaq-market-snapshot/1',
    market:'US',scope:'NASDAQ_LISTED_US',venue:'NASDAQ',tradeDate:current.tradeDate,asOf:receivedAt,receivedAt,
    latency:'EOD',realtime:false,fullMarketBreadthAvailable:false,
    licenseStatus:'REVIEW_REQUIRED',redistributionStatus:'NOT_CLEARED',publicDisplayAllowed:false,
    indices:Object.freeze({composite,nasdaq100}),breadth,sectors,liquidity,
    observations:Object.freeze(observations),source:SOURCE,knowledgeTime:'RECEIVED_AT',
    researchOnly:true,executionWrite:false
  });
}

module.exports=Object.freeze({SOURCE,normalizeYearToDateText,parseDate});
