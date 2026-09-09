const test=require('node:test');
const assert=require('node:assert/strict');
const Regional=require('../v12/read_model/regional_context_snapshot.js');
const Home=require('../v12/read_model/home_snapshot.js');

const asOf=Date.parse('2026-09-09T04:30:00Z');

function twRegional(){
  return Regional.buildRegionalContextSnapshot({
    region:'TW',nowMs:asOf,observations:[],events:[],
    evidence:[
      {family:'BREADTH',direction:.7,confidence:.9,status:'SNAPSHOT',asOf:asOf-1000,source:'TWSE:BREADTH'},
      {family:'FLOW',direction:.6,confidence:.8,status:'SNAPSHOT',asOf:asOf-2000,source:'TWSE:FLOW'},
      {family:'MOMENTUM',direction:.5,confidence:.7,status:'SNAPSHOT',asOf:asOf-3000,source:'TWSE:MOMENTUM'}
    ]
  });
}

test('home uses validated regional read model instead of recalculating from raw evidence',()=>{
  const regional=twRegional();
  const out=Home.buildHomeReadModel({
    asOf,
    regionalContexts:{TW:regional},
    regionEvidence:{TW:[{family:'RISK',direction:-1,confidence:1,status:'SNAPSHOT',asOf:asOf-100,source:'conflicting-raw'}]},
    twAssets:[],usAssets:[]
  });
  const tw=out.home.regions.find(x=>x.region==='TW');
  assert.equal(tw.bias,regional.regionalSnapshot.bias);
  assert.equal(tw.score,regional.regionalSnapshot.score);
  assert.equal(tw.status,'AVAILABLE');
});

test('home rejects writable or cross-region regional read models',()=>{
  const regional=twRegional();
  assert.throws(()=>Home.buildHomeReadModel({asOf,regionalContexts:{TW:{...regional,executionWrite:true}},twAssets:[],usAssets:[]}),/REGIONAL_READ_ONLY_REQUIRED/);
  assert.throws(()=>Home.buildHomeReadModel({asOf,regionalContexts:{US:regional},twAssets:[],usAssets:[]}),/REGION_CONTEXT_MISMATCH/);
});
