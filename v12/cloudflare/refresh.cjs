'use strict';
const {buildBootstrapInput}=require('../staging/live_research_bootstrap.js');
const {createStagingSourcePipeline}=require('../staging/source_pipeline.js');
const {createHomeSnapshotPublisher}=require('../staging/home_publisher.js');
const {createHomeSnapshotStore}=require('../staging/read_api.js');
const {createCycleLineage}=require('./lineage.cjs');
const {createArchive}=require('./archive.cjs');
const REFRESH_MS=7200000;
const HOSTS=new Set(['www.twse.com.tw','www.tpex.org.tw','api.bls.gov','publicreporting.cftc.gov']);
function createBoundedFetch(fetchImpl,{maxBytes=512*1024,maxRequests=8}={}){
 const cache=new Map();let requests=0;
 return async function read(input,init={}){
  const url=new URL(input);
  if(url.protocol!=='https:'||url.port||url.username||url.password||!HOSTS.has(url.hostname))throw Error('SOURCE_FORBIDDEN');
  if(init.method&&init.method!=='GET')throw Error('READ_ONLY');
  if(!cache.has(url.href)){
   if(++requests>maxRequests)throw Error('REQUEST_BUDGET_EXCEEDED');
   cache.set(url.href,(async()=>{
    const signal=AbortSignal.timeout(8000);
    const response=await fetchImpl(url.href,{...init,method:'GET',redirect:'error',signal});
    const reader=response.body?.getReader(),chunks=[];let length=0;
    if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes)throw Error('RESPONSE_TOO_LARGE');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
    const body=new Uint8Array(length);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.byteLength}
    return {body,status:response.status,headers:[...response.headers]};
   })());
  }
  const result=await cache.get(url.href);return new Response(result.body,{status:result.status,headers:result.headers});
 };
}
async function runRefresh(env,{now=Date.now,fetchImpl=globalThis.fetch}={}){
 const start=now(),db=env.DB;if(!db)throw Error('D1_BINDING_REQUIRED');
 const claim=await db.prepare('UPDATE control SET lease_until=?,last_started=? WHERE id=1 AND lease_until<? AND (last_started=0 OR last_started<=?)').bind(start+300000,start,start,start-REFRESH_MS).run();
 if(claim.meta.changes!==1)return {status:'SKIPPED'};
 try{
  const lineage=createCycleLineage(),store=createHomeSnapshotStore();
  const publisher=createHomeSnapshotPublisher({homeStore:store});
  const pipeline=createStagingSourcePipeline({fetchImpl:createBoundedFetch(fetchImpl),clock:now,lineageStore:lineage,publishHome:publisher.publish});
  const base=buildBootstrapInput(start);
  // Regional official summaries only. Company-wide arrays and Execution V2 are
  // intentionally not fetched on the free-plan profile. Coverage stays authoritative.
  await pipeline.run({...base,twAssets:[],usAssets:[],crypto:undefined});
  const home={...store.read(),hosting:{mode:'CLOUDFLARE_LOW_USAGE',refreshSeconds:7200,profile:'REGIONAL_PUBLIC_ONLY',productionConnected:false}};
  if(!store.read())throw Error('SNAPSHOT_UNAVAILABLE');
  await createArchive(db).publish(home,lineage.records(),now());
  return {status:'PUBLISHED',asOf:home.asOf};
 }catch(error){
  await db.prepare('UPDATE control SET last_error=? WHERE id=1').bind('RESEARCH_REFRESH_FAILED').run();
  throw error;
 }finally{await db.prepare('UPDATE control SET lease_until=0 WHERE id=1 AND last_started=?').bind(start).run()}
}
module.exports={runRefresh,createBoundedFetch,REFRESH_MS};
