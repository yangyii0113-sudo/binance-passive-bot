'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createCredentialedSourceLoader}=require('../v12/staging/credentialed_source_loader.js');

const now=Date.parse('2026-09-15T02:00:00Z');
const endpoint='https://api.twelvedata.com/quote?symbol=VIX';
const payload=Object.freeze({symbol:'VIX',close:'17.84',timestamp:Math.floor((now-5000)/1000)});
function response(body,{status=200,contentType='application/json; charset=utf-8'}={}){return {ok:status>=200&&status<300,status,headers:{get(name){return String(name).toLowerCase()==='content-type'?contentType:null}},async json(){return body}};}

test('volatility loader with missing key performs zero network requests and never checks entitlement',async()=>{
  let calls=0,entitlementChecks=0;
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-us-volatility',endpoint,fetchImpl:async()=>{calls++;return response(payload)},readSecret:()=>null,readEntitlement:()=>{entitlementChecks++;return true;},clock:()=>now});
  const result=await loader.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'CREDENTIAL_REQUIRED');
  assert.equal(calls,0);
  assert.equal(entitlementChecks,0);
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('volatility loader with key but missing entitlement performs zero network requests',async()=>{
  let calls=0,entitlementChecks=0;
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-us-volatility',endpoint,fetchImpl:async()=>{calls++;return response(payload)},readSecret:()=> 'td-secret',readEntitlement:()=>{entitlementChecks++;return false;},clock:()=>now});
  const result=await loader.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'ENTITLEMENT_REQUIRED');
  assert.equal(calls,0);
  assert.equal(entitlementChecks,1);
  assert.doesNotMatch(JSON.stringify(result),/td-secret/);
});

test('volatility loader with key and entitlement fetches once with secret only in Authorization header',async()=>{
  const secret='td-vol-secret-never-return';
  const calls=[];
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-us-volatility',endpoint,fetchImpl:async(url,init)=>{calls.push({url,init});return response(payload)},readSecret:()=>secret,readEntitlement:()=>true,clock:()=>now});
  const result=await loader.load();
  assert.equal(result.status,'AVAILABLE');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,endpoint);
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.redirect,'error');
  assert.equal(calls[0].init.headers.Authorization,`apikey ${secret}`);
  assert.doesNotMatch(calls[0].url,new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
  assert.deepEqual(result.data,payload);
});

test('volatility loader without an entitlement reader fails closed before network',async()=>{
  let calls=0;
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-us-volatility',endpoint,fetchImpl:async()=>{calls++;return response(payload)},readSecret:()=> 'secret',clock:()=>now});
  const result=await loader.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'ENTITLEMENT_REQUIRED');
  assert.equal(calls,0);
});

test('volatility loader rejects wrong origins and secrets in query parameters',()=>{
  const base={sourceId:'twelve-data-us-volatility',fetchImpl:async()=>response(payload),readSecret:()=> 'secret',readEntitlement:()=>true};
  assert.throws(()=>createCredentialedSourceLoader({...base,endpoint:'https://example.com/quote?symbol=VIX'}),/SOURCE_ENDPOINT_FORBIDDEN/);
  assert.throws(()=>createCredentialedSourceLoader({...base,endpoint:'https://api.twelvedata.com/quote?symbol=VIX&apikey=secret'}),/SOURCE_SECRET_IN_URL_FORBIDDEN/);
});

test('volatility loader sanitizes provider transport failures even when error text contains the secret',async()=>{
  const secret='td-vol-leak-sentinel';
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-us-volatility',endpoint,fetchImpl:async()=>{throw Error('socket '+secret)},readSecret:()=>secret,readEntitlement:()=>true,clock:()=>now});
  const result=await loader.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'FETCH_FAILED');
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
});
