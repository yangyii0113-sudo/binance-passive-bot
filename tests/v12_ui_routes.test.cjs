const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../v12/ui/routes.js');

test('primary navigation is decision oriented and fixed',()=>{
  assert.deepEqual(R.PRIMARY_ROUTES.map(x=>x.id),['HOME','MARKETS','RESEARCH','POSITIONS','RESULTS','LAB']);
});

test('intelligence calendar notifications system settings are auxiliary',()=>{
  for(const x of ['INTELLIGENCE','CALENDAR','NOTIFICATIONS','SYSTEM','SETTINGS'])assert.ok(R.AUX_ROUTES.some(r=>r.id===x));
});

test('home card action map limits primary and secondary actions',()=>{
  for(const item of Object.values(R.HOME_ACTIONS)){
    assert.ok(item.primary.length<=1);
    assert.ok(item.secondary.length<=2);
  }
});

test('action classes are only primary secondary filter utility',()=>{
  assert.deepEqual(R.ACTION_CLASSES,['PRIMARY','SECONDARY','FILTER','UTILITY']);
});
