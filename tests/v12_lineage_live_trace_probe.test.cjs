'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {runLineageLiveTraceProbe}=require('../v12/staging/lineage_live_trace_probe.js');

function listen(handler){
  const server=http.createServer(handler);
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(server));
  });
}
function close(server){return new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}

const REF='out_'+'a'.repeat(64);

test('live lineage probe performs real HTTP home -> trace round trip and validates read-only invariants',async()=>{
  const seen=[];
  const server=await listen((req,res)=>{
    seen.push(req.url);
    res.setHeader('content-type','application/json');
    if(req.url==='/v12/api/home'){
      res.end(JSON.stringify({
        schemaVersion:'foxyya-home-read-model/1',asOf:123,home:{research:{TW:[{lineageRef:REF}]}},
        researchOnly:true,executionWrite:false
      }));
      return;
    }
    if(req.url===`/v12/api/lineage/output/${REF}`){
      res.end(JSON.stringify({
        schemaVersion:'foxyya-lineage-trace-read/1',status:'AVAILABLE',lineageRef:REF,
        data:{output:{lineageRef:REF},sources:[{lineageRef:'src_1'}],observations:[{observationRef:'obs_1'}],researchOnly:true,executionWrite:false},
        researchOnly:true,executionWrite:false
      }));
      return;
    }
    res.statusCode=404;res.end(JSON.stringify({status:'NOT_FOUND'}));
  });
  try{
    const port=server.address().port;
    const result=await runLineageLiveTraceProbe({host:'127.0.0.1',port,timeoutMs:2000});
    assert.equal(result.status,'PASSED');
    assert.equal(result.lineageRef,REF);
    assert.equal(result.homeStatus,200);
    assert.equal(result.traceStatus,200);
    assert.equal(result.researchOnly,true);
    assert.equal(result.executionWrite,false);
    assert.deepEqual(seen,['/v12/api/home',`/v12/api/lineage/output/${REF}`]);
  }finally{await close(server);}
});

test('live lineage probe fails closed when home has no output lineage reference',async()=>{
  const server=await listen((req,res)=>{
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({schemaVersion:'foxyya-home-read-model/1',asOf:123,home:{},researchOnly:true,executionWrite:false}));
  });
  try{
    await assert.rejects(()=>runLineageLiveTraceProbe({host:'127.0.0.1',port:server.address().port,timeoutMs:2000}),/LINEAGE_LIVE_PROBE_REF_MISSING/);
  }finally{await close(server);}
});

test('live lineage probe rejects a trace response that violates read-only invariants',async()=>{
  const server=await listen((req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.url==='/v12/api/home')return res.end(JSON.stringify({schemaVersion:'foxyya-home-read-model/1',asOf:123,home:{x:{lineageRef:REF}},researchOnly:true,executionWrite:false}));
    res.end(JSON.stringify({schemaVersion:'foxyya-lineage-trace-read/1',status:'AVAILABLE',lineageRef:REF,data:{output:{lineageRef:REF},sources:[],observations:[],researchOnly:true,executionWrite:true},researchOnly:true,executionWrite:true}));
  });
  try{
    await assert.rejects(()=>runLineageLiveTraceProbe({host:'127.0.0.1',port:server.address().port,timeoutMs:2000}),/LINEAGE_LIVE_PROBE_READ_ONLY_REQUIRED/);
  }finally{await close(server);}
});
