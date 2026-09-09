'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Lineage=require('../v12/data/source_lineage.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');
const {createStagingHomeService}=require('../v12/staging/home_service.js');

function request(server,{method='GET',path='/v12/api/home'}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path,method},res=>{
      let body='';
      res.setEncoding('utf8');
      res.on('data',chunk=>body+=chunk);
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });
    req.on('error',reject);
    req.end();
  });
}

function createLineageFixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-lineage-read-api-'));
  const filePath=path.join(dir,'read.lineage.jsonl');
  const store=createDurableSourceLineageStore({filePath,now:()=>2000});
  const observation=Object.freeze({
    schemaVersion:'foxyya-observation/1',
    instrumentId:'TWSE:2330',
    market:'TW',
    field:'price.close',
    value:1215,
    unit:'TWD',
    currency:'TWD',
    observedAt:1000,
    receivedAt:1100,
    source:'TWSE:STOCK_DAY_ALL',
    status:'SNAPSHOT',
    confidence:1
  });
  const source=Lineage.createSourceObservationLineage({
    sourceId:'twse-openapi',
    datasetId:'TWSE:STOCK_DAY_ALL',
    subjectId:'TWSE:2330',
    fetchStartedAt:1050,
    receivedAt:1100,
    bindingVersion:'foxyya-binding/twse-daily-quote/1',
    adapterVersion:'foxyya-adapter/twse/1',
    canonicalSchemaVersion:'foxyya-observation/1',
    sourceStatus:'AVAILABLE',
    observations:[observation]
  });
  store.recordSource(source);
  const output=Lineage.createResearchOutputLineage({
    outputType:'TW_RESEARCH',
    subjectId:'TWSE:2330',
    asOf:1500,
    outputSchemaVersion:'foxyya-tw-asset-read-model/1',
    modelVersion:null,
    policyVersion:'tw-lineage-v1',
    sourceLineageRefs:[source.lineageRef],
    observationRefs:[...source.observationRefs]
  });
  store.recordOutput(output);
  return {dir,store,source,output};
}

async function withServer(lineageStore,fn){
  const service=createStagingHomeService({lineageStore});
  const server=http.createServer(service.handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await fn(server,service)}finally{await new Promise(resolve=>server.close(resolve))}
}

test('lineage trace endpoint returns the exact durable output, official sources, and canonical observations',async()=>{
  const fixture=createLineageFixture();
  try{
    await withServer(fixture.store,async server=>{
      const res=await request(server,{path:'/v12/api/lineage/output/'+fixture.output.lineageRef});
      assert.equal(res.status,200);
      assert.equal(res.headers['cache-control'],'no-store');
      const body=JSON.parse(res.body);
      assert.equal(body.schemaVersion,'foxyya-lineage-trace-read/1');
      assert.equal(body.status,'AVAILABLE');
      assert.equal(body.lineageRef,fixture.output.lineageRef);
      assert.equal(body.researchOnly,true);
      assert.equal(body.executionWrite,false);
      assert.deepEqual(body.data.output,fixture.output);
      assert.deepEqual(body.data.sources,[fixture.source]);
      assert.equal(body.data.observations.length,1);
      assert.deepEqual(body.data.observations[0].observation,fixture.source.observations[0]);
    });
  }finally{fs.rmSync(fixture.dir,{recursive:true,force:true})}
});

test('lineage trace endpoint supports HEAD without returning a body',async()=>{
  const fixture=createLineageFixture();
  try{
    await withServer(fixture.store,async server=>{
      const res=await request(server,{method:'HEAD',path:'/v12/api/lineage/output/'+fixture.output.lineageRef});
      assert.equal(res.status,200);
      assert.equal(res.body,'');
    });
  }finally{fs.rmSync(fixture.dir,{recursive:true,force:true})}
});

test('lineage trace endpoint fails closed for malformed, unknown, and unavailable lineage references',async()=>{
  const fixture=createLineageFixture();
  try{
    await withServer(fixture.store,async server=>{
      assert.equal((await request(server,{path:'/v12/api/lineage/output/out_not-a-sha'})).status,400);
      assert.equal((await request(server,{path:'/v12/api/lineage/output/out_'+'0'.repeat(64)})).status,404);
    });
    await withServer(undefined,async server=>{
      assert.equal((await request(server,{path:'/v12/api/lineage/output/'+fixture.output.lineageRef})).status,503);
    });
  }finally{fs.rmSync(fixture.dir,{recursive:true,force:true})}
});

test('lineage trace endpoint is strictly read-only',async()=>{
  const fixture=createLineageFixture();
  try{
    await withServer(fixture.store,async server=>{
      for(const method of ['POST','PUT','PATCH','DELETE']){
        const res=await request(server,{method,path:'/v12/api/lineage/output/'+fixture.output.lineageRef});
        assert.equal(res.status,405,method);
        assert.equal(res.headers.allow,'GET, HEAD');
      }
      assert.deepEqual(fixture.store.output(fixture.output.lineageRef),fixture.output);
    });
  }finally{fs.rmSync(fixture.dir,{recursive:true,force:true})}
});
