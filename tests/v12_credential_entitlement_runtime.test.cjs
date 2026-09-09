const test=require('node:test');
const assert=require('node:assert/strict');
const Access=require('../v12/providers/credential_entitlement_runtime.js');
const Providers=require('../v12/providers/index.js');

function runtime({secrets={},entitlements={},secretError=null,entitlementError=null}={}){
  const calls={secret:[],entitlement:[]};
  const value=Access.createCredentialEntitlementRuntime({
    readSecret(sourceId){
      calls.secret.push(sourceId);
      if(secretError)throw secretError;
      return Object.hasOwn(secrets,sourceId)?secrets[sourceId]:null;
    },
    readEntitlement(sourceId){
      calls.entitlement.push(sourceId);
      if(entitlementError)throw entitlementError;
      return Object.hasOwn(entitlements,sourceId)?entitlements[sourceId]:null;
    }
  });
  return {runtime:value,calls};
}

test('credential entitlement vocabularies are explicit and stable',()=>{
  assert.deepEqual(Access.CREDENTIAL_STATES,['NOT_REQUIRED','MISSING','PRESENT','UNKNOWN']);
  assert.deepEqual(Access.ENTITLEMENT_STATES,['NOT_REQUIRED','UNKNOWN','ENTITLED','NOT_ENTITLED']);
  assert.deepEqual(Access.ACCESS_STATES,['READY','BLOCKED','UNAVAILABLE']);
});

test('adopted public source is ready without reading any secret or entitlement',()=>{
  const h=runtime({secretError:new Error('must-not-read'),entitlementError:new Error('must-not-read')});
  const result=h.runtime.evaluate('twse-openapi');
  assert.equal(result.access,'READY');
  assert.equal(result.credential.state,'NOT_REQUIRED');
  assert.equal(result.entitlement.state,'NOT_REQUIRED');
  assert.equal(result.activation.canActivate,true);
  assert.deepEqual(h.calls,{secret:[],entitlement:[]});
});

test('KRX missing credential is blocked before entitlement check',()=>{
  const h=runtime();
  const result=h.runtime.evaluate('krx-openapi');
  assert.equal(result.access,'BLOCKED');
  assert.equal(result.reason,'CREDENTIAL_MISSING');
  assert.equal(result.credential.state,'MISSING');
  assert.equal(result.entitlement.state,'UNKNOWN');
  assert.equal(result.activation.readiness,'CREDENTIAL_REQUIRED');
  assert.equal(result.activation.canActivate,false);
  assert.deepEqual(h.calls.secret,['krx-openapi']);
  assert.deepEqual(h.calls.entitlement,[]);
});

test('credential presence does not imply KRX entitlement and unknown entitlement is unavailable',()=>{
  const secret='krx-super-secret-value';
  const h=runtime({secrets:{'krx-openapi':secret}});
  const result=h.runtime.evaluate('krx-openapi');
  assert.equal(result.access,'UNAVAILABLE');
  assert.equal(result.reason,'ENTITLEMENT_UNKNOWN');
  assert.equal(result.credential.state,'PRESENT');
  assert.equal(result.entitlement.state,'UNKNOWN');
  assert.equal(result.activation.canActivate,false);
  assert.deepEqual(h.calls.entitlement,['krx-openapi']);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
});

test('explicit KRX non-entitlement remains blocked even with valid credential presence',()=>{
  const h=runtime({secrets:{'krx-openapi':'secret'},entitlements:{'krx-openapi':false}});
  const result=h.runtime.evaluate('krx-openapi');
  assert.equal(result.access,'BLOCKED');
  assert.equal(result.reason,'ENTITLEMENT_NOT_GRANTED');
  assert.equal(result.credential.state,'PRESENT');
  assert.equal(result.entitlement.state,'NOT_ENTITLED');
  assert.equal(result.activation.readiness,'ENTITLEMENT_REQUIRED');
  assert.equal(result.activation.canActivate,false);
});

test('KRX is ready only when credential and entitlement are independently satisfied',()=>{
  const secret='krx-secret-never-return-me';
  const h=runtime({secrets:{'krx-openapi':secret},entitlements:{'krx-openapi':true}});
  const result=h.runtime.evaluate('krx-openapi');
  assert.equal(result.access,'READY');
  assert.equal(result.reason,'READY');
  assert.equal(result.credential.state,'PRESENT');
  assert.equal(result.entitlement.state,'ENTITLED');
  assert.equal(result.activation.readiness,'READY');
  assert.equal(result.activation.canActivate,true);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
});

test('J-Quants API key alone never implies plan entitlement',()=>{
  const h=runtime({secrets:{'jpx-jquants':'jquants-secret'}});
  const result=h.runtime.evaluate('jpx-jquants');
  assert.equal(result.access,'UNAVAILABLE');
  assert.equal(result.credential.state,'PRESENT');
  assert.equal(result.entitlement.state,'UNKNOWN');
  assert.equal(result.activation.canActivate,false);
});

test('FINRA credentialed public source requires credential but not entitlement',()=>{
  const missing=runtime().runtime.evaluate('finra-research');
  assert.equal(missing.access,'BLOCKED');
  assert.equal(missing.reason,'CREDENTIAL_MISSING');
  const h=runtime({secrets:{'finra-research':'finra-secret'}});
  const ready=h.runtime.evaluate('finra-research');
  assert.equal(ready.access,'READY');
  assert.equal(ready.credential.state,'PRESENT');
  assert.equal(ready.entitlement.state,'NOT_REQUIRED');
  assert.equal(ready.activation.canActivate,true);
  assert.deepEqual(h.calls.entitlement,[]);
});

test('review and decision required sources stay blocked before any credential or entitlement lookup',()=>{
  const h=runtime({secrets:{'hkex-marketplace':'secret','us-equity-realtime':'secret'},entitlements:{'hkex-marketplace':true,'us-equity-realtime':true}});
  const review=h.runtime.evaluate('hkex-marketplace');
  const decision=h.runtime.evaluate('us-equity-realtime');
  assert.equal(review.access,'BLOCKED');
  assert.equal(review.reason,'SOURCE_REVIEW_REQUIRED');
  assert.equal(review.activation.readiness,'REVIEW_REQUIRED');
  assert.equal(decision.access,'BLOCKED');
  assert.equal(decision.reason,'SOURCE_DECISION_REQUIRED');
  assert.equal(decision.activation.readiness,'DECISION_REQUIRED');
  assert.deepEqual(h.calls,{secret:[],entitlement:[]});
});

test('unknown source is unavailable without consulting runtime secrets',()=>{
  const h=runtime();
  const result=h.runtime.evaluate('missing-source');
  assert.equal(result.access,'UNAVAILABLE');
  assert.equal(result.reason,'SOURCE_UNKNOWN');
  assert.equal(result.credential.state,'UNKNOWN');
  assert.equal(result.entitlement.state,'UNKNOWN');
  assert.deepEqual(h.calls,{secret:[],entitlement:[]});
});

test('credential check failure is unavailable and never echoes thrown secret-bearing error text',()=>{
  const leaked='do-not-leak-secret-123';
  const h=runtime({secretError:new Error('vault failed '+leaked)});
  const result=h.runtime.evaluate('krx-openapi');
  assert.equal(result.access,'UNAVAILABLE');
  assert.equal(result.reason,'CREDENTIAL_CHECK_FAILED');
  assert.equal(result.credential.state,'UNKNOWN');
  assert.equal(result.entitlement.state,'UNKNOWN');
  assert.doesNotMatch(JSON.stringify(result),new RegExp(leaked));
});

test('entitlement check failure is unavailable and never echoes provider error detail',()=>{
  const leaked='provider-plan-token-456';
  const h=runtime({secrets:{'krx-openapi':'secret'},entitlementError:new Error('entitlement failed '+leaked)});
  const result=h.runtime.evaluate('krx-openapi');
  assert.equal(result.access,'UNAVAILABLE');
  assert.equal(result.reason,'ENTITLEMENT_CHECK_FAILED');
  assert.equal(result.credential.state,'PRESENT');
  assert.equal(result.entitlement.state,'UNKNOWN');
  assert.doesNotMatch(JSON.stringify(result),new RegExp(leaked));
});

test('sanitized access result is deeply immutable and carries no health or secret transport material',()=>{
  const secret='never-in-output';
  const result=runtime({secrets:{'krx-openapi':secret},entitlements:{'krx-openapi':true}}).runtime.evaluate('krx-openapi');
  assert.equal(Object.isFrozen(result),true);
  assert.equal(Object.isFrozen(result.credential),true);
  assert.equal(Object.isFrozen(result.entitlement),true);
  assert.equal(Object.isFrozen(result.activation),true);
  assert.equal(result.accessControlOnly,true);
  assert.equal(result.executionWrite,false);
  for(const key of ['secret','token','apiKey','authorization','providerHealth','health'])assert.equal(Object.hasOwn(result,key),false);
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(),/bearish|bullish|buy|sell|order|execute|fill/);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
});

test('runtime surface is evaluate-only and provider foundation exports the constructor',()=>{
  const h=runtime();
  assert.deepEqual(Object.keys(h.runtime),['evaluate']);
  assert.equal(Providers.createCredentialEntitlementRuntime,Access.createCredentialEntitlementRuntime);
  assert.doesNotMatch(JSON.stringify(Object.keys(Access)).toLowerCase(),/order|execute|fill|position|trade/);
});
