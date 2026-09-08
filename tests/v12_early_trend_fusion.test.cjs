const test=require('node:test');
const assert=require('node:assert/strict');
const {fuseEvidence}=require('../v12/early_trend/fusion.js');

const e=(family,direction,confidence=1,status='LIVE',extra={})=>({family,direction,confidence,status,asOf:1000,source:'fixture',...extra});

test('five aligned independent families can reach READY research stage',()=>{
  const r=fuseEvidence([
    e('SMART_MONEY',.8),e('EXPECTATION',.7),e('BREADTH',.8),e('ROTATION',.7),e('VOLATILITY',.6)
  ],2000);
  assert.equal(r.stage,'READY');
  assert.equal(r.direction,'POSITIVE');
  assert.equal(r.evidenceFamilyCount,5);
  assert.equal(r.researchOnly,true);
});

test('two independent families remain EARLY_WATCH',()=>{
  const r=fuseEvidence([e('INSTITUTIONAL',.7),e('EXPECTATION',.6)],2000);
  assert.equal(r.stage,'EARLY_WATCH');
});

test('stale evidence does not advance stage',()=>{
  const r=fuseEvidence([e('INSTITUTIONAL',.7),e('EXPECTATION',.6),e('BREADTH',.9,1,'STALE')],2000);
  assert.equal(r.evidenceFamilyCount,2);
  assert.equal(r.stage,'EARLY_WATCH');
});

test('duplicate evidence family cannot inflate readiness',()=>{
  const r=fuseEvidence([e('SMART_MONEY',.8),e('SMART_MONEY',.9),e('EXPECTATION',.7)],2000);
  assert.equal(r.evidenceFamilyCount,2);
  assert.equal(r.stage,'EARLY_WATCH');
});

test('contradiction is surfaced and prevents false READY state',()=>{
  const r=fuseEvidence([
    e('SMART_MONEY',.8),e('EXPECTATION',.7),e('BREADTH',.8),e('ROTATION',.7),e('OPTIONS',-.8)
  ],2000);
  assert.equal(r.contradictions.length,1);
  assert.notEqual(r.stage,'READY');
});

test('empty evidence is DETECT and unavailable, not a trade direction',()=>{
  const r=fuseEvidence([],2000);
  assert.equal(r.stage,'DETECT');
  assert.equal(r.direction,'UNAVAILABLE');
  assert.equal(r.confidence,0);
});