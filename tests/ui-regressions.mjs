import test from 'node:test';
import assert from 'node:assert/strict';
import { pages } from '../src/pages.js';
import { appState, setStateSlice } from '../src/state.js';
import { normalizePaperSnapshot } from '../src/services/paper.js';
import { normalizeResultsSnapshot } from '../src/services/results.js';

const visibleText = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
function state() {
  const s = structuredClone(appState);
  s.ui.strategyWorkspace = 'agents';
  s.market.status = 'LIVE';
  s.market.rows = [['₿', 'BTC / USDT', '100', 5, 1e9, 90]];
  s.market.universeRows = s.market.rows;
  s.candidates.items = [{symbol:'BTCUSDT', source:'Market Scout', reason:'Research 80 · Trend · PASS', technical:{status:'ERROR',frames:[{label:'日線',direction:'待分析',status:'ERROR'}]}, risk:{status:'CAUTION',reasons:[]}}];
  s.agents.topFiveResearch = {status:'LIVE',rows:[{rank:1,symbol:'BTCUSDT',strategyMatch:'Trend',status:'DONE',guard:{label:'REVIEW',tone:'review'},decision:{label:'REVIEW',tone:'review'},risk:{status:'CAUTION'},spec:{supported:true,strategyLabel:'EMA20/50 Trend Baseline',timeframe:'4h',range:'2Y'}}]};
  return s;
}

test('candidate and all agent views translate display states without changing stored codes', () => {
  const s = state();
  const before = structuredClone(s);
  const views = [];
  for (const key of ['market','technical','news','validator','risk','review','playbook']) {
    s.ui.agentKey = key;
    views.push(visibleText(pages.strategies(s)));
  }
  s.ui.strategyWorkspace = 'candidates';
  views.push(visibleText(pages.strategies(s)));
  for (const text of views) assert.doesNotMatch(text, /\b(PASS|CAUTION|BLOCKED|REVIEW|WATCH|SETUP|READY|ERROR|Universe|Research|Candidate|BASELINE|GUARD|RISK|DATA|PIPELINE|Trend|Momentum|Trade Review|Paper)\b/);
  assert.deepEqual(s.candidates, before.candidates);
  assert.deepEqual(s.agents, before.agents);
});

test('missing performance metrics remain unavailable rather than displaying zero', () => {
  const s = state();
  const text = visibleText(pages.lab(s));
  assert.match(text, /勝率 —/);
  assert.match(text, /最大回撤 —/);
});

test('restored research is labelled historical with its full completion date', () => {
  const s = state();
  s.agents.topFiveResearch.restored = true;
  s.agents.topFiveResearch.updatedAt = '2026-09-01T01:02:00Z';
  const text = visibleText(pages.strategies(s));
  assert.match(text, /歷史研究/);
  assert.match(text, /2026/);
});

test('direct backtest route opens historical backtest', () => {
  const s = state();
  s.ui.labTab = 'forward';
  assert.match(pages.backtest(s), /id="backtest-form"/);
});

test('recovering remote snapshots clears local mode and removes local mutation controls', () => {
  for (const payload of [
    {summary:{}, positions:[{id:'remote-test',symbol:'BTCUSDT'}]},
    {books:{'5x':{positions:{BTC:{id:'remote-test',symbol:'BTCUSDT'}}}}}
  ]) {
    setStateSlice('paper',{local:true});
    setStateSlice('paper',normalizePaperSnapshot(payload));
    assert.equal(appState.paper.local,false);
    const html = pages.orders({...state(),paper:appState.paper});
    assert.doesNotMatch(html, /data-paper-close/);
    assert.match(html, /data-paper-open[^>]*disabled/);
  }
  for (const payload of [{summary:{}},{trades:[]}]) {
    setStateSlice('results',{local:true});
    setStateSlice('results',normalizeResultsSnapshot(payload));
    assert.equal(appState.results.local,false);
  }
});
