'use strict';

const http=require('node:http');
const {createStagingPreviewApp}=require('./preview_app.js');
const {createDurableSourceLineageStore}=require('./durable_source_lineage_store.js');

function validateHost(host){
  if(typeof host!=='string'||!host.trim())throw Error('HOST_INVALID');
  return host.trim();
}

function validatePort(port){
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('PORT_INVALID');
  return port;
}

function resolveLineageStore({lineageFilePath,lineageStore}={}){
  if(lineageStore!==undefined&&lineageStore!==null){
    if(typeof lineageStore!=='object'||typeof lineageStore.traceOutput!=='function')throw Error('LINEAGE_STORE_INVALID');
    return lineageStore;
  }
  if(lineageFilePath===undefined||lineageFilePath===null)return null;
  return createDurableSourceLineageStore({filePath:lineageFilePath});
}

function startStagingPreviewServer({host='127.0.0.1',port=0,lineageFilePath,lineageStore,forwardResearchTracker}={}){
  return new Promise((resolve,reject)=>{
    let validHost,validPort,durableLineage;
    try{
      validHost=validateHost(host);
      validPort=validatePort(port);
      durableLineage=resolveLineageStore({lineageFilePath,lineageStore});
    }catch(error){
      reject(error);
      return;
    }

    const app=createStagingPreviewApp({lineageStore:durableLineage,forwardResearchTracker});
    const server=http.createServer(app.handler);

    const onError=error=>{
      server.removeListener('listening',onListening);
      reject(error);
    };

    const onListening=()=>{
      server.removeListener('error',onError);
      const address=server.address();

      function close(){
        return new Promise((resolveClose,rejectClose)=>{
          if(!server.listening)return resolveClose();
          server.close(error=>error?rejectClose(error):resolveClose());
        });
      }

      resolve(Object.freeze({
        app,
        server,
        address:Object.freeze({address:address.address,port:address.port,family:address.family}),
        close
      }));
    };

    server.once('error',onError);
    server.once('listening',onListening);
    server.listen(validPort,validHost);
  });
}

module.exports=Object.freeze({startStagingPreviewServer});
