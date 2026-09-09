'use strict';

// Presentation reads canonical observations only; it never infers market bias.
const list=value=>Array.isArray(value)?value:[];
const finite=value=>typeof value==='number'&&Number.isFinite(value);

function fact(observation,metadata={}){
  return Object.freeze({
    field:observation.field,entityId:observation.entityId||observation.instrumentId||null,
    value:observation.status==='UNAVAILABLE'||!finite(observation.value)?null:observation.value,
    unit:observation.unit,currency:observation.currency||null,source:observation.source,
    status:observation.status,observedAt:observation.observedAt,receivedAt:observation.receivedAt,
    ...metadata
  });
}

function latestFacts(observations){
  const selected=new Map();
  for(const observation of list(observations)){
    const key=[observation.source,observation.entityId,observation.field].join('|');
    if(!selected.has(key)||observation.observedAt>selected.get(key).observedAt)selected.set(key,observation);
  }
  return Object.freeze([...selected.values()].map(value=>fact(value)));
}

function equityFacts(asset){
  if(asset.market==='TW')return Object.freeze(list(asset.facts).map(value=>fact(value,value.reportPeriod?{reportPeriod:value.reportPeriod}:{})));
  return Object.freeze(list(asset.fundamentals).flatMap(summary=>{
    const rows=list(summary.rows).map((row,index)=>({row,observation:list(summary.observations)[index]})).filter(x=>x.observation);
    // Latest reported period, latest filing; shortest period wins when ends match.
    rows.sort((a,b)=>String(b.row.reportEnd||'').localeCompare(String(a.row.reportEnd||''))||String(b.row.filedDate||'').localeCompare(String(a.row.filedDate||''))||String(b.row.reportStart||'').localeCompare(String(a.row.reportStart||'')));
    if(!rows.length)return [];
    const {row,observation}=rows[0];
    return [fact(observation,{reportStart:row.reportStart,reportEnd:row.reportEnd,filedDate:row.filedDate,accessionNumber:row.accessionNumber,form:row.form,knowledgeTime:summary.knowledgeTime,pointInTimeSafe:summary.pointInTimeSafe===true})];
  }));
}

function regionalFacts(summary){
  const series=Array.isArray(summary.series)?summary.series:[summary];
  return series.flatMap(item=>{
    const rows=list(item.rows).filter(row=>!row.excludedReason);
    const observations=list(item.observations);
    const choices=rows.map((row,index)=>({period:row.reportPeriod||row.referencePeriod,observation:observations[index]})).filter(x=>x.observation&&x.period);
    choices.sort((a,b)=>b.period.localeCompare(a.period));
    if(!choices.length)return latestFacts(observations);
    const chosen=choices[0];
    return [fact(chosen.observation,{reportPeriod:chosen.period,knowledgeTime:item.knowledgeTime,pointInTimeSafe:item.pointInTimeSafe===true})];
  });
}

module.exports=Object.freeze({latestFacts,equityFacts,regionalFacts});
