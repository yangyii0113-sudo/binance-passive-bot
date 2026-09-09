const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../v12/early_trend/fusion.js');
const e=(kind,direction,{confidence=1,status='SNAPSHOT',asOf=1000,basisCount=1}={})=>({family:'INSTITUTIONAL',kind,direction,confidence,status,asOf,source:'official',basisCount});
test('Fusion prefers deeper same-family evidence when data-quality weight ties',()=>{const out=F.fuseEvidence([e('DAILY_FLOW',0.9,{basisCount:1}),e('PERSISTENCE',0.4,{basisCount:3})],2000);assert.equal(out.evidenceFamilyCount,1);assert.equal(out.score,0.4);assert.equal(out.supportingEvidence[0].kind,'PERSISTENCE');});
test('higher quality still beats deeper evidence',()=>{const out=F.fuseEvidence([e('DAILY_FLOW',0.8,{confidence:1,status:'LIVE',basisCount:1}),e('PERSISTENCE',0.4,{confidence:1,status:'SNAPSHOT',basisCount:5})],2000);assert.equal(out.score,0.8);assert.equal(out.supportingEvidence[0].kind,'DAILY_FLOW');});
test('same quality and depth uses newer knowledge time deterministically',()=>{const out=F.fuseEvidence([e('OLDER',0.2,{basisCount:2,asOf:1000}),e('NEWER',0.5,{basisCount:2,asOf:1500})],2000);assert.equal(out.score,0.5);assert.equal(out.supportingEvidence[0].kind,'NEWER');});
