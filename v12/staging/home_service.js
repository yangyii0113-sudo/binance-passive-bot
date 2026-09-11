'use strict';

const {createHomeSnapshotStore,createReadOnlyHandler}=require('./read_api.js');
const {createHomeSnapshotPublisher}=require('./home_publisher.js');

function createStagingHomeService({lineageStore,forwardResearchTracker}={}){
  const homeStore=createHomeSnapshotStore();
  const publisher=createHomeSnapshotPublisher({homeStore,forwardResearchTracker});
  const handler=createReadOnlyHandler({homeStore,lineageStore});

  function publishHome(input={}){
    return publisher.publish(input);
  }

  return Object.freeze({publishHome,handler});
}

module.exports=Object.freeze({createStagingHomeService});
