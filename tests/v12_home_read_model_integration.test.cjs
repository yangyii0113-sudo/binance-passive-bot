const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../v12/read_model/home_snapshot.js');

const asOf=Date.parse('2026-09-09T03:20:00Z');
const twAsset=Object.freeze({
  schemaVersion:'foxyya-tw-asset-read-model/1',market:'TW',instrumentId:'TWSE:2330',asOf:asOf-1000,
  earlyTrend:Object.freeze({stage:'EARLY_WATCH',direction:'POSITIVE',confidence:.45,score:.7,asOf:asOf-1000,researchOnly:true}),
  research:Object.freeze({market:'TW',instrumentId:'TWSE:2330',direction:'POSITIVE',confidence:.2,researchOnly:true,asOf:asOf-1000}),
  sourceLineage:Object.freeze(['TWSE:T86','TWSE:STOCK_DAY_ALL','TWSE:t187ap05_L']),researchOnly:true,executionWrite:false
});
const cryptoExecution=Object.freeze({
  schema:'foxyya-v12-crypto-execution-read/1',paperOnly:true,realOrderLock:true,readOnly:true,asOf:asOf-500,
  candidates:Object.freeze([{symbol:'ETHUSDT',side:'LONG',family:'A',status:'ARMED'}]),pending:Object.freeze([]),openPositions:Object.freeze([]),closedTrades:Object.freeze([])
});

test('home read model merges seven regional contexts, TW early trend, and read-only Crypto opportunities',()=>{
  const out=H.buildHomeReadModel({
    asOf,
    regionEvidence:{
      TW:[{family:'BREADTH',direction:.6,confidence:.8,status:'SNAPSHOT',asOf:asOf-2000,source:'TWSE:breadth'}],
      US:[{family:'MACRO',direction:-.25,confidence:.7,status:'SNAPSHOT',asOf:asOf-3000,source:'BLS+FED'}]
    },
    pulses:{TW:{data:{taiex:null},source:'TWSE',asOf:asOf-1000}},
    twAssets:[twAsset],usAssets:[],cryptoExecution,
    events:[{id:'fed-event',title:'Fed statement',source:'FED',asOf:asOf-4000}]
  });
  assert.equal(out.schemaVersion,'foxyya-home-read-model/1');
  assert.equal(out.researchOnly,true);
  assert.equal(out.executionWrite,false);
  assert.equal(out.home.regions.length,7);
  assert.equal(out.home.regions.find(x=>x.region==='TW').status,'AVAILABLE');
  assert.equal(out.home.regions.find(x=>x.region==='KR').status,'UNAVAILABLE');
  assert.equal(out.home.regions.find(x=>x.region==='KR').bias,'UNAVAILABLE');
  assert.equal(out.home.marketPulse.find(x=>x.market==='US').status,'UNAVAILABLE');
  assert.equal(out.home.earlyTrend.length,1);
  assert.equal(out.home.earlyTrend[0].instrumentId,'TWSE:2330');
  assert.equal(out.home.opportunities.TW.length,1);
  assert.equal(out.home.opportunities.CRYPTO.length,1);
  assert.equal(out.home.opportunities.US.length,0);
  assert.equal(out.home.opportunities.CRYPTO[0].executionReadOnly,true);
  assert.equal(out.home.events.length,1);
  for(const forbidden of ['placeOrder','execute','executionAllowed'])assert.equal(Object.hasOwn(out,forbidden),false);
});

test('home read model rejects a writable Crypto execution surface',()=>{
  assert.throws(()=>H.buildHomeReadModel({asOf,regionEvidence:{},twAssets:[],usAssets:[],cryptoExecution:{...cryptoExecution,readOnly:false}}),/CRYPTO_READ_ONLY_REQUIRED/);
});
