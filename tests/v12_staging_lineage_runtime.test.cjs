'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Lineage=require('../v12/data/source_lineage.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');
const {startStagingPreviewServer}=require('../v12/staging/server.js');

function request(address,path){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:address.address,port:address.port,path,method:'GET'},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));
    });
    req.on('error',reject);req.end();
  });
}

function seedJournal(filePath){
  const store=createDurableSourceLineageStore({filePath,now:()=>2000});
  const observation={schemaVersion:'foxyya-observation/1',instrumentId:'NASDAQ:NVDA',market:'US',field:'fundamental.revenue',value:30000000000,unit:'USD',currency:'USD',observedAt:1000,receivedAt:1100,source:'SEC:companyfacts',status:'SNAPSHOT',confidence:1};
  const source=Lineage.createSourceObservationLineage({sourceId:'sec-edgar',datasetId:'SEC:companyfacts',subjectId:'NASDAQ:NVDA',fetchStartedAt:1050,receivedAt:1100,bindingVersion:'foxyya-binding/sec-company-fact/1',adapterVersion:'foxyya-adapter/sec-edgar/1',canonicalSchemaVersion:'foxyya-observation/1',sourceStatus:'AVAILABLE',observations:[observation]});
  store.recordSource(source);
  const output=Lineage.createResearchOutputLineage({outputType:'US_RESEARCH',subjectId:'NASDAQ:NVDA',asOf:1500,outputSchemaVersion:'foxyya-us-asset-read-model/1',sourceLineageRefs:[source.lineageRef],observationRefs:[...source.observationRefs]});
  store.recordOutput(output);
  return {source,output};
}

test('staging server replays a durable lineage journal and serves the same trace after restart',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-staging-lineage-runtime-'));
  const filePath=path.join(dir,'staging.lineage.jsonl');
  const fixture=seedJournal(filePath);
  const route='/v12/api/lineage/output/'+fixture.output.lineageRef;
  try{
    const first=await startStagingPreviewServer({host:'127.0.0.1',port:0,lineageFilePath:filePath});
    let firstBody;
    try{
      const res=await request(first.address,route);
      assert.equal(res.status,200);
      firstBody=JSON.parse(res.body);
      assert.deepEqual(firstBody.data.output,fixture.output);
    }finally{await first.close()}

    const second=await startStagingPreviewServer({host:'127.0.0.1',port:0,lineageFilePath:filePath});
    try{
      const res=await request(second.address,route);
      assert.equal(res.status,200);
      assert.deepEqual(JSON.parse(res.body),firstBody);
    }finally{await second.close()}
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('staging server without a lineage journal keeps lineage API explicitly unavailable',async()=>{
  const runtime=await startStagingPreviewServer({host:'127.0.0.1',port:0});
  try{
    const res=await request(runtime.address,'/v12/api/lineage/output/out_'+'0'.repeat(64));
    assert.equal(res.status,503);
  }finally{await runtime.close()}
});

test('staging lineage runtime rejects invalid journal paths before listening',async()=>{
  let leakedRuntime=null;
  try{
    await assert.rejects(async()=>{
      leakedRuntime=await startStagingPreviewServer({host:'127.0.0.1',port:0,lineageFilePath:'/tmp/foxyya-lineage.txt'});
      throw Error('INVALID_LINEAGE_PATH_ACCEPTED');
    },/LINEAGE_JOURNAL_PATH_INVALID/);
  }finally{
    if(leakedRuntime)await leakedRuntime.close();
  }
});
