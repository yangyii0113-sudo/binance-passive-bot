const test=require('node:test');
const assert=require('node:assert/strict');
const {buildContext}=require('../v12/intelligence/context_engine.js');

const region={region:'US',bias:'BULLISH',score:.4,confidence:.8,asOf:1000,evidence:[],contradictions:[],researchOnly:true};
const fact={text:'SOX breadth improved',source:'fixture',asOf:1000};
const expectation={text:'Consensus expects earnings growth',source:'fixture',asOf:1000};
const scenario={text:'If yields rise, growth assets may face pressure',source:'FOXYYA',asOf:1000,conditional:true};

test('context keeps facts expectations and scenarios separate',()=>{
  const c=buildContext({regionSnapshot:region,facts:[fact],expectations:[expectation],scenarios:[scenario],rotation:[],catalysts:[],risks:[],asOf:1100});
  assert.equal(c.facts[0].text,fact.text);
  assert.equal(c.expectations[0].text,expectation.text);
  assert.equal(c.scenarios[0].conditional,true);
  assert.equal(c.researchOnly,true);
});

test('unconditional scenario is rejected',()=>{
  assert.throws(()=>buildContext({regionSnapshot:region,facts:[],expectations:[],scenarios:[{...scenario,conditional:false}],rotation:[],catalysts:[],risks:[],asOf:1100}),/SCENARIO_CONDITIONAL_REQUIRED/);
});

test('context cannot contain execution authorization',()=>{
  const c=buildContext({regionSnapshot:region,facts:[],expectations:[],scenarios:[],rotation:[],catalysts:[],risks:[],asOf:1100});
  assert.equal('executionAllowed' in c,false);
});