'use strict';

const Pipeline=require('../early_trend/evidence_pipeline.js');
const Fusion=require('../early_trend/fusion.js');
const TWResearch=require('../research/tw_engine.js');

const STATUS_WEIGHT=Object.freeze({LIVE:1,DELAYED:.75,SNAPSHOT:.5,STALE:0,UNAVAILABLE:0});
const text=x=>typeof x==='string'&&x.length>0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);

function observation(summary,field){
  return (Array.isArray(summary?.observations)?summary.observations:[]).find(x=>x?.field===field)||null;
}

function summaryInstrumentId(summary){
  return text(summary?.instrument?.instrumentId)?summary.instrument.instrumentId:null;
}

function assertSingleInstrument(values){
  const ids=[];
  for(const value of values){
    const id=summaryInstrumentId(value);
    if(id)ids.push(id);
  }
  const unique=[...new Set(ids)];
  if(!unique.length)throw Error('INSTRUMENT_REQUIRED');
  if(unique.length!==1)throw Error('INSTRUMENT_MISMATCH');
  return unique[0];
}

function canonicalSession(pair,instrumentId){
  if(!pair||typeof pair!=='object')throw Error('SESSION_REQUIRED');
  const id=assertSingleInstrument([pair.quote,pair.flow]);
  if(id!==instrumentId)throw Error('INSTRUMENT_MISMATCH');
  return Object.freeze({
    flowObservations:Array.isArray(pair.flow?.observations)?pair.flow.observations:[],
    volumeObservation:observation(pair.quote,'volume.shares')
  });
}

function earlyEvidenceRank(item){
  const weight=(STATUS_WEIGHT[item?.status]||0)*(finite(item?.confidence)?item.confidence:0);
  const basis=Number.isInteger(item?.basisCount)&&item.basisCount>0?item.basisCount:0;
  const asOf=finite(item?.asOf)?item.asOf:0;
  return [weight,basis,asOf];
}

function isBetter(candidate,current){
  if(!current)return true;
  const a=earlyEvidenceRank(candidate),b=earlyEvidenceRank(current);
  return a[0]>b[0]||(a[0]===b[0]&&a[1]>b[1])||(a[0]===b[0]&&a[1]===b[1]&&a[2]>b[2]);
}

function researchDimension(item){
  if(item?.family==='INSTITUTIONAL')return'INSTITUTIONAL';
  if(item?.kind==='MONTHLY_REVENUE_YOY_ACCELERATION')return'REVENUE';
  return null;
}

function bridgeEarlyEvidence(evidence){
  const selected=new Map();
  for(const item of Array.isArray(evidence)?evidence:[]){
    const dimension=researchDimension(item);
    if(!dimension||item.status==='UNAVAILABLE'||item.status==='STALE')continue;
    const prev=selected.get(dimension);
    if(isBetter(item,prev))selected.set(dimension,item);
  }
  return Object.freeze([...selected.entries()].map(([dimension,item])=>Object.freeze({
    dimension,
    score:item.direction,
    confidence:item.confidence,
    status:item.status,
    asOf:item.asOf,
    source:item.source,
    label:item.kind,
    metadata:Object.freeze({family:item.family,kind:item.kind,basisCount:item.basisCount||0,metrics:item.metrics||null})
  })));
}

function collectSources(values){
  const out=new Set();
  for(const value of values){
    for(const obs of Array.isArray(value?.observations)?value.observations:[]){
      if(text(obs?.source))out.add(obs.source);
    }
  }
  return Object.freeze([...out].sort());
}

function buildTWAssetResearchSnapshot(input={}){
  if(!finite(input.nowMs)||input.nowMs<0)throw Error('NOW_INVALID');
  const sessionPairs=Array.isArray(input.institutionalSessions)?input.institutionalSessions:[];
  const summaries=[input.currentQuote,input.currentFlow,input.currentRevenue,input.previousRevenue];
  for(const pair of sessionPairs)summaries.push(pair?.quote,pair?.flow);
  const instrumentId=assertSingleInstrument(summaries);
  if(summaryInstrumentId(input.currentQuote)!==instrumentId||summaryInstrumentId(input.currentFlow)!==instrumentId)throw Error('CURRENT_MARKET_DATA_REQUIRED');

  const currentFlow=Object.freeze({
    flowObservations:Array.isArray(input.currentFlow.observations)?input.currentFlow.observations:[],
    volumeObservation:observation(input.currentQuote,'volume.shares')
  });
  const institutionalSessions=sessionPairs.map(pair=>canonicalSession(pair,instrumentId));
  const evidenceSet=Pipeline.buildEvidenceSet({
    policy:input.policy,
    market:'TW',
    inputs:{
      instrumentId,
      currentFlow,
      institutionalSessions,
      currentRevenue:input.currentRevenue||null,
      previousRevenue:input.previousRevenue||null
    }
  });
  const earlyTrend=Fusion.fuseEvidence(evidenceSet.evidence,input.nowMs);
  const bridged=bridgeEarlyEvidence(evidenceSet.evidence);
  const extra=Array.isArray(input.researchEvidence)?input.researchEvidence:[];
  const research=TWResearch.buildTWResearch({instrumentId,evidence:[...bridged,...extra],earlyTrend,nowMs:input.nowMs});

  return Object.freeze({
    schemaVersion:'foxyya-tw-asset-read-model/1',
    market:'TW',
    instrumentId,
    asOf:Math.max(earlyTrend.asOf,research.asOf),
    quote:input.currentQuote,
    facts:Object.freeze([input.currentQuote,input.currentFlow,input.currentRevenue].flatMap(summary=>(summary?.observations||[]).map(obs=>Object.freeze({...obs,...(summary.reportPeriod?{reportPeriod:summary.reportPeriod}:{})})))) ,
    earlyTrend,
    research,
    sourceLineage:collectSources(summaries),
    researchOnly:true,
    executionWrite:false
  });
}

module.exports=Object.freeze({buildTWAssetResearchSnapshot,bridgeEarlyEvidence});
