import test from 'node:test';
import assert from 'node:assert/strict';
import { pages } from '../src/pages.js';
import { appState } from '../src/state.js';
import * as history from '../src/research_history.js';
import { equityChart } from '../src/equity_chart.js';
import { researchHistoryPanel } from '../src/research_history_view.js';

const visible = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const runs = [
  {id:'new',completedAt:'2026-09-20T03:00:00Z',total:1,rows:[{symbol:'BTCUSDT',researchScore:80,decision:{label:'VALIDATED'},risk:{status:'PASS'}}]},
  {id:'old',completedAt:'2026-09-19T03:00:00Z',total:1,rows:[{symbol:'ETHUSDT',researchScore:70,decision:{label:'REVIEW'},backtest:{input:{timeframe:'4h',range:'2Y'},result:{trades:20,netReturnPct:-5,profitFactor:null}}}]}
];
function state() {
  const s = structuredClone(appState);
  s.ui.strategyWorkspace = 'agents';
  s.ui.agentKey = 'market';
  s.agents.researchHistory = {runs:structuredClone(runs)};
  return s;
}

test('history selector displays the chosen saved run without changing current research or candidates', () => {
  const s = state();
  s.ui.researchHistoryId = 'old';
  const before = structuredClone(s);
  const html = pages.strategies(s);
  const historyHtml = html.match(/<details class="research-history"[\s\S]*?<\/details>/)?.[0];
  assert.ok(historyHtml, 'saved research must have a browseable history panel');
  assert.match(historyHtml, /value="old" selected/);
  assert.match(visible(historyHtml), /ETHUSDT/);
  assert.doesNotMatch(visible(historyHtml), /BTCUSDT/);
  assert.match(visible(historyHtml), /歷史.*唯讀/);
  assert.match(visible(historyHtml), /2026/);
  assert.doesNotMatch(historyHtml, /data-(research-promote|candidate-add|use-paper)/);
  assert.deepEqual(s,before);
});

test('empty history disables export and unknown selection falls back to the latest saved run', () => {
  const s = state();
  s.ui.researchHistoryId = 'removed';
  assert.match(pages.strategies(s), /value="new" selected/);
  s.agents.researchHistory.runs = [];
  const html = pages.strategies(s);
  assert.match(html, /尚無研究歷史/);
  assert.match(html, /data-history-export="json"[^>]*disabled/);
});

test('JSON export contains saved research and explicit historical paper-only provenance', () => {
  assert.equal(typeof history.researchExport,'function');
  const book = {runs:structuredClone(runs)};
  const before = structuredClone(book);
  const file = history.researchExport(book,{format:'json'});
  const payload = JSON.parse(file.text);
  assert.equal(payload.schema,'foxyya-research-export/1');
  assert.equal(payload.paperOnly,true);
  assert.equal(payload.realOrderLocked,true);
  assert.equal(payload.historical,true);
  assert.deepEqual(payload.runs.map(x=>x.id),['new','old']);
  assert.equal(payload.runs[1].completedAt,'2026-09-19T03:00:00Z');
  assert.deepEqual(book,before);
});

test('selected CSV export preserves missing/negative metrics and neutralizes spreadsheet formulas', () => {
  assert.equal(typeof history.researchExport,'function');
  const book = {runs:structuredClone(runs)};
  book.runs[1].rows[0].symbol = '=1+1';
  const file = history.researchExport(book,{format:'csv',id:'old'});
  assert.match(file.text, /^\uFEFF/);
  assert.match(file.text, /'\=1\+1/);
  assert.match(file.text, /-5/);
  assert.match(file.text, /需複核/);
  assert.doesNotMatch(file.text, /BTCUSDT|null|undefined/);
  assert.throws(()=>history.researchExport(book,{format:'csv',id:'missing'}),/找不到/);
});

test('paper chart uses recorded balance nodes and labels the realized-only local data', () => {
  const s = state();
  s.results.local = true;
  s.results.navCurve = [{time:'2026-09-19T00:00:00Z',nav:100000},{time:'2026-09-20T00:00:00Z',nav:100050}];
  const html = pages.lab(s);
  assert.match(html, /<svg[^>]*role="img"/);
  assert.match(visible(html), /本機模擬已實現餘額/);
  assert.match(visible(html), /100,050/);
  assert.match(visible(html), /不含未平倉浮動損益/);
  assert.match(html, /<path[^>]*data-equity-segment/);
});

test('backtest chart handles time_ms, flat balances and invalid gaps without invented points', () => {
  const s = state();
  s.backtest.result = {trades:2};
  s.backtest.equityCurve = [
    {time_ms:1000,balance:1000},{time_ms:2000,balance:1000},
    {time_ms:3000,balance:null},{time_ms:4000,balance:1000},{time_ms:5000,balance:1000}
  ];
  const html = pages.backtest(s);
  assert.match(html, /<svg[^>]*role="img"/);
  assert.equal((html.match(/data-equity-segment/g)||[]).length,2);
  assert.match(visible(html), /4 個有效節點/);
  assert.match(visible(html), /缺口不連線/);
  assert.doesNotMatch(html, /(?:NaN|Infinity)/);
  s.backtest.equityCurve = [{time_ms:1,balance:null},{time_ms:2,balance:''}];
  const missing = pages.backtest(s);
  assert.match(visible(missing), /尚無可繪製的權益資料/);
  assert.doesNotMatch(missing, /<svg/);
});

test('non-numeric types never become zero balances or research metrics', () => {
  for (const value of [' ', '\t', [], [1], false, true, {}]) {
    const chart = visible(equityChart([{time:1000,balance:1000},{time:2000,balance:value},{time:3000,balance:1010}]));
    assert.match(chart,/2 個有效節點/);
    assert.match(chart,/最低 1,000/);
    const panel = visible(researchHistoryPanel({runs:[{id:'invalid',rows:[{symbol:'BTCUSDT',researchScore:value}]}]}));
    assert.match(panel,/研究評分 —/);
  }
  assert.match(visible(equityChart([{time:1000,balance:0},{time:2000,balance:'2.5'}])),/最低 0/);
});
