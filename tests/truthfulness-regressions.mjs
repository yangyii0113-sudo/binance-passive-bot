import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(){ this.map = new Map(); }
  getItem(key){ return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key,value){ this.map.set(key,String(value)); }
  removeItem(key){ this.map.delete(key); }
}
globalThis.localStorage = new MemoryStorage();

const { strengthScore } = await import('../src/market.js');
assert.equal(
  strengthScore(5, 2, 40),
  strengthScore(-5, 2, 40),
  'Futures opportunity strength must treat equal long/short momentum symmetrically'
);

const now = Date.now();
function candles(count=80){
  return Array.from({length:count},(_,i)=>{
    const open = now - (count-i) * 3_600_000;
    const close = 100 + i * 0.25;
    const closeTime = open + 3_599_000;
    return [open,String(close),String(close+1),String(close-1),String(close),'1000',closeTime];
  });
}
let futuresCalls = 0;
let spotCalls = 0;
globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  if(parsed.hostname === 'fapi.binance.com'){
    futuresCalls++;
    return {ok:false,status:451,json:async()=>({})};
  }
  if(parsed.hostname === 'data-api.binance.vision'){
    spotCalls++;
    return {ok:true,status:200,json:async()=>candles()};
  }
  throw new Error('unexpected host '+parsed.hostname);
};

const { analyzeMultiTimeframe } = await import('../src/multi_timeframe.js');
const technical = await analyzeMultiTimeframe('BTCUSDT');
assert.ok(futuresCalls >= 7, 'Technical must try USD-M first');
assert.ok(spotCalls >= 7, 'Technical must fallback each blocked timeframe');
assert.equal(technical.status,'LIVE');
assert.match(technical.source,/Spot public klines · fallback/);

localStorage.setItem('foxyya.paper.local.v1', JSON.stringify({
  cash:100000,
  createdAt:new Date(now-10000).toISOString(),
  positions:[{
    id:'p1',symbol:'BTCUSDT',side:'LONG',leverage:5,margin:100,notional:500,qty:5,entry:100,openedAt:new Date(now-9000).toISOString()
  }],
  trades:[{
    id:'t1',symbol:'ETHUSDT',side:'LONG',margin:100,netPnl:25,closed:true,realizedR:2,closedAt:new Date(now-5000).toISOString()
  }]
}));
const { localPaperSnapshot, localResultsSnapshot } = await import('../src/local_paper.js');
const paper = localPaperSnapshot([['₿','BTC / USDT','100.000',0,1000000,80]]);
assert.equal(Number(paper.summary.marginUsagePct.toFixed(4)),0.1);
assert.equal(paper.summary.riskProxy,'MARGIN_USAGE');
const results = localResultsSnapshot();
assert.equal(results.summary.expectancyR,null,'Local Paper must not fabricate R without stop-risk');

const { emptyStrategySnapshot, emptyPaperSnapshot, emptyResultsSnapshot, emptyBacktestSnapshot } = await import('../src/contracts.js');
const { pages } = await import('../src/pages.js');
const state = {
  ui:{assetClass:'crypto',strategyWorkspace:'signals',strategyFilter:'all'},
  market:{rows:[['₿','BTC / USDT','100.000',1,1000000,80]],universeRows:[['₿','BTC / USDT','100.000',1,1000000,80]],source:'TEST',status:'LIVE'},
  strategy:emptyStrategySnapshot(),
  paper:emptyPaperSnapshot(),
  results:emptyResultsSnapshot(),
  backtest:emptyBacktestSnapshot(),
  candidates:{items:[]},
  agents:{}
};
const backtestHtml = pages.backtest(state);
assert.ok(
  backtestHtml.includes('<option value="30D">30 天</option><option value="90D">90 天</option><option value="180D">180 天</option>'),
  '15m default form must expose only valid initial ranges'
);
assert.equal(backtestHtml.includes('<option value="MAX">'),false,'Backtest UI must not expose fake MAX');

console.log('TRUTHFULNESS_REGRESSIONS_OK');
console.log('symmetric futures opportunity score: enforced');
console.log('technical 451 fallback: enforced');
console.log('local paper R semantics: enforced');
console.log('backtest initial ranges / fake MAX: enforced');
