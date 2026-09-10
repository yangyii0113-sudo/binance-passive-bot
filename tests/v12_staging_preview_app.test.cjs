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

function runtimeReadModel(asOf=5000){
  return {
    schema_version:'foxyya-runtime/1',api_version:'v12',mode:'PAPER_ONLY',as_of:asOf,read_only:true,execution_write:false,
    runtime:{status:'ONLINE',started_ms:100,uptime_seconds:100,cycle_count:10,last_cycle:null,last_error:null},
    safety:{paper_only:true,real_order_lock:true,real_order_capability:false,private_api_enabled:false,signed_order_enabled:false,backfill_allowed:false,research_execution_write:false},
    strategy:{control_version:'v11.2'},
    execution:{qualified_24h:1,filled_24h:0,cancelled_24h:0,backfill_count:0,duplicate_fill_count:0,pending:0,open_positions:0,closed_trades:0},
    positions:{open:[],pending:[]},
    ledger:{status:'HEALTHY',integrity:true,canonical_book:'5x',canonical_book_role:'PRIMARY',canonical_nav:1000,canonical_nav_source:'runtime_snapshot.books.5x.equity',event_count:0,currency:'USDT'},
    diagnostics:{},provenance:{generated_at:asOf,source_endpoints:['/api/runtime/status','/api/runtime/snapshot']}
  };
}

test('staging preview serves v12 shell and required same-origin assets without touching production root',()=>withApp(async(_app,server)=>{
  const root=await request(server,{path:'/v12-preview/'});
  assert.equal(root.status,200);
  assert.match(root.headers['content-type'],/text\/html/);
  assert.match(root.body,/FOXYYA v12 Preview/);
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

test('preview and read API share one internal runtime snapshot lifecycle',()=>withApp(async(app,server)=>{
  assert.equal((await request(server,{path:'/v12/api/runtime'})).status,503);
  app.publishRuntime(runtimeReadModel());
  const res=await request(server,{path:'/v12/api/runtime'});
  assert.equal(res.status,200);
  const body=JSON.parse(res.body);
  assert.equal(body.schema_version,'foxyya-runtime/1');
  assert.equal(body.ledger.canonical_book,'5x');
  assert.equal(body.ledger.canonical_nav,1000);
  assert.equal(body.read_only,true);
  assert.equal(body.execution_write,false);
}));

test('HTTP surface is read-only and never proxies production runtime or execution routes',()=>withApp(async(_app,server)=>{
  for(const method of ['POST','PUT','PATCH','DELETE']){
    assert.equal((await request(server,{method,path:'/v12/api/home'})).status,405,method+' home api');
    assert.equal((await request(server,{method,path:'/v12/api/runtime'})).status,405,method+' runtime api');
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

test('staging preview app exposes only internal publishers and HTTP handler',()=>{
  const app=createStagingPreviewApp();
  assert.deepEqual(Object.keys(app).sort(),['handler','publishHome','publishRuntime']);
  assert.doesNotMatch(JSON.stringify(Object.keys(app)).toLowerCase(),/order|trade|execute|position|fill/);
});
