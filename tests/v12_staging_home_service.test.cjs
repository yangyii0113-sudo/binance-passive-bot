const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createStagingHomeService}=require('../v12/staging/home_service.js');

function request(server,{method='GET',path='/v12/api/home'}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path,method},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));
    });
    req.on('error',reject);req.end();
  });
}

async function withService(fn){
  const service=createStagingHomeService();
  const server=http.createServer(service.handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await fn(service,server)}finally{await new Promise(resolve=>server.close(resolve))}
}

test('shared staging service is unavailable before internal publish and serves the same published snapshot afterward',()=>withService(async(service,server)=>{
  assert.equal((await request(server)).status,503);
  const published=service.publishHome({asOf:1000});
  const res=await request(server);
  assert.equal(res.status,200);
  const body=JSON.parse(res.body);
  assert.equal(body.schemaVersion,'foxyya-home-read-model/1');
  assert.equal(body.asOf,1000);
  assert.equal(body.executionWrite,false);
  assert.equal(body.researchOnly,true);
  assert.deepEqual(body,JSON.parse(JSON.stringify(published)));
}));

test('HTTP write methods cannot publish or mutate staging state',()=>withService(async(service,server)=>{
  for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await request(server,{method})).status,405,method);
  assert.equal((await request(server)).status,503);
  service.publishHome({asOf:2000});
  assert.equal((await request(server,{method:'POST'})).status,405);
  assert.equal(JSON.parse((await request(server)).body).asOf,2000);
}));

test('failed internal publish preserves the last API-visible snapshot',()=>withService(async(service,server)=>{
  service.publishHome({asOf:3000});
  assert.throws(()=>service.publishHome({asOf:NaN}),/ASOF_INVALID/);
  assert.throws(()=>service.publishHome({asOf:2999}),/SNAPSHOT_TIME_REGRESSION/);
  const body=JSON.parse((await request(server)).body);
  assert.equal(body.asOf,3000);
}));

test('staging service exposes only internal publish and read handler, never execution methods',()=>{
  const service=createStagingHomeService();
  assert.deepEqual(Object.keys(service).sort(),['handler','publishHome']);
  assert.doesNotMatch(JSON.stringify(Object.keys(service)).toLowerCase(),/order|trade|execute|position|fill/);
});
