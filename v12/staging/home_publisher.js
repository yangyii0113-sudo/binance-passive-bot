'use strict';

const {buildHomeReadModel}=require('../read_model/home_snapshot.js');

function unavailableResearchPerformance(asOf){
  return Object.freeze({
    schemaVersion:'foxyya-research-performance-read/1',
    status:'UNAVAILABLE',
    asOf,
    tw:Object.freeze({status:'UNAVAILABLE',summary:null}),
    us:Object.freeze({status:'UNAVAILABLE',summary:null}),
    researchOnly:true,
    executionWrite:false
  });
}

function validateTracker(value){
  if(value===undefined||value===null)return null;
  if(!value||typeof value!=='object'||typeof value.ingest!=='function')throw Error('FORWARD_RESEARCH_TRACKER_INVALID');
  return value;
}

function normalizeResearchPerformance(value,asOf){
  if(!value||typeof value!=='object'||value.researchOnly!==true||value.executionWrite!==false)throw Error('RESEARCH_PERFORMANCE_READ_ONLY_REQUIRED');
  return Object.freeze({
    schemaVersion:'foxyya-research-performance-read/1',
    status:'AVAILABLE',
    asOf,
    tw:value.tw||Object.freeze({status:'UNAVAILABLE',summary:null}),
    us:value.us||Object.freeze({status:'UNAVAILABLE',summary:null}),
    researchOnly:true,
    executionWrite:false
  });
}

function createHomeSnapshotPublisher({homeStore,forwardResearchTracker}={}){
  if(!homeStore||typeof homeStore.publish!=='function')throw Error('HOME_STORE_REQUIRED');
  const tracker=validateTracker(forwardResearchTracker);

  function publish(input={}){
    const snapshot=buildHomeReadModel(input);
    const researchPerformance=tracker
      ?normalizeResearchPerformance(tracker.ingest(snapshot),snapshot.asOf)
      :unavailableResearchPerformance(snapshot.asOf);
    const enriched=Object.freeze({...snapshot,researchPerformance});
    return homeStore.publish(enriched);
  }

  return Object.freeze({publish});
}

module.exports=Object.freeze({createHomeSnapshotPublisher});
