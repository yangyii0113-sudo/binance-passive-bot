'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
let Evidence;
try{Evidence=require('../v12/ui/lineage_evidence.js')}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error}
const ref='out_'+'a'.repeat(64),other='out_'+'b'.repeat(64);
function body(lineageRef=ref){return {schemaVersion:'foxyya-lineage-trace-read/1',status:'AVAILABLE',lineageRef,researchOnly:true,executionWrite:false,data:{output:{lineageRef,subjectId:'TWSE:2330',asOf:100,sourceLineageRefs:['src_x'],observationRefs:['obs_x']},sources:[{lineageRef:'src_x',sourceId:'twse-openapi',datasetId:'TWSE:STOCK_DAY_ALL',receivedAt:100}],observations:[{observationRef:'obs_x',sourceLineageRef:'src_x',observation:{field:'price.close',value:1215,unit:'TWD_PER_SHARE',source:'TWSE:STOCK_DAY_ALL',status:'SNAPSHOT',observedAt:90,receivedAt:100}}],researchOnly:true,executionWrite:false}}}
const response=(value,status=200)=>({ok:status===200,status,headers:{get:()=> 'application/json'},json:async()=>value});
function api(){assert.ok(Evidence,'evidence UI must provide the fixed read-only client');return Evidence}

test('clickable evidence client requests only the fixed GET trace path',async()=>{
  const calls=[];
  const client=api().createLineageReadClient({fetchImpl:async(url,init)=>{calls.push({url,init});return response(body())}});
  const result=await client.load(ref);
  assert.equal(result.status,'AVAILABLE');
  assert.equal(calls[0].url,'/v12/api/lineage/output/'+ref);
  assert.equal(calls[0].init.method,'GET');
  for(const bad of ['../health','https://evil.test',ref+'?url=x','out_short'])await assert.rejects(()=>client.load(bad),/INVALID_LINEAGE_REF/);
  assert.equal(calls.length,1);
});

test('evidence rejects writable or mismatched references and degrades HTTP failures honestly',async()=>{
  for(const value of [{...body(),executionWrite:true},body(other),{...body(),data:{...body().data,executionWrite:true}}]){
    const client=api().createLineageReadClient({fetchImpl:async()=>response(value)});
    await assert.rejects(()=>client.load(ref),/LINEAGE_TRACE_INVALID/);
  }
  const client=api().createLineageReadClient({fetchImpl:async()=>response({status:'NOT_FOUND'},404)});
  assert.equal((await client.load(ref)).status,'UNAVAILABLE');
});

test('trace renderer preserves source, dataset and original times and escapes untrusted evidence',()=>{
  const value=body();value.data.output.subjectId='<img src=x onerror=alert(1)>';
  const html=api().renderEvidence({status:'AVAILABLE',data:value});
  assert.match(html,/TWSE:STOCK_DAY_ALL/);
  assert.match(html,/1,215/);
  assert.match(html,/1970-01-01T00:00:00.090Z/);
  assert.match(html,/&lt;img/);
  assert.doesNotMatch(html,/<img/);
});

test('opening another evidence item prevents slower earlier results from replacing it',async()=>{
  const pending=new Map(),states=[];
  const controller=api().createEvidenceController({client:{load:key=>new Promise(resolve=>pending.set(key,resolve))},show:value=>states.push(value)});
  const first=controller.open(ref),second=controller.open(other);
  pending.get(other)({status:'AVAILABLE',data:body(other)});await second;
  pending.get(ref)({status:'AVAILABLE',data:body(ref)});await first;
  assert.equal(states.at(-1).data.lineageRef,other);
  assert.equal(states.filter(x=>x.status==='AVAILABLE').length,1);
});

test('closing evidence invalidates pending reads and errors become retryable unavailable state',async()=>{
  const states=[];let resolve;
  const c=api().createEvidenceController({client:{load:()=>new Promise(r=>resolve=r)},show:x=>states.push(x)});
  const pending=c.open(ref);c.close();resolve({status:'AVAILABLE',data:body()});await pending;
  assert.equal(states.filter(x=>x.status==='AVAILABLE').length,0);
  const failed=api().createEvidenceController({client:{load:async()=>{throw Error('network detail')}} ,show:x=>states.push(x)});
  await failed.open(ref);
  assert.equal(states.at(-1).status,'UNAVAILABLE');
  assert.equal(states.at(-1).lineageRef,ref);
  assert.doesNotMatch(JSON.stringify(states.at(-1)),/network detail/);
});

test('rendered evidence links open a dialog and populate it through the real client',async()=>{
  let click,close;
  const content={innerHTML:''};
  const dialog={open:false,showModal(){this.open=true},close(){this.open=false;close?.()},addEventListener(type,fn){if(type==='close')close=fn}};
  const doc={querySelector:s=>s==='#lineage-dialog'?dialog:s==='#lineage-content'?content:null,addEventListener(type,fn){if(type==='click')click=fn}};
  api().bindEvidence(doc,{fetchImpl:async()=>response(body())});
  assert.equal(typeof click,'function');
  await click({preventDefault(){},target:{closest(selector){return selector==='[data-lineage-ref]'?{dataset:{lineageRef:ref}}:null}}});
  assert.equal(dialog.open,true);
  assert.match(content.innerHTML,/TWSE:2330/);
  assert.match(content.innerHTML,/1,215/);
});
