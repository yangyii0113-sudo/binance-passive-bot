'use strict';

const Perf=require('../results/forward_performance.js');

const REGIME_LABELS=Object.freeze({
  BROAD_ADVANCE:'廣泛上漲',SELECTIVE_ADVANCE:'選擇性上漲',BROAD_DECLINE:'廣泛下跌',SELECTIVE_DECLINE:'選擇性下跌',
  RISK_ON:'風險偏好',SELECTIVE_RISK_ON:'選擇性風險偏好',NEUTRAL:'中性盤整',RISK_OFF:'風險趨避',UNAVAILABLE:'暫不判斷'
});
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.length>0;

function validateStore(store){
  if(!object(store))throw Error('FORWARD_STORE_REQUIRED');
  for(const method of ['createTrack','recordSession','getTrack','listTracks','summarize'])if(typeof store[method]!=='function')throw Error('FORWARD_STORE_REQUIRED');
  return store;
}

function taipeiDate(ms){
  if(!finite(ms)||ms<0)throw Error('SESSION_TIME_INVALID');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
  const values={};for(const part of parts)if(part.type!=='literal')values[part.type]=part.value;
  return `${values.year}-${values.month}-${values.day}`;
}

function quoteFact(row,field){return (Array.isArray(row?.facts)?row.facts:[]).find(fact=>fact?.field===field)||null;}

function extractClosedSession(row){
  const close=quoteFact(row,'price.close'),high=quoteFact(row,'price.high'),low=quoteFact(row,'price.low');
  if(!close||!high||!low)return null;
  if(!finite(close.value)||close.value<=0||!finite(high.value)||high.value<=0||!finite(low.value)||low.value<=0)return null;
  if(!finite(close.observedAt)||close.observedAt<0||high.observedAt!==close.observedAt||low.observedAt!==close.observedAt)return null;
  if(['UNAVAILABLE','STALE'].includes(String(close.status||'').toUpperCase())||['UNAVAILABLE','STALE'].includes(String(high.status||'').toUpperCase())||['UNAVAILABLE','STALE'].includes(String(low.status||'').toUpperCase()))return null;
  if(high.value<close.value||low.value>close.value||high.value<low.value)return null;
  return Object.freeze({
    sessionDate:taipeiDate(close.observedAt),
    close:close.value,high:high.value,low:low.value,
    asOf:close.observedAt,
    source:text(close.source)?close.source:'TW_OFFICIAL_DAILY_CLOSE',
    fullyClosed:true
  });
}

function researchDirection(row){
  const value=String(row?.research?.direction||row?.direction||'UNAVAILABLE').toUpperCase();
  return value==='POSITIVE'||value==='NEGATIVE'?value:null;
}

function twRegime(read){
  const pulse=(Array.isArray(read?.home?.marketPulse)?read.home.marketPulse:[]).find(row=>row?.market==='TW');
  const state=text(pulse?.state)?pulse.state:text(pulse?.data?.state)?pulse.data.state:'UNAVAILABLE';
  const asOf=finite(pulse?.asOf)&&pulse.asOf<=read.asOf?pulse.asOf:read.asOf;
  return Object.freeze({state,label:REGIME_LABELS[state]||state,asOf,source:'TW_MARKET_CORE'});
}

function stableTrackId(row,session,direction){return `fwd:${row.instrumentId}:${session.sessionDate}:${direction}`;}

function createForwardResearchTracker({store}={}){
  const ledger=validateStore(store);

  function ingest(read){
    if(!object(read)||read.schemaVersion!=='foxyya-home-read-model/1'||read.researchOnly!==true||read.executionWrite!==false||!finite(read.asOf)||!object(read.home))throw Error('HOME_READ_MODEL_REQUIRED');
    const twRows=Array.isArray(read.home.opportunities?.TW)?read.home.opportunities.TW:[];
    const sessions=new Map();
    let invalidSnapshots=0;
    for(const row of twRows){
      if(!object(row)||row.market!=='TW'||!text(row.instrumentId))continue;
      const session=extractClosedSession(row);
      if(!session){invalidSnapshots++;continue;}
      sessions.set(row.instrumentId,Object.freeze({row,session}));
    }

    let sessionsRecorded=0;
    const active=ledger.listTracks({market:'TW',status:'TRACKING'});
    for(const track of active){
      const current=sessions.get(track.instrumentId);if(!current)continue;
      const last=track.sessions[track.sessions.length-1];
      if(current.session.sessionDate<=track.baseline.sessionDate)continue;
      if(last&&current.session.sessionDate<=last.sessionDate)continue;
      ledger.recordSession(track.id,current.session);sessionsRecorded++;
    }

    let created=0;
    const regime=twRegime(read);
    for(const {row,session} of sessions.values()){
      const direction=researchDirection(row);if(!direction)continue;
      const id=stableTrackId(row,session,direction);
      if(ledger.getTrack(id))continue;
      const input={
        id,market:'TW',instrumentId:row.instrumentId,direction,
        researchScore:finite(row.researchScore)?row.researchScore:finite(row.research?.confidence)?row.research.confidence*100:null,
        priority:text(row.priority)?row.priority:'持續追蹤',
        createdAt:read.asOf,
        baseline:{sessionDate:session.sessionDate,close:session.close,asOf:session.asOf,source:session.source},
        regime,researchOnly:true,executionWrite:false
      };
      if(input.researchScore===null)delete input.researchScore;
      ledger.createTrack(Perf.createForwardTrack(input));created++;
    }

    const activeTracks=ledger.listTracks({market:'TW',status:'TRACKING'}).length;
    const twSummary=ledger.summarize('TW',read.asOf);
    return Object.freeze({
      tw:Object.freeze({status:'FORWARD_TRACKING',created,sessionsRecorded,invalidSnapshots,activeTracks,summary:twSummary}),
      us:Object.freeze({status:'WAITING_LEGAL_DATA_SOURCE',created:0,reason:'US_DAILY_PRICE_SOURCE_NOT_ACTIVATED'}),
      researchOnly:true,executionWrite:false
    });
  }

  return Object.freeze({ingest});
}

module.exports=Object.freeze({createForwardResearchTracker});
