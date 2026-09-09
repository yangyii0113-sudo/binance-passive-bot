const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluateSource,READINESS}=require('../v12/providers/activation_gate.js');

test('adopted public official source is ready without credentials',()=>{
  const r=evaluateSource('twse-openapi');
  assert.equal(r.readiness,READINESS.READY);
  assert.equal(r.canActivate,true);
});

test('KRX is blocked until credential and entitlement are both present',()=>{
  assert.equal(evaluateSource('krx-openapi').readiness,READINESS.CREDENTIAL_REQUIRED);
  assert.equal(evaluateSource('krx-openapi',{credentialSources:['krx-openapi']}).readiness,READINESS.ENTITLEMENT_REQUIRED);
  const ready=evaluateSource('krx-openapi',{credentialSources:['krx-openapi'],entitledSources:['krx-openapi']});
  assert.equal(ready.readiness,READINESS.READY);
  assert.equal(ready.canActivate,true);
});

test('J-Quants key alone does not imply plan entitlement',()=>{
  const r=evaluateSource('jpx-jquants',{credentialSources:['jpx-jquants']});
  assert.equal(r.readiness,READINESS.ENTITLEMENT_REQUIRED);
  assert.equal(r.canActivate,false);
});

test('review-required source cannot be activated by credential presence',()=>{
  const r=evaluateSource('hkex-marketplace',{credentialSources:['hkex-marketplace'],entitledSources:['hkex-marketplace']});
  assert.equal(r.readiness,READINESS.REVIEW_REQUIRED);
  assert.equal(r.canActivate,false);
});

test('decision-required source stays blocked until catalog decision is changed',()=>{
  const r=evaluateSource('us-equity-realtime',{credentialSources:['us-equity-realtime'],entitledSources:['us-equity-realtime']});
  assert.equal(r.readiness,READINESS.DECISION_REQUIRED);
  assert.equal(r.canActivate,false);
  assert.equal(r.liveEligible,false);
});

test('activation result never returns credential collections',()=>{
  const r=evaluateSource('krx-openapi',{credentialSources:['krx-openapi'],entitledSources:['krx-openapi']});
  assert.equal(Object.hasOwn(r,'credentialSources'),false);
  assert.equal(Object.hasOwn(r,'credentials'),false);
});

test('unknown source is explicit',()=>{
  const r=evaluateSource('missing-source');
  assert.equal(r.readiness,READINESS.SOURCE_UNKNOWN);
  assert.equal(r.canActivate,false);
});
