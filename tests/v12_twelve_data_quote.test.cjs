'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Quote=require('../v12/providers/twelve_data_quote_adapter.js');
const {createCredentialedSourceLoader}=require('../v12/staging/credentialed_source_loader.js');

const receivedAt=Date.parse('2026-09-14T14:00:00Z');
const observedAt=receivedAt-5000;
const instrument=Object.freeze({instrumentId:'NASDAQ:NVDA',symbol:'NVDA',exchange:'NASDAQ',market:'US',region:'US',assetType:'EQUITY',currency:'USD',timezone:'America/New_York'});
const payload=Object.freeze({symbol:'NVDA',name:'NVIDIA Corp',exchange:'NASDAQ',mic_code:'XNAS',currency:'USD',datetime:'2026-09-14 09:59:55',timestamp:Math.floor(observedAt/1000),last_quote_at:Math.floor(observedAt/1000),open:'180.10',high:'181.40',low:'179.80',close:'181.20',volume:'41238500',previous_close:'179.90',change:'1.30',percent_change:'0.72262',average_volume:'39000000',is_market_open:true});
function response(body,{status=200,contentType='application/json; charset=utf-8'}={}){return {ok:status>=200&&status<300,status,headers:{get(name){return String(name).toLowerCase()==='content-type'?contentType:null}},async json(){return body}};}

test('Twelve Data quote normalizes provider time and limited-venue scope without claiming NBBO',()=>{
  const result=Quote.normalizeQuote(payload,{instrument,receivedAt});
  assert.equal(result.schemaVersion,'foxyya-us-limited-quote/1');
  assert.equal(result.instrument.instrumentId,'NASDAQ:NVDA');
  assert.equal(result.observedAt,observedAt);
  assert.equal(result.receivedAt,receivedAt);
  assert.equal(result.exchange,'NASDAQ');
  assert.equal(result.micCode,'XNAS');
  assert.equal(result.marketScope,'LIMITED_US_VENUES');
  assert.equal(result.consolidated,false);
  assert.equal(result.nbbo,false);
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
  const facts=Object.fromEntries(result.observations.map(x=>[x.field,x]));
  assert.equal(facts['price.close'].value,181.2);
  assert.equal(facts['price.close'].unit,'USD_PER_SHARE');
  assert.equal(facts['volume.shares'].value,41238500);
  assert.equal(facts['price.change_pct'].value,0.72262);
  assert.ok(result.observations.every(x=>x.observedAt===observedAt&&x.receivedAt===receivedAt&&x.source===Quote.SOURCE));
});

test('Twelve Data quote fails closed on symbol mismatch, future provider time, or missing close',()=>{
  assert.throws(()=>Quote.normalizeQuote({...payload,symbol:'AAPL'},{instrument,receivedAt}),/QUOTE_SYMBOL_MISMATCH/);
  assert.throws(()=>Quote.normalizeQuote({...payload,last_quote_at:Math.floor((receivedAt+60_000)/1000)},{instrument,receivedAt}),/QUOTE_TIME_INVALID/);
  assert.throws(()=>Quote.normalizeQuote({...payload,close:null},{instrument,receivedAt}),/QUOTE_CLOSE_REQUIRED/);
});

test('credentialed loader with missing Twelve Data key performs zero network requests',async()=>{
  let calls=0;
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-us-quote',endpoint:'https://api.twelvedata.com/quote?symbol=NVDA',fetchImpl:async()=>{calls++;return response(payload)},readSecret:()=>null,clock:()=>receivedAt});
  const result=await loader.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'CREDENTIAL_REQUIRED');
  assert.equal(calls,0);
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('credentialed loader sends secret only in Authorization header and never returns it',async()=>{
  const secret='td-secret-never-return';
  const calls=[];
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-us-quote',endpoint:'https://api.twelvedata.com/quote?symbol=NVDA',fetchImpl:async(url,init)=>{calls.push({url,init});return response(payload)},readSecret:()=>secret,clock:()=>receivedAt});
  const result=await loader.load();
  assert.equal(result.status,'AVAILABLE');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.twelvedata.com/quote?symbol=NVDA');
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.redirect,'error');
  assert.equal(calls[0].init.headers.Accept,'application/json');
  assert.equal(calls[0].init.headers.Authorization,`apikey ${secret}`);
  assert.doesNotMatch(calls[0].url,new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
  assert.deepEqual(result.data,payload);
});

test('credentialed loader rejects wrong origins, URL credentials, and API keys in query parameters',()=>{
  const base={sourceId:'twelve-data-us-quote',fetchImpl:async()=>response(payload),readSecret:()=> 'secret'};
  assert.throws(()=>createCredentialedSourceLoader({...base,endpoint:'https://example.com/quote?symbol=NVDA'}),/SOURCE_ENDPOINT_FORBIDDEN/);
  assert.throws(()=>createCredentialedSourceLoader({...base,endpoint:'https://user:pass@api.twelvedata.com/quote?symbol=NVDA'}),/SOURCE_ENDPOINT_FORBIDDEN/);
  assert.throws(()=>createCredentialedSourceLoader({...base,endpoint:'https://api.twelvedata.com/quote?symbol=NVDA&apikey=secret'}),/SOURCE_SECRET_IN_URL_FORBIDDEN/);
});

test('credentialed loader sanitizes transport failures even when provider error text contains the secret',async()=>{
  const secret='td-leak-sentinel';
  const loader=createCredentialedSourceLoader({sourceId:'twelve-data-us-quote',endpoint:'https://api.twelvedata.com/quote?symbol=NVDA',fetchImpl:async()=>{throw Error('socket '+secret)},readSecret:()=>secret,clock:()=>receivedAt});
  const result=await loader.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'FETCH_FAILED');
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
});
