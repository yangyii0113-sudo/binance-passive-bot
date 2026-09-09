'use strict';

const {buildHomeReadModel}=require('../read_model/home_snapshot.js');

function createHomeSnapshotPublisher({homeStore}={}){
  if(!homeStore||typeof homeStore.publish!=='function')throw Error('HOME_STORE_REQUIRED');

  function publish(input={}){
    const snapshot=buildHomeReadModel(input);
    return homeStore.publish(snapshot);
  }

  return Object.freeze({publish});
}

module.exports=Object.freeze({createHomeSnapshotPublisher});
