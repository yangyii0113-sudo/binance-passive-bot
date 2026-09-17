'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const {buildHomeReadModel}=require('../v12/read_model/home_snapshot.js');
const {createArchive}=require('../v12/cloudflare/archive.cjs');
const {createCycleLineage}=require('../v12/cloudflare/lineage.cjs');
const {createBoundedFetch,runRefresh}=require('../v12/cloudflare/refresh.cjs');
const {handleRequest}=require('../v12/cloudflare/http.cjs');
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('v12/cloudflare/schema.sql','utf8'));
 const wrap=(query,args=[])=>({bind(...a){return wrap(query,a)},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:sql.prepare(query).run(...args).changes}}},query,args});
 return {prepare:wrap,async batch(stmts){sql.exec('BEGIN');try{const out=stmts.map(s=>({meta:{changes:sql.prepare(s.query).run(...s.args).changes}}));sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}},sql};
}
const now=Date.parse('2026-09-16T08:00:00Z');
const snapshot=()=>buildHomeReadModel({asOf:now});
const request=(path,method='GET',password='test-password')=>new Request('https://unit.test'+path,{method,headers:{Authorization:'Basic '+btoa('owen:'+password)}});
test('archive survives a new reader and rejects backward time and write failures',async()=>{
 const db=database(),a=createArchive(db);await a.publish(snapshot(),[],now);
 assert.equal((await createArchive(db).latest()).asOf,now);
 await assert.rejects(a.publish(buildHomeReadModel({asOf:now-1}),[],now),/TIME_REGRESSION/);
 const broken={...db,batch:async()=>{throw Error('disk full')}};
 await assert.rejects(createArchive(broken).publish(buildHomeReadModel({asOf:now+1}),[],now+1),/disk full/);
 assert.equal((await a.latest()).asOf,now);
});
test('storage budget halts before deleting or changing current snapshot',async()=>{
 const db=database();await createArchive(db).publish(snapshot(),[],now);
 await assert.rejects(createArchive(db,{maxBytes:1}).publish(buildHomeReadModel({asOf:now+1}),[],now+1),/STORAGE_BUDGET/);
 assert.equal((await createArchive(db).latest()).asOf,now);
});
test('private API rejects missing/wrong auth, all writes, and stale readiness',async()=>{
 const db=database(),env={DB:db,VIEWER_PASSWORD:'test-password'};
 await createArchive(db).publish(snapshot(),[],now);
 assert.equal((await handleRequest(new Request('https://unit.test/v12/api/home'),env,{now:()=>now})).status,401);
 assert.equal((await handleRequest(request('/v12/api/home','GET','wrong'),env,{now:()=>now})).status,401);
 assert.equal((await handleRequest(request('/v12/api/home','POST'),env,{now:()=>now})).status,405);
 assert.equal((await handleRequest(request('/ready'),env,{now:()=>now+14400001})).status,503);
 const res=await handleRequest(request('/v12/api/home'),env,{now:()=>now});assert.equal(res.status,200);assert.equal((await res.json()).executionWrite,false);
 assert.equal((await handleRequest(request('/v12/api/home'),{DB:db},{now:()=>now})).status,503);
});
test('bounded fetch rejects unknown hosts and oversized bodies and caches duplicates',async()=>{
 let calls=0;const fetcher=createBoundedFetch(async()=>{calls++;return new Response('{"ok":true}',{headers:{'content-type':'application/json'}})});
 await assert.rejects(fetcher('https://foxyya-paper-engine-production.up.railway.app/api/runtime/status'),/SOURCE_FORBIDDEN/);
 await assert.rejects(fetcher('https://api.bls.gov/x',{method:'POST'}),/READ_ONLY/);
 await fetcher('https://api.bls.gov/x');await fetcher('https://api.bls.gov/x');assert.equal(calls,1);
 const big=createBoundedFetch(async()=>new Response('x'.repeat(30)),{maxBytes:20});
 await assert.rejects(big('https://api.bls.gov/x'),/RESPONSE_TOO_LARGE/);
});
test('two hour schedule deduplicates and records honest unavailable coverage',async()=>{
 const db=database();let calls=0;
 const fetchImpl=async()=>{calls++;return new Response('{}',{status:503,headers:{'content-type':'application/json'}})};
 const a=await runRefresh({DB:db},{now:()=>now,fetchImpl});assert.equal(a.status,'PUBLISHED');
 const home=await createArchive(db).latest();assert.deepEqual(Object.keys(home.marketCoverage.markets),['CRYPTO','US','TW']);assert.equal(home.executionWrite,false);
 const first=calls;assert.ok(first>0&&first<=8);
 assert.equal((await runRefresh({DB:db},{now:()=>now+1000,fetchImpl})).status,'SKIPPED');assert.equal(calls,first);
});
test('lineage rejects unknown output references instead of manufacturing evidence',()=>{
 const store=createCycleLineage();assert.equal(store.traceOutput('out_'+'a'.repeat(64)),null);
 assert.throws(()=>store.recordSource({}),/SOURCE_LINEAGE_INVALID/);
});
test('available official fixture persists canonical evidence retrievable after restart',async()=>{
 const db=database();
 const fetchImpl=async(url)=>{
  if(!url.startsWith('https://api.bls.gov/'))return new Response('{}',{status:503,headers:{'content-type':'application/json'}});
  const seriesID=new URL(url).pathname.split('/').at(-1);
  return new Response(JSON.stringify({status:'REQUEST_SUCCEEDED',Results:{series:[{seriesID,data:[{year:'2026',period:'M08',latest:'true',value:'4.2'}]}]}}),{headers:{'content-type':'application/json'}});
 };
 await runRefresh({DB:db},{now:()=>now,fetchImpl});
 const archive=createArchive(db),row=await archive.latestRow(),records=JSON.parse(row.records);
 const output=records.find(r=>r.schemaVersion==='foxyya-research-output-lineage/1');assert.ok(output);
 const trace=await createArchive(db).trace(output.lineageRef);assert.ok(trace.sources.length);assert.ok(trace.observations.length);assert.equal(trace.executionWrite,false);
 const response=await handleRequest(request('/v12/api/lineage/output/'+output.lineageRef),{DB:db,VIEWER_PASSWORD:'test-password'},{now:()=>now});
 assert.equal(response.status,200);assert.equal((await response.json()).data.output.lineageRef,output.lineageRef);
});
