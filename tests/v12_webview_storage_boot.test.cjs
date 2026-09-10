'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('v12/ui/app.js','utf8');

function throwingStorageWindow(){
  const window={
    addEventListener(){},
    scrollTo(){},
    FOXY_V12_HOME_VIEW_MODEL:undefined,
    FOXY_V12_HOME_RENDERER:undefined,
    FOXY_V12_HOME_DOM:undefined,
    FOXY_V12_STAGING_READ_CLIENT:undefined
  };
  Object.defineProperty(window,'localStorage',{
    configurable:true,
    get(){const error=new Error('storage access denied');error.name='SecurityError';throw error;}
  });
  return window;
}

test('Preview boot survives WebView SecurityError when localStorage access is blocked',()=>{
  const window=throwingStorageWindow();
  const document={querySelector(){return null},querySelectorAll(){return []},addEventListener(){}};
  const location={hash:'#home',pathname:'/not-preview'};
  const history={replaceState(){},pushState(){}};
  assert.doesNotThrow(()=>vm.runInNewContext(source,{
    window,document,location,history,
    URLSearchParams,AbortController,
    Date,setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},console
  },{filename:'app.js'}));
  assert.ok(window.FOXY_V12_PREVIEW,'Preview API should still initialize when storage is unavailable');
});
