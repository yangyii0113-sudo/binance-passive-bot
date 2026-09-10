'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {runtimeConfig}=require('../v12/staging/runtime_entry.js');

function baseEnv(overrides={}){
  return {
    HOST:'127.0.0.1',
    PORT:'0',
    FOXYYA_V12_LINEAGE_PATH:'/tmp/foxyya-v12-test.lineage.jsonl',
    FOXYYA_V12_REFRESH_SECONDS:'1800',
    ...overrides
  };
}

test('runtime source sync is opt-in and disabled by default',()=>{
  const config=runtimeConfig(baseEnv());
  assert.equal(config.runtimeSourceUrl,null);
  assert.equal(config.runtimeRefreshSeconds,30);
  assert.equal(config.researchOnly,true);
  assert.equal(config.executionWrite,false);
});

test('runtime source and cadence are accepted only from explicit environment configuration',()=>{
  const config=runtimeConfig(baseEnv({
    FOXYYA_V12_RUNTIME_SOURCE_URL:' https://runtime.example ',
    FOXYYA_V12_RUNTIME_REFRESH_SECONDS:'45'
  }));
  assert.equal(config.runtimeSourceUrl,'https://runtime.example');
  assert.equal(config.runtimeRefreshSeconds,45);
});

test('runtime refresh cadence is bounded even before the sync service starts',()=>{
  for(const value of ['0','9','301','abc','10.5']){
    assert.throws(()=>runtimeConfig(baseEnv({FOXYYA_V12_RUNTIME_REFRESH_SECONDS:value})),/RUNTIME_REFRESH_SECONDS_INVALID/);
  }
  for(const value of ['10','30','300']){
    assert.equal(runtimeConfig(baseEnv({FOXYYA_V12_RUNTIME_REFRESH_SECONDS:value})).runtimeRefreshSeconds,Number(value));
  }
});

test('runtime entry never hardcodes the Production execution domain as a default source',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../v12/staging/runtime_entry.js'),'utf8');
  assert.doesNotMatch(source,/foxyya-paper-engine-production\.up\.railway\.app/);
  assert.match(source,/FOXYYA_V12_RUNTIME_SOURCE_URL/);
});
