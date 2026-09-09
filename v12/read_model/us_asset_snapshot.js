'use strict';

const Market=require('../core/market_core.js');
const Fusion=require('../early_trend/fusion.js');
const USResearch=require('../research/us_engine.js');

const finite=x=>typeof x==='number'&&Number.isFinite(x);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.length>0;

function validateUSInstrument(instrument){
  const checked=Market.validateInstrument(instrument);
  if(!checked.ok||instrument.market!=='US')throw Error('US_INSTRUMENT_REQUIRED:'+checked.errors.join('|'));
  return instrument;
}

function validateFact(fact,instrumentId){
  if(!object(fact)||!object(fact.instrument)||fact.instrument.instrumentId!==instrumentId)throw Error('INSTRUMENT_MISMATCH');
  if(fact.source!=='SEC:companyfacts')throw Error('SEC_COMPANY_FACT_REQUIRED');
  return fact;
}

function collectSourceLineage(facts,extraEvidence,earlyEvidence){
  const sources=new Set();
  for(const fact of facts)if(text(fact.source))sources.add(fact.source);
  for(const item of [...extraEvidence,...earlyEvidence])if(text(item?.source))sources.add(item.source);
  return Object.freeze([...sources].sort());
}

function normalizeFundamentalFact(fact){
  return Object.freeze({
    taxonomy:fact.taxonomy,
    concept:fact.concept,
    unit:fact.unit,
    label:fact.label||'',
    description:fact.description||'',
    status:fact.status,
    knowledgeTime:fact.knowledgeTime,
    pointInTimeSafe:fact.pointInTimeSafe===true,
    rows:Object.freeze(Array.isArray(fact.rows)?[...fact.rows]:[]),
    observations:Object.freeze(Array.isArray(fact.observations)?[...fact.observations]:[]),
    source:fact.source,
    receivedAt:fact.receivedAt
  });
}

function buildUSAssetResearchSnapshot(input={}){
  if(!finite(input.nowMs)||input.nowMs<0)throw Error('NOW_INVALID');
  const instrument=validateUSInstrument(input.instrument);
  const facts=(Array.isArray(input.fundamentalFacts)?input.fundamentalFacts:[]).map(x=>validateFact(x,instrument.instrumentId));
  const researchEvidence=Array.isArray(input.researchEvidence)?input.researchEvidence:[];
  const earlyEvidence=Array.isArray(input.earlyEvidence)?input.earlyEvidence:[];

  const earlyTrend=Fusion.fuseEvidence(earlyEvidence,input.nowMs);
  const research=USResearch.buildUSResearch({
    instrumentId:instrument.instrumentId,
    evidence:researchEvidence,
    earnings:input.earnings||null,
    earlyTrend,
    nowMs:input.nowMs
  });

  const fundamentals=Object.freeze(facts.map(normalizeFundamentalFact));
  const sourceLineage=collectSourceLineage(facts,researchEvidence,earlyEvidence);
  const quoteAvailable=input.realtimeQuoteAvailable===true;
  const consensusAvailable=input.consensusAvailable===true;
  const optionsAvailable=input.optionsAvailable===true;

  return Object.freeze({
    schemaVersion:'foxyya-us-asset-read-model/1',
    market:'US',
    instrumentId:instrument.instrumentId,
    asOf:input.nowMs,
    instrument,
    fundamentals,
    earlyTrend,
    research,
    sourceLineage,
    dataGaps:Object.freeze({
      realtimeQuote:quoteAvailable?'AVAILABLE':'UNAVAILABLE',
      consensus:consensusAvailable?'AVAILABLE':'UNAVAILABLE',
      options:optionsAvailable?'AVAILABLE':'UNAVAILABLE'
    }),
    researchOnly:true,
    executionWrite:false
  });
}

module.exports=Object.freeze({buildUSAssetResearchSnapshot});
