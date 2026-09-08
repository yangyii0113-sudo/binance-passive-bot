const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../v12/core/index.js');

test('foundation exposes provider registry and canonical normalizer', () => {
  assert.equal(typeof F.providers.createRegistry, 'function');
  assert.equal(typeof F.providers.validateProviderDescriptor, 'function');
  assert.equal(typeof F.normalizer.makeObservation, 'function');
});

test('provider foundation has no execution-write capability', () => {
  const p=F.providers.validateProviderDescriptor({
    id:'fixture', sourceLabel:'Fixture', markets:['US'], capabilities:['QUOTE'],
    transport:'FILE', executionWrite:true, priority:1
  });
  assert.equal(p.ok,false);
});