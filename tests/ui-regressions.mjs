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

// Presentation-only regression: keep research, quotes and execution distinct.
test('one coin has one main card and one comparison action', () => {
  const s=state();s.ui.strategyWorkspace='signals';
  s.market.rows=[['','UNI / USDT','10',5,2e7,80],['','ETH / USDT','100',4,2e7,85]];
  s.pullback={rows:[{symbol:'UNIUSDT',status:'WAIT',reason:'等待收盤條件'}]};
  const before=structuredClone(s);
  const html=pages.strategies(s);
  assert.equal((html.match(/<strong>UNIUSDT<\/strong>/g)||[]).length,1);
  assert.equal((html.match(/data-pullback-compare="UNIUSDT"/g)||[]).length,1);
  assert.doesNotMatch(html,/strategy-symbol">UNIUSDT/);
  assert.match(html,/strategy-symbol">ETHUSDT/);
  assert.match(html,/動能達標/);assert.doesNotMatch(html,/訊號信心|訊號分數/);
  assert.match(html,/固定百分比點位/);assert.match(html,/非研究進場計畫/);
  assert.deepEqual(s,before);
});

test('scan lifecycle shows exactly one truthful empty state', () => {
  const s=state();s.ui.strategyWorkspace='signals';s.market.rows=[];
  for(const [snapshot,expected,absent] of [
    [{rows:[]},'尚未分析幣種條件','本次沒有符合'],
    [{rows:[],loading:true},'正在分析幣種條件','尚未分析幣種條件'],
    [{rows:[],scannedAt:'2026-09-24T00:00:00Z',total:0},'本次沒有符合條件的強勢幣','尚未分析幣種條件'],
    [{rows:[],error:'合約資料讀取失敗'},'分析未完成','尚未分析幣種條件']
  ]){
    s.pullback=snapshot;const html=pages.strategies(s);
    assert.ok(html.includes(expected));assert.ok(!html.includes(absent));
    assert.doesNotMatch(html,/一鍵比較本次 0 檔|data-pullback-compare/);
    if(snapshot.error)assert.equal((html.match(/合約資料讀取失敗/g)||[]).length,1);
  }
});

test('historical coin cards do not acquire live quote levels while merged', () => {
  const s=state();s.ui.strategyWorkspace='signals';
  s.market.rows=[['','UNI / USDT','10',5,2e7,80]];
  s.pullback={rows:[{symbol:'UNIUSDT',status:'WAIT'}],analysisHistorical:true};
  const html=pages.strategies(s);
  assert.doesNotMatch(html,/entry-plan-primary|固定百分比點位/);
  assert.match(html,/data-pullback-compare="UNIUSDT" disabled/);
});

test('completed three-strategy analysis keeps momentum within the same article', () => {
  const s=state();s.ui.strategyWorkspace='signals';
  s.market.rows=[['','UNI / USDT','10',5,2e7,80]];
  s.pullback={rows:[{symbol:'UNIUSDT',rank:1,strength:80,analysis:{status:'VALID',closedAt:Date.now()-1000,validUntil:Date.now()+60000,aligned:true,hourlyDirection:'LONG',fourHourlyDirection:'LONG',strategies:[{key:'structured',status:'WAIT'}]}}]};
  const html=pages.strategies(s);
  const card=html.match(/<article[^>]*aria-label="UNIUSDT 幣種分析"[\s\S]*?<\/article>/)?.[0];
  assert.ok(card);assert.match(card,/趨勢回調/);assert.match(card,/data-search="momentum-UNIUSDT"/);
  assert.equal((html.match(/data-pullback-compare="UNIUSDT"/g)||[]).length,1);
  assert.doesNotMatch(html,/strategy-symbol">UNIUSDT/);
});

test('core flow keeps one primary scan and separates collapsed detail from safety state',()=>{
 const s=state();s.ui.strategyWorkspace='signals';s.pullback={rows:[],analysisHistorical:true};
 const html=pages.strategies(s);
 assert.equal((html.match(/data-pullback-scan/g)||[]).length,1);
 assert.match(html,/歷史分析（唯讀，非目前行情）/);
 assert.match(html,/缺少最新帳戶淨值與完整現有部位/);
 for(const key of ['selection-rules','analysis-history','market-reference','smc-definitions']){
  assert.match(html,new RegExp('<details[^>]*data-search="'+key+'"[^>]*>'));
  assert.doesNotMatch(html,new RegExp('<details[^>]*data-search="'+key+'"[^>]* open'));
 }
 assert.match(html,/data-scroll-target="smc-reference"/);assert.match(html,/id="smc-reference"/);
 assert.ok(html.indexOf('id="smc-reference"')>html.indexOf('data-search="market-reference"'));
});

test('active comparison does not show a not-started message',()=>{
 const s=state();s.ui.strategyWorkspace='signals';s.pullback={comparing:true,rows:[{symbol:'UNIUSDT',status:'WAIT'}]};
 const html=pages.strategies(s);
 assert.match(html,/正在計算策略績效/);assert.doesNotMatch(html,/尚未執行比較/);
});
