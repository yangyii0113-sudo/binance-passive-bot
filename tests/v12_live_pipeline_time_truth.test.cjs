'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');

const startMs=Date.parse('2026-09-09T06:30:00Z');
const blsEndpoint='https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0';

function response(body){return {ok:true,status:200,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}}}
function blsPayload(){return {status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID:'CUUR0000SA0',data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:'326.5'}]}]}}}

test('live provider receive time may advance beyond invocation time without violating Context or lineage time truth',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-live-time-truth-'));
  const filePath=path.join(dir,'truth.lineage.jsonl');
  let now=startMs;
  const clock=()=>now;
  const fetchImpl=async(url)=>{
    assert.equal(url,blsEndpoint);
    now+=250;
    return response(blsPayload());
  };
  try{
    const lineageStore=createDurableSourceLineageStore({filePath,now:clock});
    const service=createStagingHomeService({lineageStore});
    const pipeline=createStagingSourcePipeline({fetchImpl,clock,lineageStore,publishHome:service.publishHome});
    const result=await pipeline.run({
      nowMs:startMs,
      regions:{US:{bls:[{endpoint:blsEndpoint,definitions:{CUUR0000SA0:{entityId:'MACRO:US:CPI',scope:'US',field:'inflation.cpi_index',unit:'INDEX'}}}]}}
    });

    const region=result.orchestration.published.home.regions.find(x=>x.region==='US');
    assert.equal(region.status,'AVAILABLE');
    assert.ok(result.orchestration.asOf>=now);
    assert.equal(result.asOf,result.orchestration.asOf);
    assert.ok(result.orchestration.published.asOf>=now);

    assert.match(region.lineageRef,/^out_[a-f0-9]{64}$/);
    const trace=lineageStore.traceOutput(region.lineageRef);
    assert.ok(trace);
    assert.ok(trace.sources.every(source=>source.receivedAt<=trace.output.asOf));
    assert.ok(trace.observations.every(item=>item.observation.receivedAt<=trace.output.asOf));
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
