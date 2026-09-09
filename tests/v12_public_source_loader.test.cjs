const test=require('node:test');
const assert=require('node:assert/strict');
const {createPublicSourceLoader,PUBLIC_SOURCE_ORIGINS}=require('../v12/staging/public_source_loader.js');

function jsonResponse(body,{status=200,contentType='application/json; charset=utf-8'}={}){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get(name){return String(name).toLowerCase()==='content-type'?contentType:null}},
    async json(){return body}
  };
}

test('adopted TWSE public source fetches only approved HTTPS origin with GET and records receive time',async()=>{
  const calls=[];
  const loader=createPublicSourceLoader({
    sourceId:'twse-openapi',
    endpoint:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
    clock:()=>123456,
    fetchImpl:async(url,init)=>{calls.push({url,init});return jsonResponse([{Code:'2330'}])}
  });
  const result=await loader.load();
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.sourceId,'twse-openapi');
  assert.equal(result.receivedAt,123456);
  assert.deepEqual(result.data,[{Code:'2330'}]);
  assert.equal(result.executionWrite,false);
  assert.equal(result.researchOnly,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.redirect,'error');
});

test('decision-required and credential-required sources are blocked before network access',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return jsonResponse({})};
  const unresolved=createPublicSourceLoader({sourceId:'us-equity-realtime',endpoint:'https://example.invalid/quote',fetchImpl});
  const finra=createPublicSourceLoader({sourceId:'finra-research',endpoint:'https://api.finra.org/data/group/otcMarket/name/regShoDaily',fetchImpl});
  assert.equal((await unresolved.load()).reason,'DECISION_REQUIRED');
  assert.equal((await finra.load()).reason,'CREDENTIAL_REQUIRED');
  assert.equal(calls,0);
});

test('adopted source cannot fetch arbitrary host, http scheme, or credentials in URL',()=>{
  for(const endpoint of [
    'https://example.com/v1/exchangeReport/STOCK_DAY_ALL',
    'http://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
    'https://user:pass@openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
  ]){
    assert.throws(()=>createPublicSourceLoader({sourceId:'twse-openapi',endpoint,fetchImpl:async()=>jsonResponse({})}),/SOURCE_ENDPOINT_FORBIDDEN/);
  }
});

test('HTTP and content-type failures become explicit unavailable rather than empty data',async()=>{
  const httpFail=createPublicSourceLoader({sourceId:'bls-public',endpoint:'https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0',fetchImpl:async()=>jsonResponse({},{status:503})});
  const htmlFail=createPublicSourceLoader({sourceId:'sec-edgar',endpoint:'https://data.sec.gov/submissions/CIK0000320193.json',fetchImpl:async()=>jsonResponse({}, {contentType:'text/html'})});
  const a=await httpFail.load();
  const b=await htmlFail.load();
  assert.equal(a.status,'UNAVAILABLE');
  assert.equal(a.reason,'HTTP_503');
  assert.equal(a.data,null);
  assert.equal(b.status,'UNAVAILABLE');
  assert.equal(b.reason,'CONTENT_TYPE_INVALID');
  assert.equal(b.data,null);
});

test('network or JSON parse errors are unavailable and never throw fabricated market data',async()=>{
  const network=createPublicSourceLoader({sourceId:'ecb-data',endpoint:'https://data-api.ecb.europa.eu/service/data/EXR',fetchImpl:async()=>{throw Error('socket closed')}});
  const parse=createPublicSourceLoader({sourceId:'twse-openapi',endpoint:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',fetchImpl:async()=>({ok:true,status:200,headers:{get(){return 'application/json'}},async json(){throw Error('bad json')}})});
  assert.match((await network.load()).reason,/FETCH_FAILED/);
  assert.equal((await parse.load()).reason,'PARSE_FAILED');
});

test('public loader allowlist is explicit and loader surface exposes only load',()=>{
  assert.equal(PUBLIC_SOURCE_ORIGINS['twse-openapi'],'https://openapi.twse.com.tw');
  assert.equal(PUBLIC_SOURCE_ORIGINS['sec-edgar'],'https://data.sec.gov');
  const loader=createPublicSourceLoader({sourceId:'twse-openapi',endpoint:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',fetchImpl:async()=>jsonResponse([])});
  assert.deepEqual(Object.keys(loader),['load']);
  assert.doesNotMatch(JSON.stringify(Object.keys(loader)).toLowerCase(),/order|trade|execute|fill/);
});
