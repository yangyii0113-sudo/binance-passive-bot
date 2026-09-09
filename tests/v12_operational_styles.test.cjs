'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('v12/ui/styles.css','utf8');

test('new operational surfaces have explicit layout and readable card styles',()=>{
  for(const selector of ['.runtime-summary','.position-list','.position-row','.search-box','.search-results','.search-result','.favorite-btn','.operational-intelligence']){
    assert.match(css,new RegExp(selector.replace('.','\\.').replace('-','\\-')));
  }
});

test('search result and favorite controls preserve 44px touch targets',()=>{
  assert.match(css,/\.search-result\s*\{[^}]*min-height\s*:\s*44px/s);
  assert.match(css,/\.favorite-btn\s*\{[^}]*min-height\s*:\s*44px/s);
});

test('operational panels include mobile-specific responsive rules',()=>{
  const blocks=css.split('@media(max-width:820px)').slice(1).join('\n');
  assert.match(blocks,/\.operational-intelligence/);
  assert.match(blocks,/\.position-row/);
  assert.match(blocks,/#search-dialog/);
});