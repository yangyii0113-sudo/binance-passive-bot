const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const API=require('../v12/staging/read_api.js');

const asOf=Date.parse('2026-09-09T05:30:00Z');
const safeHome=Object.freeze({
  schemaVersion:'foxyya-home-read-model/1',asOf,researchOnly:true,executionWrite:false,
  home:Object.freeze({schemaVersion:'foxyya-home-model/1',asOf,regions:Object.freeze([]),marketPulse:Object.freeze([]),todayFocus:Object.freeze([]),earlyTrend:Object.freeze([]),opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([])}),events:Object.freeze([])})
});

function request(server,{method='GET',path='/v12/api/home'}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path,method},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });
    req.on('error',reject);req.end();
  });
}

async function withServer(fn){
  const store=API.createHomeSnapshotStore();
  store.publish(safeHome);
  const server=http.createServer(API.createReadOnlyHandler({homeStore:store}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await fn(server,store)}finally{await new Promise(resolve=>server.close(resolve))}
}

test('staging API serves only validated safe home read model on GET',()=>withServer(async server=>{
  const res=await request(server);
  assert.equal(res.status,200);
  assert.match(res.headers['content-type'],/application\/json/);
  assert.equal(res.headers['cache-control'],'no-store');
  const body=JSON.parse(res.body);
  assert.equal(body.schemaVersion,'foxyya-home-read-model/1');
  assert.equal(body.researchOnly,true);
  assert.equal(body.executionWrite,false);
}));

test('staging API rejects all write methods and unknown routes',()=>withServer(async server=>{
  for(const method of ['POST','PUT','PATCH','DELETE']){
    const res=await request(server,{method});
    assert.equal(res.status,405,method);
  }
  assert.equal((await request(server,{path:'/v12/api/order'})).status,404);
  assert.equal((await request(server,{path:'/api/runtime'})).status,404);
}));

test('snapshot store rejects writable, wrong-schema, and older snapshots',()=>{
  const store=API.createHomeSnapshotStore();
  assert.throws(()=>store.publish({...safeHome,executionWrite:true}),/HOME_READ_ONLY_REQUIRED/);
  assert.throws(()=>store.publish({...safeHome,schemaVersion:'other'}),/HOME_READ_MODEL_REQUIRED/);
  assert.equal(store.publish(safeHome).asOf,asOf);
  assert.throws(()=>store.publish({...safeHome,asOf:asOf-1}),/SNAPSHOT_TIME_REGRESSION/);
});

test('empty store returns explicit unavailable service state rather than fabricated home data',()=>new Promise(async(resolve,reject)=>{
  const store=API.createHomeSnapshotStore();
  const server=http.createServer(API.createReadOnlyHandler({homeStore:store}));
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try{
    const res=await request(server);
    assert.equal(res.status,503);
    const body=JSON.parse(res.body);
    assert.equal(body.status,'UNAVAILABLE');
    assert.equal(body.data,null);
    resolve();
  }catch(error){reject(error)}finally{server.close()}
}));
