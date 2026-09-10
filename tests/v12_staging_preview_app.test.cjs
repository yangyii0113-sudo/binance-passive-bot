const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createStagingPreviewApp}=require('../v12/staging/preview_app.js');

function request(server,{method='GET',path='/v12-preview/'}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path,method},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });
    req.on('error',reject);req.end();
  });
}

async function withApp(fn){
  const app=createStagingPreviewApp();
  const server=http.createServer(app.handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await fn(app,server)}finally{await new Promise(resolve=>server.close(resolve))}
}

test('staging preview serves v12 shell and required same-origin assets without touching production root',()=>withApp(async(_app,server)=>{
  const root=await request(server,{path:'/v12-preview/'});
  assert.equal(root.status,200);
  assert.match(root.headers['content-type'],/text\/html/);
  assert.match(root.body,/FOXYYA v12 預覽/);
  assert.match(root.body,/研究測試環境/);
  assert.match(root.body,/EXECUTION_WRITE=false/,'technical safety flag remains visible in localized shell');
  assert.match(root.body,/\.\.\/staging\/read_client\.js/);

  const css=await request(server,{path:'/v12-preview/styles.css'});
  assert.equal(css.status,200);
  assert.match(css.headers['content-type'],/text\/css/);

  const client=await request(server,{path:'/staging/read_client.js'});
  assert.equal(client.status,200);
  assert.match(client.headers['content-type'],/javascript/);

  assert.equal((await request(server,{path:'/'})).status,404);
}));

test('preview and read API share one internal home snapshot lifecycle',()=>withApp(async(app,server)=>{
  assert.equal((await request(server,{path:'/v12/api/home'})).status,503);
  app.publishHome({asOf:4000});
  const res=await request(server,{path:'/v12/api/home'});
  assert.equal(res.status,200);
  const body=JSON.parse(res.body);
  assert.equal(body.asOf,4000);
  assert.equal(body.researchOnly,true);
  assert.equal(body.executionWrite,false);
}));

test('HTTP surface is read-only and never proxies production runtime or execution routes',()=>withApp(async(_app,server)=>{
  for(const method of ['POST','PUT','PATCH','DELETE']){
    assert.equal((await request(server,{method,path:'/v12/api/home'})).status,405,method+' api');
    assert.equal((await request(server,{method,path:'/v12-preview/'})).status,405,method+' preview');
  }
  for(const path of ['/api/runtime','/api/runtime/status','/order','/v12/api/order']){
    assert.equal((await request(server,{path})).status,404,path);
  }
}));

test('preview static router rejects traversal and only exposes approved files',()=>withApp(async(_app,server)=>{
  for(const path of ['/v12-preview/../service.py','/v12-preview/%2e%2e/service.py','/v12-preview/package.json','/staging/home_service.js']){
    assert.equal((await request(server,{path})).status,404,path);
  }
}));

test('staging preview app exposes only internal publish and HTTP handler',()=>{
  const app=createStagingPreviewApp();
  assert.deepEqual(Object.keys(app).sort(),['handler','publishHome']);
  assert.doesNotMatch(JSON.stringify(Object.keys(app)).toLowerCase(),/order|trade|execute|position|fill/);
});
