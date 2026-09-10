'use strict';

const {createHomeSnapshotStore,createRuntimeSnapshotStore,createReadOnlyHandler}=require('./read_api.js');
const {createHomeSnapshotPublisher}=require('./home_publisher.js');

function createStagingHomeService({lineageStore}={}){
  const homeStore=createHomeSnapshotStore();
  const runtimeStore=createRuntimeSnapshotStore();
  const publisher=createHomeSnapshotPublisher({homeStore});
  const handler=createReadOnlyHandler({homeStore,runtimeStore,lineageStore});

  function publishHome(input={}){
    return publisher.publish(input);
  }

  function publishRuntime(snapshot){
    return runtimeStore.publish(snapshot);
  }

  return Object.freeze({publishHome,publishRuntime,handler});
}

module.exports=Object.freeze({createStagingHomeService});
