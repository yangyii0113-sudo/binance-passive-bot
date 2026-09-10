'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Bootstrap=require('../v12/staging/live_research_bootstrap.js');
const Home=require('../v12/read_model/home_snapshot.js');
const VM=require('../v12/ui/home_view_model.js');
const Renderer=require('../v12/ui/home_renderer.js');

const nowMs=Date.parse('2026-09-11T00:30:00Z');

test('live bootstrap declares US market breadth as unavailable by license gate without fetching or fabricating market values',()=>{
  const input=Bootstrap.buildBootstrapInput(nowMs);
  assert.ok(input.pulses?.US);
  assert.equal(input.pulses.US.status,'UNAVAILABLE');
  assert.equal(input.pulses.US.state,'UNAVAILABLE');
  assert.equal(input.pulses.US.reason,'NASDAQ_EOD_LICENSE_REVIEW_REQUIRED|US_FULL_MARKET_BREADTH_UNAVAILABLE');
  assert.equal(input.pulses.US.data,null);
  assert.doesNotMatch(JSON.stringify(input.pulses.US),/composite|nasdaq100|advancers|decliners|price/i);
});

test('Home view model preserves explicit US market unavailability reason',()=>{
  const bootstrap=Bootstrap.buildBootstrapInput(nowMs);
  const read=Home.buildHomeReadModel({asOf:nowMs,pulses:bootstrap.pulses});
  const view=VM.buildHomeViewModel(read);
  const us=view.marketPulse.find(x=>x.market==='US');
  assert.equal(us.status,'UNAVAILABLE');
  assert.equal(us.reason,'NASDAQ_EOD_LICENSE_REVIEW_REQUIRED|US_FULL_MARKET_BREADTH_UNAVAILABLE');
  assert.equal(us.data,null);
});

test('US pulse and region explain the license gate instead of looking broken or pretending real-time breadth exists',()=>{
  const bootstrap=Bootstrap.buildBootstrapInput(nowMs);
  const view=VM.buildHomeViewModel(Home.buildHomeReadModel({asOf:nowMs,pulses:bootstrap.pulses}));
  const rendered=Renderer.renderHomeSections(view);
  const pulse=rendered.marketPulseHtml;
  const start=pulse.indexOf('data-market-pulse="US"');
  const end=pulse.indexOf('data-market-pulse="TW"');
  const usHtml=pulse.slice(start,end);
  assert.match(usHtml,/Nasdaq-listed EOD/);
  assert.match(usHtml,/授權審查中/);
  assert.match(usHtml,/全美股即時廣度/);
  assert.match(usHtml,/尚未取得/);
  assert.doesNotMatch(usHtml,/即時可用|即時行情已接入|全美股廣度可用/);
  const regions=rendered.regionsHtml;
  const regionStart=regions.indexOf('data-region="US"');
  const regionEnd=regions.indexOf('data-region="TW"');
  const usRegion=regions.slice(regionStart,regionEnd);
  assert.match(usRegion,/Nasdaq-listed EOD/);
  assert.match(usRegion,/授權審查/);
  assert.match(usRegion,/全美股即時廣度/);
});
