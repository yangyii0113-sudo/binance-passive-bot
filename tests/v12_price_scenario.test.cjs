const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPriceScenarios}=require('../v12/research/price_scenario.js');
const scenario=(low,high,condition,invalidation)=>({conditions:[condition],zone:{low,high},invalidation,volatilityContext:'ATR normal',catalystContext:'earnings in 10d',provenance:'fixture',asOf:1000});

test('price scenario requires bull base and bear conditional cases',()=>{
  const r=buildPriceScenarios({instrumentId:'NASDAQ:NVDA',market:'US',asOf:1000,bull:scenario(190,205,'close above 190','close below 184'),base:scenario(180,190,'remain in range','close outside range'),bear:scenario(165,180,'close below 180','recover above 190')});
  assert.deepEqual(Object.keys(r.scenarios),['BULL_CASE','BASE_CASE','BEAR_CASE']);
  assert.equal(r.researchOnly,true);
});

test('unconditional target is rejected',()=>{
  assert.throws(()=>buildPriceScenarios({instrumentId:'NASDAQ:NVDA',market:'US',asOf:1000,bull:{...scenario(190,205,'x','y'),target:220},base:scenario(180,190,'x','y'),bear:scenario(165,180,'x','y')}),/UNCONDITIONAL_TARGET_FORBIDDEN/);
});

test('scenario without invalidation is rejected',()=>{
  assert.throws(()=>buildPriceScenarios({instrumentId:'TWSE:2330',market:'TW',asOf:1000,bull:scenario(1400,1500,'x',''),base:scenario(1300,1400,'x','y'),bear:scenario(1200,1300,'x','y')}),/INVALIDATION_REQUIRED/);
});