const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../v12/providers/credential_entitlement_policy.js');
const Providers=require('../v12/providers/index.js');

function policy({credentials={},entitlements={}}={}){
  return A.createCredentialEntitlementPolicy({
    credentialResolver:id=>credentials[id]===true,
    entitlementResolver:id=>entitlements[id]===undefined?'UNKNOWN':(entitlements[id]===true?'ENTITLED':'NOT_ENTITLED')
  });
}

test('access vocabularies are explicit and stable',()=>{
  assert.deepEqual(A.ACCESS_STATES,['READY','BLOCKED']);
  assert.deepEqual(A.CREDENTIAL_STATES,['NOT_REQUIRED','MISSING','PRESENT']);
  assert.deepEqual(A.ENTITLEMENT_STATES,['NOT_REQUIRED','UNKNOWN','NOT_ENTITLED','ENTITLED']);
});

test('adopted public source is ready without consulting secrets or entitlement',()=>{
  let credentialCalls=0,entitlementCalls=0;
  const p=A.createCredentialEntitlementPolicy({
    credentialResolver(){credentialCalls+=1;return false;},
    entitlementResolver(){entitlementCalls+=1;return 'UNKNOWN';}
  });
  const result=p.evaluate('twse-openapi');
  assert.equal(result.access,'READY');
  assert.equal(result.credential,'NOT_REQUIRED');
  assert.equal(result.entitlement,'NOT_REQUIRED');
  assert.equal(credentialCalls,0);
  assert.equal(entitlementCalls,0);
});

test('FINRA requires credential but does not invent an entitlement requirement',()=>{
  assert.equal(policy().evaluate('finra-research').reason,'CREDENTIAL_REQUIRED');
  const ready=policy({credentials:{'finra-research':true}}).evaluate('finra-research');
  assert.equal(ready.access,'READY');
  assert.equal(ready.credential,'PRESENT');
  assert.equal(ready.entitlement,'NOT_REQUIRED');
});

test('KRX and J-Quants require credential and entitlement independently',()=>{
  for(const id of ['krx-openapi','jpx-jquants']){
    const noKey=policy().evaluate(id);
    assert.equal(noKey.access,'BLOCKED');
    assert.equal(noKey.reason,'CREDENTIAL_REQUIRED');
    assert.equal(noKey.credential,'MISSING');
    assert.equal(noKey.entitlement,'UNKNOWN');

    const keyOnly=policy({credentials:{[id]:true}}).evaluate(id);
    assert.equal(keyOnly.access,'BLOCKED');
    assert.equal(keyOnly.reason,'ENTITLEMENT_REQUIRED');
    assert.equal(keyOnly.credential,'PRESENT');
    assert.equal(keyOnly.entitlement,'UNKNOWN');

    const denied=policy({credentials:{[id]:true},entitlements:{[id]:false}}).evaluate(id);
    assert.equal(denied.access,'BLOCKED');
    assert.equal(denied.reason,'ENTITLEMENT_DENIED');
    assert.equal(denied.entitlement,'NOT_ENTITLED');

    const ready=policy({credentials:{[id]:true},entitlements:{[id]:true}}).evaluate(id);
    assert.equal(ready.access,'READY');
    assert.equal(ready.credential,'PRESENT');
    assert.equal(ready.entitlement,'ENTITLED');
  }
});

test('review-required and decision-required sources stay blocked regardless of credentials',()=>{
  const p=policy({credentials:{'twse-mops':true,'us-equity-realtime':true},entitlements:{'twse-mops':true,'us-equity-realtime':true}});
  assert.equal(p.evaluate('twse-mops').reason,'REVIEW_REQUIRED');
  assert.equal(p.evaluate('us-equity-realtime').reason,'DECISION_REQUIRED');
});

test('unknown source is blocked explicitly',()=>{
  const result=policy().evaluate('not-a-source');
  assert.equal(result.access,'BLOCKED');
  assert.equal(result.reason,'SOURCE_UNKNOWN');
  assert.equal(result.sourceId,'not-a-source');
});

test('credential resolver must return boolean and entitlement resolver must return fixed state',()=>{
  const rawSecret=A.createCredentialEntitlementPolicy({credentialResolver:()=> 'sk-secret',entitlementResolver:()=> 'ENTITLED'});
  assert.throws(()=>rawSecret.evaluate('finra-research'),/CREDENTIAL_RESOLVER_INVALID/);

  const badEntitlement=A.createCredentialEntitlementPolicy({credentialResolver:()=>true,entitlementResolver:()=> 'PAID'});
  assert.throws(()=>badEntitlement.evaluate('krx-openapi'),/ENTITLEMENT_RESOLVER_INVALID/);
});

test('access result never contains credential material and remains server-only when source requires secret',()=>{
  const result=policy({credentials:{'krx-openapi':true},entitlements:{'krx-openapi':true}}).evaluate('krx-openapi');
  assert.equal(result.serverOnly,true);
  assert.equal(result.secretRequired,true);
  assert.equal(result.executionWrite,false);
  assert.equal(Object.isFrozen(result),true);
  const serialized=JSON.stringify(result).toLowerCase();
  assert.doesNotMatch(serialized,/api[_-]?key|token|password|secretvalue|authorization/);
});

test('policy surface is evaluate-only and Provider Foundation exports the runtime policy',()=>{
  const p=policy();
  assert.deepEqual(Object.keys(p),['evaluate']);
  assert.equal(Providers.createCredentialEntitlementPolicy,A.createCredentialEntitlementPolicy);
  assert.doesNotMatch(JSON.stringify(Object.keys(p)).toLowerCase(),/order|execute|fill|position|trade/);
});
