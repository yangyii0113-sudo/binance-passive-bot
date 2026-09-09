const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../v12/ui/home_renderer.js');

const asOf=Date.parse('2026-09-09T05:15:00Z');
const regions=['US','TW','CN_HK','JP','KR','EU','CRYPTO'];

function viewModel(){
  return Object.freeze({
    schemaVersion:'foxyya-home-view-model/1',asOf,researchOnly:true,executionWrite:false,
    regions:Object.freeze(regions.map(region=>Object.freeze({region,bias:region==='TW'?'BULLISH':'UNAVAILABLE',confidence:region==='TW'?.72:0,status:'AVAILABLE',asOf}))),
    marketPulse:Object.freeze([
      Object.freeze({market:'CRYPTO',status:'AVAILABLE',stateLabel:'PAPER ONLY',asOf,data:null}),
      Object.freeze({market:'US',status:'UNAVAILABLE',stateLabel:'UNAVAILABLE',asOf,data:null}),
      Object.freeze({market:'TW',status:'AVAILABLE',stateLabel:'AVAILABLE',asOf,data:null}),
    ]),
    earlyTrend:Object.freeze([
      Object.freeze({market:'TW',instrumentId:'TWSE:2330',stateLabel:'EARLY WATCH',direction:'POSITIVE',confidence:.65,mode:'RESEARCH',sourceLineage:Object.freeze(['TWSE:T86'])})
    ]),
    opportunities:Object.freeze({
      CRYPTO:Object.freeze([Object.freeze({market:'CRYPTO',symbol:'ETHUSDT',side:'LONG',family:'A',status:'ARMED',mode:'PAPER READ-ONLY',executionReadOnly:true,executionWrite:false})]),
      US:Object.freeze([]),
      TW:Object.freeze([Object.freeze({market:'TW',instrumentId:'TWSE:2330',direction:'POSITIVE',earlyStage:'EARLY WATCH',mode:'RESEARCH',researchOnly:true,executionWrite:false,sourceLineage:Object.freeze(['TWSE:T86'])})])
    }),
    events:Object.freeze([Object.freeze({id:'fed-1',title:'Fed <statement> & policy',source:'FED',asOf:asOf-1000})])
  });
}

test('renderer emits seven regions, three market pulses and all decision sections',()=>{
  const out=R.renderHomeSections(viewModel());
  assert.equal(out.schemaVersion,'foxyya-home-render/1');
  assert.equal((out.regionsHtml.match(/data-region=/g)||[]).length,7);
  assert.equal((out.marketPulseHtml.match(/data-market-pulse=/g)||[]).length,3);
  assert.match(out.earlyTrendHtml,/TWSE:2330/);
  assert.match(out.opportunitiesHtml,/ETHUSDT/);
  assert.match(out.opportunitiesHtml,/PAPER READ-ONLY/);
  assert.match(out.opportunitiesHtml,/RESEARCH/);
  assert.match(out.eventsHtml,/Fed &lt;statement&gt; &amp; policy/);
});

test('renderer keeps unavailable states visible instead of blank or zero',()=>{
  const out=R.renderHomeSections(viewModel());
  assert.match(out.regionsHtml,/UNAVAILABLE/);
  assert.match(out.marketPulseHtml,/UNAVAILABLE/);
  const empty=R.renderHomeSections({...viewModel(),earlyTrend:Object.freeze([]),events:Object.freeze([])});
  assert.match(empty.earlyTrendHtml,/UNAVAILABLE/);
  assert.match(empty.eventsHtml,/UNAVAILABLE/);
});

test('renderer escapes all user or provider supplied text',()=>{
  const bad={...viewModel(),earlyTrend:Object.freeze([Object.freeze({market:'TW',instrumentId:'<img src=x onerror=alert(1)>',stateLabel:'EARLY WATCH',direction:'POSITIVE',confidence:.5,mode:'RESEARCH',sourceLineage:Object.freeze(['<script>x</script>'])})])};
  const out=R.renderHomeSections(bad);
  assert.equal(out.earlyTrendHtml.includes('<img'),false);
  assert.equal(out.earlyTrendHtml.includes('<script>'),false);
  assert.match(out.earlyTrendHtml,/&lt;img/);
});

test('renderer rejects writable or wrong-schema view models and never emits order controls',()=>{
  const valid=viewModel();
  assert.throws(()=>R.renderHomeSections({...valid,executionWrite:true}),/HOME_VIEW_READ_ONLY_REQUIRED/);
  assert.throws(()=>R.renderHomeSections({...valid,schemaVersion:'other'}),/HOME_VIEW_MODEL_REQUIRED/);
  const text=JSON.stringify(R.renderHomeSections(valid)).toUpperCase();
  assert.equal(/PLACEORDER|SUBMITORDER|AUTHORIZEEXECUTION/.test(text),false);
  assert.equal(/>BUY<|>SELL</.test(text),false);
});
