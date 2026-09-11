'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {createStagingHomeService}=require('./home_service.js');

const UI_DIR=path.resolve(__dirname,'../ui');
const STATIC_ROUTES=Object.freeze({
  '/v12-preview/':Object.freeze({file:path.join(UI_DIR,'index.html'),type:'text/html; charset=utf-8'}),
  '/v12-preview/index.html':Object.freeze({file:path.join(UI_DIR,'index.html'),type:'text/html; charset=utf-8'}),
  '/v12-preview/styles.css':Object.freeze({file:path.join(UI_DIR,'styles.css'),type:'text/css; charset=utf-8'}),
  '/v12-preview/routes.js':Object.freeze({file:path.join(UI_DIR,'routes.js'),type:'application/javascript; charset=utf-8'}),
  '/v12-preview/home_model.js':Object.freeze({file:path.join(UI_DIR,'home_model.js'),type:'application/javascript; charset=utf-8'}),
  '/v12-preview/home_view_model.js':Object.freeze({file:path.join(UI_DIR,'home_view_model.js'),type:'application/javascript; charset=utf-8'}),
  '/v12-preview/home_renderer.js':Object.freeze({file:path.join(UI_DIR,'home_renderer.js'),type:'application/javascript; charset=utf-8'}),
  '/v12-preview/home_dom.js':Object.freeze({file:path.join(UI_DIR,'home_dom.js'),type:'application/javascript; charset=utf-8'}),
  '/v12-preview/product_renderer.js':Object.freeze({file:path.join(UI_DIR,'product_renderer.js'),type:'application/javascript; charset=utf-8'}),
  '/v12-preview/lineage_evidence.js':Object.freeze({file:path.join(UI_DIR,'lineage_evidence.js'),type:'application/javascript; charset=utf-8'}),
  '/v12-preview/app.js':Object.freeze({file:path.join(UI_DIR,'app.js'),type:'application/javascript; charset=utf-8'}),
  '/staging/read_client.js':Object.freeze({file:path.join(__dirname,'read_client.js'),type:'application/javascript; charset=utf-8'})
});
const HEALTH=Object.freeze({
  schemaVersion:'foxyya-staging-health/1',
  status:'OK',
  researchOnly:true,
  executionWrite:false
});

function sendText(res,status,body){
  const data=Buffer.from(body,'utf8');
  res.statusCode=status;
  res.setHeader('Content-Type','text/plain; charset=utf-8');
  res.setHeader('Content-Length',String(data.length));
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(data);
}

function sendJson(res,status,body,{head=false}={}){
  const data=Buffer.from(JSON.stringify(body),'utf8');
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Length',String(data.length));
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(head)return res.end();
  res.end(data);
}

function readMethod(req,res){
  const method=String(req.method||'GET').toUpperCase();
  if(method==='GET'||method==='HEAD')return method;
  res.setHeader('Allow','GET, HEAD');
  sendText(res,405,'METHOD_NOT_ALLOWED');
  return null;
}

function createStagingPreviewApp({lineageStore,forwardResearchTracker}={}){
  const homeService=createStagingHomeService({lineageStore,forwardResearchTracker});

  function publishHome(input={}){
    return homeService.publishHome(input);
  }

  function handler(req,res){
    const url=new URL(req.url||'/','http://staging.local');
    const pathname=url.pathname;

    if(pathname==='/health'){
      const method=readMethod(req,res);
      if(!method)return;
      return sendJson(res,200,HEALTH,{head:method==='HEAD'});
    }

    if(pathname.startsWith('/v12/api/'))return homeService.handler(req,res);

    const asset=STATIC_ROUTES[pathname];
    if(!asset)return sendText(res,404,'NOT_FOUND');

    const method=readMethod(req,res);
    if(!method)return;

    let body;
    try{body=fs.readFileSync(asset.file)}catch(_error){return sendText(res,404,'NOT_FOUND')}

    res.statusCode=200;
    res.setHeader('Content-Type',asset.type);
    res.setHeader('Content-Length',String(body.length));
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(method==='HEAD')return res.end();
    res.end(body);
  }

  return Object.freeze({publishHome,handler});
}

module.exports=Object.freeze({createStagingPreviewApp});
