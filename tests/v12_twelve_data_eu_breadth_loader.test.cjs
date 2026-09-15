'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createCredentialedSourceLoader}=require('../v12/staging/credentialed_source_loader.js');

const now=Date.parse('2026-09-15T08:45:00Z');
const endpoint='https://api.twelvedata.com/quote?symbol=AAA,BBB,CCC';
const payload=Object.freeze([
  Object.freeze({symbol:'AAA',close:'101',previous_close:'100',last_quote_at:String((now-3000)/1000)}),
  Object.freeze({symbol:'BBB',close:'99',previous_close:'100',last_quote_at:String((now-2000)/1000)}),
  Object.freeze({symbol:'CCC',close:'100',previous_close:'100',last_quote_at:String((now-1000)/1000)})
]);
function response(body,{status=200,contentType='application/json; charset=utf-8'}={}){return {ok:status>=200&&status<300,status,headers:{get(name){return String(name).toLowerCase()==='content-type'?contentType:null}},async json(){return body}};}

test('EU breadth loader with missing key performs zero network requests and never checks entitlement',async()=>{
  let calls=0,entitlementChecks=0;
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-eu-breadth',endpoint,fetchImpl:async()=>{calls++;return response(payload)},readSecret:()=>null,readEntitlement:()=>{entitlementChecks++;return true;},clock:()=>now});
  const result=await loader.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'CREDENTIAL_REQUIRED');
  assert.equal(calls,0);
  assert.equal(entitlementChecks,0);
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('EU breadth loader with key but missing entitlement performs zero network requests',async()=>{
  let calls=0,entitlementChecks=0;
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-eu-breadth',endpoint,fetchImpl:async()=>{calls++;return response(payload)},readSecret:()=> 'td-eu-secret',readEntitlement:()=>{entitlementChecks++;return false;},clock:()=>now});
  const result=await loader.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'ENTITLEMENT_REQUIRED');
  assert.equal(calls,0);
  assert.equal(entitlementChecks,1);
  assert.doesNotMatch(JSON.stringify(result),/td-eu-secret/);
});

test('EU breadth loader with key and entitlement fetches once with secret only in Authorization header',async()=>{
  const secret='td-eu-secret-never-return';
  const calls=[];
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-eu-breadth',endpoint,fetchImpl:async(url,init)=>{calls.push({url,init});return response(payload)},readSecret:()=>secret,readEntitlement:()=>true,clock:()=>now});
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

test('EU breadth loader without entitlement reader fails closed before network',async()=>{
  let calls=0;
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-eu-breadth',endpoint,fetchImpl:async()=>{calls++;return response(payload)},readSecret:()=> 'secret',clock:()=>now});
  const result=await loader.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'ENTITLEMENT_REQUIRED');
  assert.equal(calls,0);
});

test('EU breadth loader rejects wrong origins, unsupported paths and secrets in query parameters',()=>{
  const base={sourceId:'twelve-data-eu-breadth',fetchImpl:async()=>response(payload),readSecret:()=> 'secret',readEntitlement:()=>true};
  assert.throws(()=>createCredentialedSourceLoader({...base,endpoint:'https://example.com/quote?symbol=AAA'}),/SOURCE_ENDPOINT_FORBIDDEN/);
  assert.throws(()=>createCredentialedSourceLoader({...base,endpoint:'https://api.twelvedata.com/time_series?symbol=AAA'}),/SOURCE_ENDPOINT_FORBIDDEN/);
  assert.throws(()=>createCredentialedSourceLoader({...base,endpoint:'https://api.twelvedata.com/quote?symbol=AAA&apikey=secret'}),/SOURCE_SECRET_IN_URL_FORBIDDEN/);
});

test('EU breadth loader sanitizes transport failures even when error text contains the secret',async()=>{
  const secret='td-eu-leak-sentinel';
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-eu-breadth',endpoint,fetchImpl:async()=>{throw Error('socket '+secret)},readSecret:()=>secret,readEntitlement:()=>true,clock:()=>now});
  const result=await loader.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'FETCH_FAILED');
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
});
