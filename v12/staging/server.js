'use strict';

const http=require('node:http');
const {createStagingPreviewApp}=require('./preview_app.js');

function validateHost(host){
  if(typeof host!=='string'||!host.trim())throw Error('HOST_INVALID');
  return host.trim();
}

function validatePort(port){
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('PORT_INVALID');
  return port;
}

function startStagingPreviewServer({host='127.0.0.1',port=0}={}){
  return new Promise((resolve,reject)=>{
    let validHost,validPort;
    try{
      validHost=validateHost(host);
      validPort=validatePort(port);
    }catch(error){
      reject(error);
      return;
    }

    const app=createStagingPreviewApp();
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
        address:Object.freeze({
          address:address.address,
          port:address.port,
          family:address.family
        }),
        close
      }));
    };

    server.once('error',onError);
    server.once('listening',onListening);
    server.listen(validPort,validHost);
  });
}

module.exports=Object.freeze({startStagingPreviewServer});
