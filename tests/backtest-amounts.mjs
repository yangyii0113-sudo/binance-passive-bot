import test from 'node:test';
import assert from 'node:assert/strict';
import { runLiteBacktest } from '../src/local_backtest.js';
import { pages } from '../src/pages.js';
import { appState } from '../src/state.js';
import { researchHistoryPanel } from '../src/research_history_view.js';
import { researchExport } from '../src/research_history.js';

const visible = html => html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
async function simulate(direction, lastExit) {
  const end = Date.now()-3600000;
  const candles = Array.from({length:60},(_,i)=>{
    const value = i < 50 ? direction === 'LONG' ? 40+i : 160-i : direction === 'LONG' ? 101+i-50 : 99-(i-50);
    const open = i === 50 ? 100 : value;
    const close = i === 59 ? lastExit : value;
    const time = end-(60-i)*3600000;
    return [time,String(open),String(Math.max(open,close)+1),String(Math.min(open,close)-1),String(close),'1000',time+3599999];
  });
  const original = globalThis.fetch;
  globalThis.fetch = async()=>({ok:true,status:200,json:async()=>candles});
  try { return await runLiteBacktest({symbol:'BTCUSDT',strategy:'A',timeframe:'1h',range:'90D'}); }
  finally { globalThis.fetch=original; }
}

test('backtest exposes the fixed capital, monetary gain and ending balance used by the curve',async()=>{
  const snapshot = await simulate('LONG',110);
  assert.equal(snapshot.input.initialCapital,1000);
  assert.equal(snapshot.input.currency,'USDT');
  assert.equal(snapshot.result.trades,1);
  assert.ok(Math.abs(snapshot.result.netPnl-99.2)<1e-9);
  assert.ok(Math.abs(snapshot.result.finalEquity-1099.2)<1e-9);
  assert.equal(snapshot.equityCurve.at(-1).balance,snapshot.result.finalEquity);
});

test('linear short 100 to 90 earns 10 percent before the fixed 0.08 percent cost',async()=>{
  const snapshot = await simulate('SHORT',90);
  assert.equal(snapshot.recentTrades[0].entry,100);
  assert.equal(snapshot.recentTrades[0].exit,90);
  assert.ok(Math.abs(snapshot.result.netReturnPct-9.92)<1e-9);
  assert.ok(Math.abs(snapshot.result.netPnl-99.2)<1e-9);
});

test('exhausted backtest capital is zero and is not artificially preserved at one percent',async()=>{
  const snapshot = await simulate('SHORT',300);
  assert.equal(snapshot.result.netReturnPct,-100);
  assert.equal(snapshot.result.finalEquity,0);
  assert.equal(snapshot.result.netPnl,-1000);
  assert.equal(snapshot.result.capitalExhausted,true);
  assert.equal(snapshot.result.avgTradePct,-100);
  assert.equal(snapshot.recentTrades[0].returnPct,-100);
});

test('amounts appear with their currency in backtest, full research, history and CSV export',()=>{
  const s = structuredClone(appState);
  const backtest={input:{initialCapital:1000,currency:'USDT',calculationVersion:'linear-v2',timeframe:'4h',range:'2Y'},result:{netReturnPct:12.34,netPnl:123.4,finalEquity:1123.4}};
  s.backtest=backtest;
  s.ui.strategyWorkspace='agents';
  s.agents.topFiveResearch={status:'LIVE',rows:[{symbol:'BTCUSDT',rank:1,status:'DONE',backtest}]};
  const book={runs:[{id:'one',completedAt:'2026-09-20T00:00:00Z',rows:[{symbol:'BTCUSDT',backtest}]}]};
  for(const html of [pages.backtest(s),pages.strategies(s),researchHistoryPanel(book,'one')]){
    const text=visible(html);
    assert.match(text,/起始資金 1,000\.00 USDT/);
    assert.match(text,/淨損益金額 \+123\.40 USDT/);
    assert.match(text,/期末資金 1,123\.40 USDT/);
  }
  const csv=researchExport(book,{format:'csv',id:'one'}).text;
  assert.match(csv,/起始資金/);
  assert.match(csv,/淨損益金額/);
  assert.match(csv,/"1000"/);
  assert.match(csv,/"123.4"/);
  assert.match(csv,/"1123.4"/);
});

test('older research without a capital basis does not invent a monetary gain',()=>{
  const book={runs:[{id:'old',rows:[{symbol:'BTCUSDT',backtest:{input:{},result:{netReturnPct:50}}}]}]};
  const text=visible(researchHistoryPanel(book,'old'));
  assert.match(text,/淨損益金額 —/);
  assert.match(text,/重新驗證/);
  assert.doesNotMatch(text,/500\.00/);
});

test('derived signal targets disclose their fixed percentage and separation from EMA exits',()=>{
  const s=structuredClone(appState);
  s.market.rows=[['₿','BTC / USDT','100',5,1e9,90]];
  s.ui.strategyWorkspace='signals';
  const text=visible(pages.strategies(s));
  assert.match(text,/第一止盈 102\.000/);
  assert.match(text,/第二止盈 103\.500/);
  assert.match(text,/固定百分比/);
  assert.match(text,/未納入 EMA 回測/);
});

test('candidate readiness requires rerunning legacy local backtests after the calculation correction',()=>{
  const s=structuredClone(appState);
  s.ui.strategyWorkspace='candidates';
  const item={symbol:'BTCUSDT',technical:{status:'LIVE'},risk:{status:'PASS'},validator:{
    input:{dataSource:'Binance USD-M public klines',executionModel:'Fully Closed Signal → Next Bar Open'},
    result:{trades:80,profitFactor:1.5,avgTradePct:1,netReturnPct:10,maxDrawdownPct:20,validation:{level:'INITIAL'}}
  }};
  s.candidates.items=[item];
  assert.match(visible(pages.strategies(s)),/待重新驗證/);
  assert.doesNotMatch(pages.strategies(s),/decision-badge decision-pass/);
  item.validator.input.calculationVersion='linear-v2';
  assert.doesNotMatch(visible(pages.strategies(s)),/待重新驗證/);
  assert.match(pages.strategies(s),/decision-badge decision-pass/);
});
