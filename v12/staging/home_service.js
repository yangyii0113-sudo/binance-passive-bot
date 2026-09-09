'use strict';

const {createHomeSnapshotStore,createReadOnlyHandler}=require('./read_api.js');
const {createHomeSnapshotPublisher}=require('./home_publisher.js');

function createStagingHomeService(){
  const homeStore=createHomeSnapshotStore();
  const publisher=createHomeSnapshotPublisher({homeStore});
  const handler=createReadOnlyHandler({homeStore});

  function publishHome(input={}){
    return publisher.publish(input);
  }

  return Object.freeze({publishHome,handler});
}

module.exports=Object.freeze({createStagingHomeService});
