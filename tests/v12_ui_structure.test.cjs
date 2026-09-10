const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../v12/ui');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');

test('preview has six primary screens plus intelligence',()=>{
  const html=read('index.html');
  for(const id of ['home','markets','research','positions','results','lab','intelligence'])assert.match(html,new RegExp(`id="${id}"`));
});

test('home sections follow approved decision order',()=>{
  const html=read('index.html');
  const ids=['decision-summary','global-status','today-focus','early-trend','market-pulse','opportunities','risk-events'];
  const pos=ids.map(id=>html.indexOf(`id="${id}"`));
  assert.ok(pos.every(x=>x>=0));
  for(let i=1;i<pos.length;i++)assert.ok(pos[i]>pos[i-1]);
});

test('seven regions and three primary markets are present together',()=>{
  const html=read('index.html');
  for(const r of ['US','TW','CN_HK','JP','KR','EU','CRYPTO'])assert.match(html,new RegExp(`data-region="${r}"`));
  for(const m of ['CRYPTO','US','TW'])assert.match(html,new RegExp(`data-market-pulse="${m}"`));
});

test('preview does not contain buy sell commands or fabricated live values',()=>{
  const html=read('index.html');
  assert.doesNotMatch(html,/\bBUY\b|\bSELL\b|PLACE_ORDER|SUBMIT_ORDER|AUTHORIZE_EXECUTION/i);
  assert.match(html,/等待資料|暫不判斷|尚未提供|載入中/,'missing data remains explicit without fabricated live values');
  assert.match(html,/EXECUTION_WRITE=false/,'read-only safety contract remains visible');
});

test('mobile navigation has five daily routes and More',()=>{
  const html=read('index.html');
  const mobile=html.slice(html.indexOf('data-mobile-nav'));
  for(const route of ['HOME','MARKETS','RESEARCH','POSITIONS','RESULTS','MORE'])assert.match(mobile,new RegExp(`data-route="${route}"`));
});

test('touch targets are at least 44px in stylesheet',()=>{
  const css=read('styles.css');
  assert.match(css,/min-height:\s*44px/);
});
