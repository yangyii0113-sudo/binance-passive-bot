'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('v12/ui/app.js','utf8');
const product=fs.readFileSync('v12/ui/product_renderer.js','utf8');

test('local search indexes only the loaded verified view model and exposes no remote search endpoint',()=>{
  assert.match(app,/function buildSearchIndex\(/);
  assert.match(app,/function searchSnapshot\(/);
  assert.match(app,/lastViewModel/);
  assert.match(app,/data-action="SEARCH"/);
  assert.match(app,/search-dialog/);
  assert.doesNotMatch(app,/\/api\/search|google\.com\/search|bing\.com\/search/i);
});

test('research cards expose local favorite controls and favorites persist only in browser localStorage',()=>{
  assert.match(product,/data-favorite-id/);
  assert.match(app,/localStorage/);
  assert.match(app,/foxyya-v12-local-favorites-v1/);
  assert.match(app,/function toggleFavorite\(/);
  assert.match(app,/data-action="FAVORITES"/);
  assert.doesNotMatch(app,/favorites.*fetch|fetch.*favorites/i);
});

test('search and favorites remain read-only presentation utilities',()=>{
  const text=(app+'\n'+product).toUpperCase();
  assert.equal(/PLACEORDER|SUBMITORDER|AUTHORIZEEXECUTION|WITHDRAW|TRANSFER/.test(text),false);
});