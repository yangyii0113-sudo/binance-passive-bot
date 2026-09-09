'use strict';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);

function validateHomeReadModel(value){
  if(!object(value)||value.schemaVersion!=='foxyya-home-read-model/1'||!object(value.home))throw Error('HOME_READ_MODEL_REQUIRED');
  if(value.researchOnly!==true||value.executionWrite!==false)throw Error('HOME_READ_ONLY_REQUIRED');
  if(!finite(value.asOf)||value.asOf<0)throw Error('ASOF_INVALID');
  return value;
}

function createHomeSnapshotStore(){
  let current=null;

  function publish(value){
    validateHomeReadModel(value);
    if(current&&value.asOf<current.asOf)throw Error('SNAPSHOT_TIME_REGRESSION');
    current=value;
    return current;
  }

  function read(){
    return current;
  }

  return Object.freeze({publish,read});
}

function sendJson(res,statusCode,body,{head=false}={}){
  const payload=JSON.stringify(body);
  res.statusCode=statusCode;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  if(head)return res.end();
  return res.end(payload);
}

function createReadOnlyHandler({homeStore}={}){
  if(!homeStore||typeof homeStore.read!=='function')throw Error('HOME_STORE_REQUIRED');

  return function readOnlyHandler(req,res){
    const pathname=String(req.url||'').split('?')[0];
    if(pathname!=='/v12/api/home')return sendJson(res,404,{status:'NOT_FOUND'});

    const method=String(req.method||'GET').toUpperCase();
    if(method!=='GET'&&method!=='HEAD'){
      res.setHeader('allow','GET, HEAD');
      return sendJson(res,405,{status:'METHOD_NOT_ALLOWED'});
    }

    const snapshot=homeStore.read();
    if(!snapshot)return sendJson(res,503,{status:'UNAVAILABLE',data:null},{head:method==='HEAD'});
    return sendJson(res,200,snapshot,{head:method==='HEAD'});
  };
}

module.exports=Object.freeze({validateHomeReadModel,createHomeSnapshotStore,createReadOnlyHandler});
