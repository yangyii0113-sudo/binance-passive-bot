const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../v12/ui/home_view_model.js');

const asOf=Date.parse('2026-09-09T05:00:00Z');
const regions=['US','TW','CN_HK','JP','KR','EU','CRYPTO'];

function homeReadModel(){
  return Object.freeze({
    schemaVersion:'foxyya-home-read-model/1',asOf,researchOnly:true,executionWrite:false,
    home:Object.freeze({
      schemaVersion:'foxyya-home-model/1',asOf,
      regions:Object.freeze(regions.map((region,i)=>Object.freeze({region,bias:i===1?'BULLISH':'UNAVAILABLE',confidence:i===1?.72:0,status:i===1?'AVAILABLE':'AVAILABLE',asOf}))),
      marketPulse:Object.freeze([
        Object.freeze({market:'CRYPTO',status:'AVAILABLE',asOf,data:{btc:'AVAILABLE'}}),
        Object.freeze({market:'US',status:'UNAVAILABLE',asOf,data:null}),
        Object.freeze({market:'TW',status:'AVAILABLE',asOf,data:{taiex:24500}}),
      ]),
      todayFocus:Object.freeze([]),
      earlyTrend:Object.freeze([Object.freeze({market:'TW',instrumentId:'TWSE:2330',stage:'EARLY_WATCH',direction:'POSITIVE',confidence:.65,researchOnly:true,sourceLineage:['TWSE:T86']})]),
      opportunities:Object.freeze({
        CRYPTO:Object.freeze([Object.freeze({market:'CRYPTO',symbol:'ETHUSDT',side:'LONG',family:'A',status:'ARMED',executionReadOnly:true,executionWrite:false})]),
        US:Object.freeze([]),
        TW:Object.freeze([Object.freeze({market:'TW',instrumentId:'TWSE:2330',researchOnly:true,executionWrite:false,research:{direction:'POSITIVE'}})])
      }),
      events:Object.freeze([Object.freeze({id:'fed-1',title:'Fed statement',source:'FED',asOf:asOf-1000})])
    })
  });
}

test('home view model preserves seven regions and unavailable market data',()=>{
  const out=V.buildHomeViewModel(homeReadModel());
  assert.equal(out.schemaVersion,'foxyya-home-view-model/1');
  assert.deepEqual(out.regions.map(x=>x.region),regions);
  assert.equal(out.regions.find(x=>x.region==='KR').bias,'UNAVAILABLE');
  assert.equal(out.marketPulse.find(x=>x.market==='US').status,'UNAVAILABLE');
  assert.equal(out.marketPulse.find(x=>x.market==='US').stateLabel,'UNAVAILABLE');
  assert.equal(out.marketPulse.find(x=>x.market==='TW').stateLabel,'AVAILABLE');
});

test('home view model keeps research and crypto execution semantics visibly separate',()=>{
  const out=V.buildHomeViewModel(homeReadModel());
  assert.equal(out.earlyTrend[0].stateLabel,'EARLY WATCH');
  assert.equal(out.earlyTrend[0].mode,'RESEARCH');
  assert.equal(out.opportunities.CRYPTO[0].mode,'PAPER READ-ONLY');
  assert.equal(out.opportunities.CRYPTO[0].executionReadOnly,true);
  assert.equal(out.opportunities.TW[0].mode,'RESEARCH');
});

test('home view model rejects writable or wrong-schema inputs',()=>{
  const valid=homeReadModel();
  assert.throws(()=>V.buildHomeViewModel({...valid,executionWrite:true}),/HOME_READ_ONLY_REQUIRED/);
  assert.throws(()=>V.buildHomeViewModel({...valid,schemaVersion:'other'}),/HOME_READ_MODEL_REQUIRED/);
});

test('home view model exposes no order methods or buy sell commands',()=>{
  const out=V.buildHomeViewModel(homeReadModel());
  for(const forbidden of ['placeOrder','execute','submitOrder','authorizeExecution'])assert.equal(Object.hasOwn(out,forbidden),false);
  const text=JSON.stringify(out).toUpperCase();
  assert.equal(/\bBUY\b|\bSELL\b/.test(text),false);
});
