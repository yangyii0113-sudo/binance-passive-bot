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
  '/v12-preview/app.js':Object.freeze({file:path.join(UI_DIR,'app.js'),type:'application/javascript; charset=utf-8'}),
  '/staging/read_client.js':Object.freeze({file:path.join(__dirname,'read_client.js'),type:'application/javascript; charset=utf-8'})
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

function createStagingPreviewApp({lineageStore}={}){
  const homeService=createStagingHomeService({lineageStore});

  function publishHome(input={}){
    return homeService.publishHome(input);
  }

  function handler(req,res){
    const url=new URL(req.url||'/','http://staging.local');
    const pathname=url.pathname;

    if(pathname.startsWith('/v12/api/'))return homeService.handler(req,res);

    const asset=STATIC_ROUTES[pathname];
    if(!asset)return sendText(res,404,'NOT_FOUND');

    if(req.method!=='GET'&&req.method!=='HEAD'){
      res.setHeader('Allow','GET, HEAD');
      return sendText(res,405,'METHOD_NOT_ALLOWED');
    }

    let body;
    try{body=fs.readFileSync(asset.file)}catch(_error){return sendText(res,404,'NOT_FOUND')}

    res.statusCode=200;
    res.setHeader('Content-Type',asset.type);
    res.setHeader('Content-Length',String(body.length));
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method==='HEAD')return res.end();
    res.end(body);
  }

  return Object.freeze({publishHome,handler});
}

module.exports=Object.freeze({createStagingPreviewApp});
