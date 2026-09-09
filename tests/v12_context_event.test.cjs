const test=require('node:test');const assert=require('node:assert/strict');
const E=require('../v12/data/context_event.js');
const base={schemaVersion:'foxyya-context-event/1',eventId:'FED:abc',scope:'US',category:'MONETARY_POLICY',title:'Federal Reserve issues FOMC statement',publishedAt:1,receivedAt:2,source:'FederalReserve:MONETARY_POLICY',url:'https://www.federalreserve.gov/example.htm',status:'SNAPSHOT',researchOnly:true};
test('context event validates a published policy fact',()=>{assert.equal(E.validateContextEvent(base).ok,true);});
test('context event rejects execution semantics and price predictions',()=>{for(const bad of [{...base,executionState:'OPEN'},{...base,targetPrice:100},{...base,buySell:'BUY'}])assert.equal(E.validateContextEvent(bad).ok,false);});
test('context event enforces publication before receive time',()=>{const r=E.validateContextEvent({...base,publishedAt:3,receivedAt:2});assert.equal(r.ok,false);assert.ok(r.errors.includes('TIME_ORDER_INVALID'));});
test('context event supports global regional scopes but rejects unknown category',()=>{assert.equal(E.validateContextEvent({...base,scope:'GLOBAL'}).ok,true);assert.equal(E.validateContextEvent({...base,category:'MAGIC'}).ok,false);});
