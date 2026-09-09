const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../v12/staging/read_client.js');

const asOf=Date.parse('2026-09-09T05:45:00Z');
const safeHome=Object.freeze({
  schemaVersion:'foxyya-home-read-model/1',asOf,researchOnly:true,executionWrite:false,
  home:Object.freeze({schemaVersion:'foxyya-home-model/1',asOf,regions:Object.freeze([]),marketPulse:Object.freeze([]),todayFocus:Object.freeze([]),earlyTrend:Object.freeze([]),opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([])}),events:Object.freeze([])})
});

function response(status,body){
  return {status,ok:status>=200&&status<300,headers:{get(name){return String(name).toLowerCase()==='content-type'?'application/json; charset=utf-8':null}},async json(){return body}};
}

test('client reads only the fixed same-origin v12 home endpoint',async()=>{
  const calls=[];
  const client=C.createHomeReadClient({fetchImpl:async(url,options)=>{calls.push({url,options});return response(200,safeHome)}});
  const result=await client.load();
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.data.schemaVersion,'foxyya-home-read-model/1');
  assert.deepEqual(calls.map(x=>x.url),['/v12/api/home']);
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.credentials,'same-origin');
  assert.equal(calls[0].options.cache,'no-store');
});

test('503 unavailable response stays unavailable and is never converted into empty market data',async()=>{
  const client=C.createHomeReadClient({fetchImpl:async()=>response(503,{status:'UNAVAILABLE',data:null})});
  const result=await client.load();
  assert.deepEqual(result,{status:'UNAVAILABLE',data:null});
});

test('client rejects wrong schema, writable snapshot, non-json response, and unexpected status',async()=>{
  await assert.rejects(()=>C.createHomeReadClient({fetchImpl:async()=>response(200,{...safeHome,schemaVersion:'other'})}).load(),/HOME_READ_MODEL_REQUIRED/);
  await assert.rejects(()=>C.createHomeReadClient({fetchImpl:async()=>response(200,{...safeHome,executionWrite:true})}).load(),/HOME_READ_ONLY_REQUIRED/);
  const nonJson={...response(200,safeHome),headers:{get(){return 'text/html'}}};
  await assert.rejects(()=>C.createHomeReadClient({fetchImpl:async()=>nonJson}).load(),/CONTENT_TYPE_INVALID/);
  await assert.rejects(()=>C.createHomeReadClient({fetchImpl:async()=>response(500,{status:'ERROR'})}).load(),/STAGING_READ_FAILED:500/);
});

test('client endpoint is fixed and has no write methods',()=>{
  assert.throws(()=>C.createHomeReadClient({fetchImpl:async()=>response(200,safeHome),endpoint:'/api/runtime'}),/STAGING_ENDPOINT_FORBIDDEN/);
  assert.throws(()=>C.createHomeReadClient({fetchImpl:async()=>response(200,safeHome),endpoint:'https://example.com/v12/api/home'}),/STAGING_ENDPOINT_FORBIDDEN/);
  const client=C.createHomeReadClient({fetchImpl:async()=>response(200,safeHome)});
  for(const forbidden of ['post','put','patch','delete','execute','placeOrder','submitOrder'])assert.equal(Object.hasOwn(client,forbidden),false);
});
