'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Entry=require('../v12/staging/runtime_entry.js');

test('runtime startup probes validate lineage and market coverage after initial bootstrap',async()=>{
  const calls=[];
  const logs=[];
  const result=await Entry.runStartupProbes({address:{port:4321}},{
    runLineageProbeImpl:async options=>{calls.push(['lineage',options]);return {status:'PASSED',traceStatus:200,researchOnly:true,executionWrite:false}},
    runCoverageProbeImpl:async options=>{calls.push(['coverage',options]);return {status:'PASSED',homeStatus:200,marketCount:7,previewStatus:200,coverageCssStatus:200,rendererStatus:200,mobileCss:true,researchOnly:true,executionWrite:false}},
    logImpl:(message,payload)=>logs.push([message,payload])
  });
  assert.deepEqual(calls.map(x=>x[0]),['lineage','coverage']);
  for(const [,options] of calls){assert.equal(options.host,'127.0.0.1');assert.equal(options.port,4321);assert.equal(options.timeoutMs,10000)}
  assert.equal(result.lineage.status,'PASSED');
  assert.equal(result.coverage.marketCount,7);
  assert.equal(logs[0][0],'FOXYYA v12 live lineage trace probe passed');
  assert.equal(logs[1][0],'FOXYYA v12 live market coverage probe passed');
});

test('runtime startup probes fail closed when market coverage live validation fails',async()=>{
  await assert.rejects(()=>Entry.runStartupProbes({address:{port:4321}},{
    runLineageProbeImpl:async()=>({status:'PASSED'}),
    runCoverageProbeImpl:async()=>{throw Error('MARKET_COVERAGE_LIVE_PROBE_MARKETS_INVALID')},
    logImpl:()=>{}
  }),/MARKET_COVERAGE_LIVE_PROBE_MARKETS_INVALID/);
});
