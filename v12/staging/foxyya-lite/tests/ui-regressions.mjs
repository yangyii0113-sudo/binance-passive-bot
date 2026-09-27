import test from 'node:test';
import assert from 'node:assert/strict';
import * as homeModule from '../src/home_opportunities.js';
import { researchOverview } from '../src/research_overview.js';
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
test('home research entry labels stale or future market snapshots without claiming a current direction',()=>{
  const now=Date.now(),s=state();s.market.direction='偏多';
  for(const stamp of [null,new Date(now-300000).toISOString(),new Date(now+10000).toISOString()]){
    s.market.updatedAt=stamp;
    const html=pages.home(s,now);
    assert.match(html,/行情待更新/);assert.doesNotMatch(html,/direction-value">偏多/);
  }
  s.market.updatedAt=new Date(now).toISOString();
  const html=pages.home(s,now);
  assert.match(html,/追蹤範圍 1 檔/);assert.match(html,/上漲 1/);assert.match(html,/下跌 0/);
  assert.match(html,/data-home-research/);assert.match(html,/href="#\/advice-results"/);
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
test('scanned coin cards hand off the exact symbol to fresh advice and block actions during a scan',()=>{
  const s=state();s.ui.strategyWorkspace='signals';s.market.rows=[];
  s.pullback={rows:[{symbol:'UNIUSDT',status:'WAIT',reason:'等待收盤條件'}]};
  const before=structuredClone(s),html=pages.strategies(s);
  assert.equal((html.match(/data-agent-analyze="UNIUSDT"/g)||[]).length,1);
  assert.deepEqual(s,before);
  s.pullback.loading=true;
  assert.match(pages.strategies(s),/data-agent-analyze="UNIUSDT"[^>]*disabled/);
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


function homeFixture(){
  const now=2400*3600000+120000,s=state();
  Object.assign(s.market,{cryptoOnly:true,updatedAt:new Date(now).toISOString(),contractVerifiedAt:new Date(now).toISOString(),universeRows:[
    ['','AAA / USDT','100',12,5e7,99],['','BBB / USDT','100',4,2e7,80],['','CCC / USDT','100',3,2e7,75],
    ['','SPIKE / USDT','100',31,8e8,100],['','LOW / USDT','100',8,1e6,98],['','DOWN / USDT','100',-10,1e8,97]
  ]});
  const p={key:'breakout',status:'SETUP',side:'LONG',entry:100,stop:95,tp1:110,tp2:120,signalAt:2400*3600000-1,expiresAt:2401*3600000};
  s.agents.tradePlans={BBBUSDT:{symbol:'BBBUSDT',status:'LIVE',checkedAt:now,snapshotUntil:now+60000,
    marketSnapshot:{price:98,high:99,low:97,barOpen:2400*3600000,requestedAt:now,receivedAt:now},
    row:{symbol:'BBBUSDT',analysis:{status:'VALID',analyzedAt:now,closedAt:p.signalAt,validUntil:p.expiresAt,strategies:[p,{key:'structured',status:'WAIT',reason:'等待回調'},{key:'meanReversion',status:'WAIT',reason:'等待震盪'}]}}}};
  return {s,now};
}
test('home ranks liquid rising candidates separately from gated entry status',()=>{
  const {s,now}=homeFixture(),before=structuredClone(s),html=researchOverview(s,now);
  assert.match(html,/data-home-opportunity="AAAUSDT"/);assert.match(html,/data-home-opportunity="BBBUSDT"/);
  assert.doesNotMatch(html,/data-home-opportunity="(?:SPIKE|LOW|DOWN)USDT"/);
  assert.ok(html.indexOf('data-home-opportunity="AAAUSDT"')<html.indexOf('data-home-opportunity="BBBUSDT"'));
  assert.match(html,/data-home-check-symbol="AAAUSDT"/);assert.match(html,/data-agent-advice-symbol="BBBUSDT"/);
  assert.match(html,/市場強度排序/);assert.match(html,/進場條件排序/);assert.match(html,/分數不是勝率/);
  assert.deepEqual(s,before);
  s.ui.homeOpportunitySort='readiness';const sorted=researchOverview(s,now);
  assert.ok(sorted.indexOf('data-home-opportunity="BBBUSDT"')<sorted.indexOf('data-home-opportunity="AAAUSDT"'));
});
test('home never upgrades expired, mismatched or historical plans and gives an empty filter recovery',()=>{
  const {s,now}=homeFixture();s.ui.homeOpportunityFilter='plan';
  assert.match(researchOverview(s,now),/data-home-opportunity="BBBUSDT"/);
  for(const change of [r=>r.snapshotUntil=now,r=>r.historical=true,r=>r.row.symbol='AAAUSDT',r=>delete r.marketSnapshot]){
    const copy=structuredClone(s);change(copy.agents.tradePlans.BBBUSDT);
    const html=researchOverview(copy,now);assert.doesNotMatch(html,/data-home-opportunity=/);
    assert.match(html,/目前沒有通過核對的計畫/);assert.match(html,/data-home-opportunity-filter="all"/);
  }
});
test('home hides candidate ranks when market or contract verification is stale',()=>{
  const {s,now}=homeFixture();
  for(const change of [m=>m.status='STALE',m=>m.cryptoOnly=false,m=>m.updatedAt=new Date(now-100000).toISOString(),m=>m.contractVerifiedAt=new Date(now-301000).toISOString(),m=>m.contractVerifiedAt=new Date(now+1).toISOString()]){
    const copy=structuredClone(s);change(copy.market);
    assert.doesNotMatch(researchOverview(copy,now),/data-home-opportunity=/);
    assert.match(researchOverview(copy,now),/data-home-check-all/);
  }
});
test('home has at most ten unique candidates and keeps out-of-list plans separate',()=>{
  const {s,now}=homeFixture();s.market.universeRows=Array.from({length:15},(_,i)=>['',`C${i} / USDT`,'10',3,2e7,90-i]);
  s.market.universeRows.push(s.market.universeRows[0]);
  const html=researchOverview(s,now);
  assert.equal((html.match(/data-home-opportunity="/g)||[]).length,10);
  assert.doesNotMatch(html,/data-home-opportunity="BBBUSDT"/);
  assert.match(html,/href="#\/advice"/);
});


test('home batch limits concurrent checks and preserves every result after a failure',async()=>{
  assert.equal(typeof homeModule.runHomeChecks,'function');
  let active=0,peak=0;const progress=[];
  const results=await homeModule.runHomeChecks(['AAAUSDT','BBBUSDT','CCCUSDT'],{check:async symbol=>{
    active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
    if(symbol==='BBBUSDT')throw new Error('離線');return {symbol,status:'LIVE'};
  },onProgress:value=>progress.push(value.completed)});
  assert.equal(peak,2);assert.deepEqual(results.map(r=>[r.symbol,r.ok]),[['AAAUSDT',true],['BBBUSDT',false],['CCCUSDT',true]]);
  assert.deepEqual(progress,[1,2,3]);assert.equal(results[1].error,'離線');
  let calls=0;await assert.rejects(homeModule.runHomeChecks(['AAAUSDT','AAAUSDT'],{check:()=>calls++}));assert.equal(calls,0);
});
