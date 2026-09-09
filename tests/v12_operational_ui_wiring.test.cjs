'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const source=fs.readFileSync('v12/ui/app.js','utf8');

test('preview upgrades existing placeholders into live operational render targets before Home load',()=>{
  assert.match(source,/function upgradeOperationalSurfaces\(/);
  assert.match(source,/data-home-content[^\n]*today-focus|today-focus[^\n]*data-home-content/);
  assert.match(source,/data-positions-content/);
  assert.match(source,/data-trading-results/);
  assert.match(source,/data-calendar-content/);
  assert.match(source,/data-news-content/);
  assert.ok(source.indexOf('upgradeOperationalSurfaces()')<source.indexOf('loadStagingHome()'));
});

test('only data-backed operational routes are unlocked and Calendar routes to Intelligence evidence',()=>{
  assert.match(source,/data-route="POSITIONS"/);
  assert.match(source,/data-route="RESULTS"/);
  assert.match(source,/data-action="CALENDAR"/);
  assert.match(source,/calendar-panel/);
  assert.match(source,/removeAttribute\(['"]disabled['"]\)/);
  assert.doesNotMatch(source,/enableAction\(['"]NOTIFICATIONS['"]\)/);
  assert.doesNotMatch(source,/enableAction\(['"]PROFILE['"]\)/);
  assert.doesNotMatch(source,/enableAction\(['"]SETTINGS['"]\)/);
});