'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createStagingPreviewApp}=require('../v12/staging/preview_app.js');

function request(server,{method='GET',path='/health'}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path,method},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });
    req.on('error',reject);req.end();
  });
}

async function withServer(fn){
  const app=createStagingPreviewApp();
  const server=http.createServer(app.handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await fn(server)}finally{await new Promise(resolve=>server.close(resolve))}
}

test('staging health endpoint is Railway-safe, research-only, and independent of Home availability',()=>withServer(async server=>{
  const res=await request(server);
  assert.equal(res.status,200);
  assert.equal(res.headers['cache-control'],'no-store');
  const body=JSON.parse(res.body);
  assert.deepEqual(body,{
    schemaVersion:'foxyya-staging-health/1',
    status:'OK',
    researchOnly:true,
    executionWrite:false
  });
  assert.equal((await request(server,{path:'/v12/api/home'})).status,503,'health must not fabricate Home data');
}));

test('staging health supports HEAD and rejects write methods',()=>withServer(async server=>{
  const head=await request(server,{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(head.body,'');
  for(const method of ['POST','PUT','PATCH','DELETE']){
    const res=await request(server,{method});
    assert.equal(res.status,405,method);
    assert.equal(res.headers.allow,'GET, HEAD');
  }
}));
