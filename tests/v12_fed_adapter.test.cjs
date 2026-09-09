const test=require('node:test');const assert=require('node:assert/strict');
const FED=require('../v12/providers/fed_adapter.js');
const receivedAt=Date.parse('2026-09-03T18:00:00Z');

test('Fed provider is server-side read-only and cannot execute',()=>{assert.equal(FED.descriptor.serverOnly,true);assert.equal(FED.descriptor.executionWrite,false);assert.ok(FED.descriptor.capabilities.includes('NEWS'));});

test('Fed RSS item becomes a research-only context event',()=>{const r=FED.normalizeFeedItems([{guid:'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260903a.htm',title:'Federal Reserve issues FOMC statement',link:'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260903a.htm',pubDate:'Thu, 03 Sep 2026 18:00:00 GMT',description:'Statement text summary'}],{receivedAt,feedType:'MONETARY_POLICY'});assert.equal(r.length,1);assert.equal(r[0].scope,'US');assert.equal(r[0].category,'MONETARY_POLICY');assert.equal(r[0].researchOnly,true);assert.equal(r[0].source,'FederalReserve:MONETARY_POLICY');assert.equal(r[0].publishedAt,receivedAt);});

test('Fed speech feed maps to speech category without bullish or bearish inference',()=>{const r=FED.normalizeFeedItems([{guid:'speech-1',title:'Speech on the economic outlook',link:'https://www.federalreserve.gov/newsevents/speech/example.htm',pubDate:'Thu, 03 Sep 2026 17:00:00 GMT'}],{receivedAt,feedType:'SPEECH'});assert.equal(r[0].category,'SPEECH');assert.equal(Object.hasOwn(r[0],'direction'),false);assert.equal(Object.hasOwn(r[0],'targetPrice'),false);});

test('Fed adapter rejects unsupported feed types',()=>{assert.throws(()=>FED.normalizeFeedItems([],{receivedAt,feedType:'MAGIC'}),/FEED_TYPE_UNSUPPORTED/);});

test('Fed adapter rejects malformed publication time instead of using receive time silently',()=>{assert.throws(()=>FED.normalizeFeedItems([{guid:'x',title:'x',link:'https://www.federalreserve.gov/x',pubDate:'bad'}],{receivedAt,feedType:'SPEECH'}),/PUBLISHED_AT_INVALID/);});
