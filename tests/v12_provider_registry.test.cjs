const test = require('node:test');
const assert = require('node:assert/strict');
const {createRegistry} = require('../v12/providers/registry.js');

const descriptor = (id, priority=10) => ({
  id, sourceLabel:id, markets:['US'], capabilities:['QUOTE'],
  transport:'PUBLIC_READ_ONLY', executionWrite:false, priority
});
const adapter = {normalize(raw){ return raw; }};

test('registry resolves highest-priority matching provider deterministically', () => {
  const r=createRegistry();
  r.register(descriptor('secondary',20),adapter);
  r.register(descriptor('primary',5),adapter);
  assert.equal(r.resolve('US','QUOTE').descriptor.id,'primary');
});

test('duplicate provider id is rejected', () => {
  const r=createRegistry();
  r.register(descriptor('same'),adapter);
  assert.throws(()=>r.register(descriptor('same'),adapter),/PROVIDER_DUPLICATE/);
});

test('adapter must expose normalize', () => {
  const r=createRegistry();
  assert.throws(()=>r.register(descriptor('bad'),{}),/NORMALIZE_REQUIRED/);
});

test('registered descriptor is frozen against mutation', () => {
  const r=createRegistry();
  const entry=r.register(descriptor('frozen'),adapter);
  assert.equal(Object.isFrozen(entry.descriptor),true);
  assert.equal(Object.isFrozen(entry.descriptor.markets),true);
});