const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../v12/ui/home_model.js');

test('home always covers seven regional contexts in fixed order',()=>{
  const h=H.buildHomeModel({asOf:1000});
  assert.deepEqual(h.regions.map(x=>x.region),['US','TW','CN_HK','JP','KR','EU','CRYPTO']);
});

test('home always exposes Crypto US and TW pulse together',()=>{
  const h=H.buildHomeModel({asOf:1000});
  assert.deepEqual(h.marketPulse.map(x=>x.market),['CRYPTO','US','TW']);
});

test('missing home data is unavailable rather than fabricated',()=>{
  const h=H.buildHomeModel({asOf:1000});
  assert.ok(h.regions.every(x=>x.status==='UNAVAILABLE'));
  assert.ok(h.marketPulse.every(x=>x.status==='UNAVAILABLE'));
  assert.deepEqual(h.earlyTrend,[]);
});

test('provided regional snapshot is preserved with source timing context',()=>{
  const h=H.buildHomeModel({asOf:1200,regions:{US:{region:'US',bias:'BULLISH',confidence:.8,asOf:1000,evidence:[],contradictions:[],researchOnly:true}}});
  assert.equal(h.regions[0].bias,'BULLISH');
  assert.equal(h.regions[0].asOf,1000);
});

test('provided regional snapshot with unavailable directional bias stays unavailable',()=>{
  const h=H.buildHomeModel({asOf:1200,regions:{US:{region:'US',bias:'UNAVAILABLE',score:null,confidence:0,asOf:1000,evidence:[],contradictions:[],researchOnly:true}}});
  assert.equal(h.regions[0].status,'UNAVAILABLE');
  assert.equal(h.regions[0].bias,'UNAVAILABLE');
});
