'use strict';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.length>0;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const PERIOD=/^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE=/^(\d{4})-(\d{2})-(\d{2})$/;

function assertInstrumentId(value){
  if(!text(value))throw Error('INSTRUMENT_ID_REQUIRED');
  return value;
}

function assertPeriod(value){
  if(!text(value)||!PERIOD.test(value))throw Error('REPORT_PERIOD_INVALID');
  return value;
}

function assertDate(value){
  if(!text(value)||!DATE.test(value))throw Error('TRADE_DATE_INVALID');
  const d=new Date(`${value}T00:00:00Z`);
  const [y,m,day]=value.split('-').map(Number);
  if(d.getUTCFullYear()!==y||d.getUTCMonth()+1!==m||d.getUTCDate()!==day)throw Error('TRADE_DATE_INVALID');
  return value;
}

function instrumentId(summary){
  const id=summary?.instrument?.instrumentId;
  return assertInstrumentId(id);
}

function observations(summary){
  if(!object(summary)||!Array.isArray(summary.observations)||!summary.observations.length)throw Error('OBSERVATIONS_REQUIRED');
  return summary.observations;
}

function knowledgeAt(summary){
  const rows=observations(summary);
  let latest=-Infinity;
  for(const row of rows){
    if(!object(row)||!finite(row.receivedAt)||row.receivedAt<0)throw Error('RECEIVED_AT_INVALID');
    latest=Math.max(latest,row.receivedAt);
  }
  return latest;
}

function sameCanonical(a,b){
  return JSON.stringify(a)===JSON.stringify(b);
}

function validateRevenue(summary){
  if(!object(summary))throw Error('REVENUE_REQUIRED');
  const id=instrumentId(summary);
  const reportPeriod=assertPeriod(summary.reportPeriod);
  if(summary.knowledgeTime!=='RECEIVED_AT')throw Error('KNOWLEDGE_TIME_INVALID');
  const receivedAt=knowledgeAt(summary);
  for(const row of summary.observations){
    if(row.instrumentId!==id)throw Error('INSTRUMENT_MISMATCH');
    if(!text(row.source))throw Error('SOURCE_REQUIRED');
  }
  return Object.freeze({id,reportPeriod,receivedAt});
}

function validateSession(session){
  if(!object(session)||!object(session.quote)||!object(session.flow))throw Error('INSTITUTIONAL_SESSION_REQUIRED');
  const quoteId=instrumentId(session.quote);
  const flowId=instrumentId(session.flow);
  if(quoteId!==flowId)throw Error('INSTRUMENT_MISMATCH');
  const quoteDate=assertDate(session.quote.tradeDate);
  const flowDate=assertDate(session.flow.tradeDate);
  if(quoteDate!==flowDate)throw Error('TRADE_DATE_MISMATCH');
  const receivedAt=Math.max(knowledgeAt(session.quote),knowledgeAt(session.flow));
  for(const summary of [session.quote,session.flow]){
    for(const row of summary.observations){
      if(row.instrumentId!==quoteId)throw Error('INSTRUMENT_MISMATCH');
      if(!text(row.source))throw Error('SOURCE_REQUIRED');
    }
  }
  return Object.freeze({id:quoteId,tradeDate:quoteDate,receivedAt});
}

function createResearchHistoryStore(){
  const revenues=new Map();
  const sessions=new Map();

  function recordRevenue(summary){
    const meta=validateRevenue(summary);
    const rows=revenues.get(meta.id)||[];
    const existing=rows.find(row=>row.reportPeriod===meta.reportPeriod);
    if(existing){
      if(sameCanonical(existing.value,summary))return Object.freeze({status:'IDEMPOTENT',instrumentId:meta.id,reportPeriod:meta.reportPeriod});
      throw Error('RESEARCH_HISTORY_CONFLICT');
    }
    const latest=rows[rows.length-1]||null;
    if(latest&&meta.reportPeriod<latest.reportPeriod)throw Error('BACKFILL_FORBIDDEN');
    if(latest&&meta.receivedAt<latest.receivedAt)throw Error('TIME_REGRESSION');
    rows.push(Object.freeze({reportPeriod:meta.reportPeriod,receivedAt:meta.receivedAt,value:summary}));
    revenues.set(meta.id,rows);
    return Object.freeze({status:'RECORDED',instrumentId:meta.id,reportPeriod:meta.reportPeriod});
  }

  function previousRevenue(id,currentPeriod){
    assertInstrumentId(id);
    assertPeriod(currentPeriod);
    const rows=revenues.get(id)||[];
    for(let i=rows.length-1;i>=0;i--){
      if(rows[i].reportPeriod<currentPeriod)return rows[i].value;
    }
    return null;
  }

  function recordInstitutionalSession(session){
    const meta=validateSession(session);
    const rows=sessions.get(meta.id)||[];
    const existing=rows.find(row=>row.tradeDate===meta.tradeDate);
    if(existing){
      if(sameCanonical(existing.value,session))return Object.freeze({status:'IDEMPOTENT',instrumentId:meta.id,tradeDate:meta.tradeDate});
      throw Error('RESEARCH_HISTORY_CONFLICT');
    }
    const latest=rows[rows.length-1]||null;
    if(latest&&meta.tradeDate<latest.tradeDate)throw Error('BACKFILL_FORBIDDEN');
    if(latest&&meta.receivedAt<latest.receivedAt)throw Error('TIME_REGRESSION');
    rows.push(Object.freeze({tradeDate:meta.tradeDate,receivedAt:meta.receivedAt,value:session}));
    sessions.set(meta.id,rows);
    return Object.freeze({status:'RECORDED',instrumentId:meta.id,tradeDate:meta.tradeDate});
  }

  function institutionalSessions(id,{limit}={}){
    assertInstrumentId(id);
    if(limit!==undefined&&(!Number.isInteger(limit)||limit<1))throw Error('LIMIT_INVALID');
    const rows=sessions.get(id)||[];
    const selected=limit===undefined?rows:rows.slice(-limit);
    return Object.freeze(selected.map(row=>row.value));
  }

  return Object.freeze({recordRevenue,previousRevenue,recordInstitutionalSession,institutionalSessions});
}

module.exports=Object.freeze({createResearchHistoryStore});
