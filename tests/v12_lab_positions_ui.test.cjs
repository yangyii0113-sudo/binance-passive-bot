'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('v12/ui/app.js','utf8');
const renderer=fs.readFileSync('v12/ui/home_renderer.js','utf8');

test('Lab is an accessible read-only status surface driven by the loaded view model',()=>{
  assert.match(app,/function upgradeLabSurface\(/);
  assert.match(app,/function renderLabSummary\(/);
  assert.match(app,/data-lab-content/);
  assert.match(app,/data-route="LAB"/);
  assert.doesNotMatch(app,/auto.?promot|promoteControl|activateControl/i);
});

test('Open and Pending position filters operate on rendered read-only position kinds',()=>{
  assert.match(renderer,/data-position-kind/);
  assert.match(app,/POSITION_FILTER/);
  assert.match(app,/function applyPositionFilter\(/);
  assert.match(app,/OPEN/);
  assert.match(app,/PENDING/);
});

test('Cancelled is not falsely enabled when runtime does not expose a canonical cancelled collection',()=>{
  assert.doesNotMatch(app,/positionFilter=['"]CANCELLED['"]/);
});