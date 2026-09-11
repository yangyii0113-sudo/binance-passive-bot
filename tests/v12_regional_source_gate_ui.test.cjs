'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const HomeDom=require('../v12/ui/home_dom.js');

test('regional source-gate copy explains legal activation blockers without claiming market direction',()=>{
  const gates=HomeDom.REGIONAL_SOURCE_GATES;
  assert.match(gates.JP,/J-Quants API V2/);
  assert.match(gates.JP,/API Key/);
  assert.match(gates.JP,/免費方案.*12 週延遲/);
  assert.match(gates.KR,/KRX Data Marketplace OPEN API/);
  assert.match(gates.KR,/會員.*API Key/);
  assert.match(gates.CN_HK,/HKEX Data Marketplace/);
  assert.match(gates.CN_HK,/付費授權/);
  assert.match(gates.CN_HK,/EOD/);
  assert.doesNotMatch(Object.values(gates).join(' '),/可判方向|偏多|偏空/);
});

test('Home DOM replaces only unavailable regional gap notes with source activation guidance',()=>{
  const nodes={};
  for(const region of ['JP','KR','CN_HK']){
    nodes[`[data-region="${region}"]`]={getAttribute(name){return name==='data-raw-status'?'UNAVAILABLE':null}};
    nodes[`[data-region="${region}"] .region-gap-note`]={textContent:''};
  }
  const doc={querySelector(selector){return nodes[selector]||null}};
  HomeDom.applyRegionalSourceGates(doc);
  assert.equal(nodes['[data-region="JP"] .region-gap-note'].textContent,HomeDom.REGIONAL_SOURCE_GATES.JP);
  assert.equal(nodes['[data-region="KR"] .region-gap-note'].textContent,HomeDom.REGIONAL_SOURCE_GATES.KR);
  assert.equal(nodes['[data-region="CN_HK"] .region-gap-note'].textContent,HomeDom.REGIONAL_SOURCE_GATES.CN_HK);
});
