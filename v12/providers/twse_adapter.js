'use strict';
const C=require('./taiwan_common.js');
const Context=require('../data/context_normalizer.js');
const QUOTE_SOURCE='TWSE:STOCK_DAY_ALL',FLOW_SOURCE='TWSE:T86',REVENUE_SOURCE='TWSE:t187ap05_L',MARKET_SOURCE='TWSE:MI_INDEX';
const descriptor=Object.freeze({id:'twse-official',sourceLabel:'Taiwan Stock Exchange official public data',markets:['TW'],capabilities:['QUOTE','FLOW','FUNDAMENTAL','MARKET_BREADTH','INDEX','SECTOR'],transport:'PUBLIC_READ_ONLY',executionWrite:false,priority:10});
function normalizeDailyQuote(row,{receivedAt}){
  if(!row||typeof row!=='object')throw Error('ROW_REQUIRED');const tradeDate=C.isoFromRoc(row.Date),observedAt=C.closeMs(tradeDate),instrument=C.instrument('TWSE',row.Code,row.Name);
  const defs=[['price.open',row.OpeningPrice,'TWD_PER_SHARE'],['price.high',row.HighestPrice,'TWD_PER_SHARE'],['price.low',row.LowestPrice,'TWD_PER_SHARE'],['price.close',row.ClosingPrice,'TWD_PER_SHARE'],['price.change',row.Change,'TWD_PER_SHARE'],['volume.shares',row.TradeVolume,'SHARE'],['turnover.value',row.TradeValue,'TWD'],['transactions.count',row.Transaction,'COUNT']];
  return Object.freeze({instrument,tradeDate,name:String(row.Name??'').trim(),observations:Object.freeze(defs.map(([field,raw,unit])=>C.observation({instrument,field,raw,unit,observedAt,receivedAt,source:QUOTE_SOURCE})))});
}
function normalizeInstitutional(payload,{tradeDate,receivedAt}){
  if(!payload||!Array.isArray(payload.fields)||!Array.isArray(payload.data))throw Error('PAYLOAD_REQUIRED');const date=C.isoFromAdCompact(tradeDate),observedAt=C.closeMs(date),index=new Map(payload.fields.map((f,i)=>[f,i]));
  const required=['證券代號','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數'];for(const f of required)if(!index.has(f))throw Error('SCHEMA_MISMATCH:'+f);
  return payload.data.map(row=>{const instrument=C.instrument('TWSE',row[index.get('證券代號')],index.has('證券名稱')?row[index.get('證券名稱')]:'');const defs=[['flow.foreign_net',row[index.get('外陸資買賣超股數(不含外資自營商)')]],['flow.investment_trust_net',row[index.get('投信買賣超股數')]],['flow.dealer_net',row[index.get('自營商買賣超股數')]],['flow.total_net',index.has('三大法人買賣超股數')?row[index.get('三大法人買賣超股數')]:null]];return Object.freeze({instrument,tradeDate:date,observations:Object.freeze(defs.map(([field,raw])=>C.observation({instrument,field,raw,unit:'SHARE',observedAt,receivedAt,source:FLOW_SOURCE})))})});
}
function normalizeMonthlyRevenue(row,context={}){return C.monthlyRevenue('TWSE',REVENUE_SOURCE,row,context)}

function stripHtml(value){return String(value??'').replace(/<[^>]*>/g,'').trim()}
function signed(raw,signRaw){
  const value=C.numberOrNull(stripHtml(raw));
  if(value===null)return null;
  const sign=stripHtml(signRaw);
  if(sign==='-')return -Math.abs(value);
  if(sign==='+')return Math.abs(value);
  return value;
}
function table(payload,predicate){return payload.tables.find(item=>item&&Array.isArray(item.fields)&&Array.isArray(item.data)&&predicate(String(item.title||''),item))||null}
function rowMap(fields,row){const out={};for(let i=0;i<fields.length;i++)out[String(fields[i])]=row[i];return out}
function countGroup(raw){
  const text=stripHtml(raw).replace(/,/g,'');
  const match=text.match(/^(-?\d+)(?:\((-?\d+)\))?$/);
  if(!match)throw Error('TWSE_BREADTH_COUNT_INVALID');
  return Object.freeze({count:Number(match[1]),limit:match[2]===undefined?null:Number(match[2])});
}
function contextObservation({entityId='MARKET:TW:TWSE',field,value,unit,observedAt,receivedAt,source=MARKET_SOURCE}){
  return Context.makeContextObservation({entityId,scope:'TW',field,value,unit,observedAt,receivedAt,source,status:'SNAPSHOT',confidence:1});
}
function normalizeMarketBreadth(payload,{tradeDate,receivedAt}={}){
  if(!payload||!Array.isArray(payload.tables))throw Error('TWSE_MI_INDEX_PAYLOAD_REQUIRED');
  if(typeof receivedAt!=='number'||!Number.isFinite(receivedAt)||receivedAt<0)throw Error('RECEIVED_AT_INVALID');
  const date=C.isoFromAdCompact(tradeDate||payload.date);
  const observedAt=Math.min(C.closeMs(date),receivedAt);
  const indexTable=table(payload,(title,item)=>item.fields.includes('指數')&&item.fields.includes('收盤指數')&&item.fields.includes('漲跌百分比(%)'));
  if(!indexTable)throw Error('TWSE_INDEX_TABLE_REQUIRED');
  const indexRows=indexTable.data.map(row=>rowMap(indexTable.fields,row));
  const taiexRow=indexRows.find(row=>stripHtml(row['指數'])==='發行量加權股價指數');
  if(!taiexRow)throw Error('TWSE_TAIEX_REQUIRED');
  const taiex=Object.freeze({
    close:C.numberOrNull(stripHtml(taiexRow['收盤指數'])),
    change:signed(taiexRow['漲跌點數'],taiexRow['漲跌(+/-)']),
    changePct:signed(taiexRow['漲跌百分比(%)'],taiexRow['漲跌(+/-)'])
  });
  if(taiex.close===null||taiex.change===null||taiex.changePct===null)throw Error('TWSE_TAIEX_VALUE_REQUIRED');

  const breadthTable=table(payload,(title,item)=>title.includes('漲跌證券數合計')&&item.fields.includes('類型')&&item.fields.includes('股票'));
  if(!breadthTable)throw Error('TWSE_BREADTH_TABLE_REQUIRED');
  const breadthRows=new Map(breadthTable.data.map(row=>{const mapped=rowMap(breadthTable.fields,row);return [stripHtml(mapped['類型']),mapped['股票']]}));
  for(const key of ['上漲(漲停)','下跌(跌停)','持平','未成交','無比價'])if(!breadthRows.has(key))throw Error('TWSE_BREADTH_ROW_REQUIRED:'+key);
  const up=countGroup(breadthRows.get('上漲(漲停)'));
  const down=countGroup(breadthRows.get('下跌(跌停)'));
  const flat=countGroup(breadthRows.get('持平'));
  const untraded=countGroup(breadthRows.get('未成交'));
  const noComparison=countGroup(breadthRows.get('無比價'));
  const comparable=up.count+down.count+flat.count;
  const total=comparable+untraded.count+noComparison.count;
  const breadth=Object.freeze({
    advancers:up.count,decliners:down.count,unchanged:flat.count,
    limitUp:up.limit??0,limitDown:down.limit??0,
    untraded:untraded.count,noComparison:noComparison.count,
    advanceDeclineRatio:down.count===0?(up.count>0?Infinity:0):up.count/down.count,
    participationPct:total===0?0:comparable/total
  });

  const industries=indexRows.filter(row=>/類指數$/.test(stripHtml(row['指數']))).map(row=>{
    const rawName=stripHtml(row['指數']);
    const changePct=signed(row['漲跌百分比(%)'],row['漲跌(+/-)']);
    const close=C.numberOrNull(stripHtml(row['收盤指數']));
    if(changePct===null||close===null)return null;
    return Object.freeze({name:rawName.replace(/指數$/,''),close,changePct});
  }).filter(Boolean).sort((a,b)=>b.changePct-a.changePct||a.name.localeCompare(b.name,'zh-Hant'));

  const observations=[
    contextObservation({field:'market.index.taiex.close',value:taiex.close,unit:'INDEX',observedAt,receivedAt}),
    contextObservation({field:'market.index.taiex.change',value:taiex.change,unit:'POINT',observedAt,receivedAt}),
    contextObservation({field:'market.index.taiex.change_pct',value:taiex.changePct,unit:'PCT',observedAt,receivedAt}),
    contextObservation({field:'market.breadth.advancers',value:breadth.advancers,unit:'COUNT',observedAt,receivedAt}),
    contextObservation({field:'market.breadth.decliners',value:breadth.decliners,unit:'COUNT',observedAt,receivedAt}),
    contextObservation({field:'market.breadth.unchanged',value:breadth.unchanged,unit:'COUNT',observedAt,receivedAt}),
    contextObservation({field:'market.breadth.limit_up',value:breadth.limitUp,unit:'COUNT',observedAt,receivedAt}),
    contextObservation({field:'market.breadth.limit_down',value:breadth.limitDown,unit:'COUNT',observedAt,receivedAt}),
    contextObservation({field:'market.breadth.advance_decline_ratio',value:breadth.advanceDeclineRatio,unit:'RATIO',observedAt,receivedAt}),
    contextObservation({field:'market.breadth.participation_pct',value:breadth.participationPct,unit:'RATIO',observedAt,receivedAt})
  ];
  industries.forEach((industry,index)=>{
    observations.push(contextObservation({entityId:`MARKET:TW:TWSE:INDUSTRY:${index+1}`,field:'market.industry.change_pct',value:industry.changePct,unit:'PCT',observedAt,receivedAt,source:`${MARKET_SOURCE}:${industry.name}`}));
  });

  return Object.freeze({
    market:'TW',venue:'TWSE',tradeDate:date,asOf:observedAt,
    taiex,breadth,industries:Object.freeze(industries),observations:Object.freeze(observations),
    researchOnly:true,executionWrite:false
  });
}

function normalize(dataset,payload,context={}){if(dataset==='QUOTE')return normalizeDailyQuote(payload,context);if(dataset==='FLOW')return normalizeInstitutional(payload,context);if(dataset==='MONTHLY_REVENUE')return normalizeMonthlyRevenue(payload,context);if(dataset==='MARKET_BREADTH')return normalizeMarketBreadth(payload,context);throw Error('DATASET_UNSUPPORTED')}
module.exports=Object.freeze({descriptor,QUOTE_SOURCE,FLOW_SOURCE,REVENUE_SOURCE,MARKET_SOURCE,normalizeDailyQuote,normalizeInstitutional,normalizeMonthlyRevenue,normalizeMarketBreadth,normalize});
