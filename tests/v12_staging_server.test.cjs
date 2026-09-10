const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const {startStagingPreviewServer}=require('../v12/staging/server.js');

function request(address,{method='GET',path='/v12-preview/'}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:address.address,port:address.port,path,method},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));
    });
    req.on('error',reject);req.end();
  });
}

test('staging bootstrap starts an isolated HTTP preview with no fabricated initial snapshot',async()=>{
  const runtime=await startStagingPreviewServer({host:'127.0.0.1',port:0});
  try{
    const preview=await request(runtime.address);
    assert.equal(preview.status,200);
    assert.match(preview.body,/FOXYYA v12 預覽/);
    assert.match(preview.body,/研究測試環境/);
    assert.match(preview.body,/EXECUTION_WRITE=false/,'technical safety flag remains visible even when product copy is localized');
    assert.doesNotMatch(preview.body,/\bBUY\b|\bSELL\b|PLACE_ORDER|SUBMIT_ORDER|AUTHORIZE_EXECUTION|WITHDRAW|TRANSFER/i);
    assert.equal((await request(runtime.address,{path:'/v12/api/home'})).status,503);
    assert.equal((await request(runtime.address,{path:'/'})).status,404);
    assert.equal((await request(runtime.address,{method:'POST',path:'/v12/api/home'})).status,405);
  }finally{await runtime.close()}
});

test('internal publish becomes visible without changing the read-only HTTP contract',async()=>{
  const runtime=await startStagingPreviewServer({host:'127.0.0.1',port:0});
  try{
    runtime.app.publishHome({asOf:5000});
    const res=await request(runtime.address,{path:'/v12/api/home'});
    assert.equal(res.status,200);
    const body=JSON.parse(res.body);
    assert.equal(body.asOf,5000);
    assert.equal(body.executionWrite,false);
    assert.equal((await request(runtime.address,{method:'DELETE',path:'/v12/api/home'})).status,405);
  }finally{await runtime.close()}
});

test('bootstrap validates host and port and exposes no production runtime dependency',async()=>{
  await assert.rejects(()=>startStagingPreviewServer({host:'',port:0}),/HOST_INVALID/);
  await assert.rejects(()=>startStagingPreviewServer({host:'127.0.0.1',port:-1}),/PORT_INVALID/);
  const source=fs.readFileSync('v12/staging/server.js','utf8');
  assert.doesNotMatch(source,/service\.py|runtime_view\.py|\/api\/runtime|placeOrder|submitOrder/);
});

test('bootstrap module exports only the staging start function',()=>{
  const api=require('../v12/staging/server.js');
  assert.deepEqual(Object.keys(api),['startStagingPreviewServer']);
});
