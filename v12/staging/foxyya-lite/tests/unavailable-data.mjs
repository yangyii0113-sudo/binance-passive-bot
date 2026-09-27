import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyPaperSnapshot, emptyResultsSnapshot } from '../src/contracts.js';
import { normalizePaperSnapshot, loadPaperSnapshot } from '../src/services/paper.js';
import { normalizeResultsSnapshot, loadResultsSnapshot } from '../src/services/results.js';
import { resetRuntimeBridgeForTests } from '../src/services/runtime.js';
import { ordersPage, resultsPage, strategyLabPage, strategiesPage } from '../src/pages.js';
import { appState } from '../src/state.js';

const state = (paper, results) => ({ ...appState, paper, results });
const zeroPaper = () => normalizePaperSnapshot({summary:{nav:0,cash:0,openPositions:0,pendingOrders:0,unrealizedPnl:0,portfolioRiskPct:0}});
const zeroResults = () => normalizeResultsSnapshot({schema:'foxyya-runtime-snapshot/1',trades:[]});

test('missing account data remains unknown through renderers, including the lab', () => {
  const paper = emptyPaperSnapshot(), results = emptyResultsSnapshot();
  assert.ok(Object.values(paper.summary).every(v => v === null));
  assert.ok(Object.values(results.summary).every(v => v === null));
  const s = state(paper, results);
  for (const html of [ordersPage(s), resultsPage(s), strategyLabPage({...s, ui:{...s.ui,labTab:'paper'}})]) {
    assert.doesNotMatch(html, /\$100,000|\$0|0\.00%|<strong>0<\/strong>|>null<|>undefined</);
    assert.match(html, /正式交易帳本尚未驗證/);
  }
});

test('HTTP and invalid payload failures never create account values or freshness', async () => {
  const original = globalThis.fetch;
  try {
    for (const failure of ['404','503','offline','json','shape']) {
      resetRuntimeBridgeForTests();
      globalThis.fetch = async () => {
        if(failure === 'offline') throw new Error('offline');
        return {status:Number(failure)||200,ok:!['404','503'].includes(failure),json:async()=>{
          if(failure === 'json') throw new SyntaxError('invalid JSON');
          return {};
        }};
      };
      const [paper, results] = await Promise.all([loadPaperSnapshot(),loadResultsSnapshot()]);
      for(const snapshot of [paper,results]) {
        assert.equal(snapshot.status, failure === '404' ? 'EMPTY' : 'ERROR',failure);
        assert.equal(snapshot.updatedAt,null,failure);
        assert.ok(Object.values(snapshot.summary).every(v=>v===null),failure);
      }
    }
  } finally { globalThis.fetch=original;resetRuntimeBridgeForTests(); }
});

test('partial runtime data cannot use initial NAV or absent collections as evidence', () => {
  const snapshot=normalizePaperSnapshot({schema:'foxyya-runtime-snapshot/1',initial_nav_usdt:1000,books:{'5x':{}}});
  assert.ok(Object.values(snapshot.summary).every(v=>v===null));
  assert.equal(snapshot.updatedAt,null);
  assert.throws(()=>normalizePaperSnapshot({schema:'foxyya-runtime-snapshot/1'}));
  assert.throws(()=>normalizeResultsSnapshot({schema:'foxyya-runtime-snapshot/1'}));
  assert.throws(()=>normalizePaperSnapshot([]));
});

test('blank, boolean and object fields are not real zero metrics', () => {
  for(const value of [null,undefined,'',' ',false,{},[]]) {
    assert.equal(normalizePaperSnapshot({summary:{nav:value,cash:value}}).summary.nav,null);
    assert.equal(normalizeResultsSnapshot({summary:{netPnl:value,trades:value}}).summary.netPnl,null);
  }
});

test('one missing trade outcome invalidates dependent aggregates', () => {
  const results=normalizeResultsSnapshot({schema:'foxyya-runtime-snapshot/1',trades:[
    {closed:true,net_pnl_usdt:20,realized_r:1}, {closed:true,net_pnl_usdt:null,realized_r:null}
  ]});
  assert.equal(results.summary.trades,2);
  for(const key of ['netPnl','winRatePct','profitFactor','expectancyR']) assert.equal(results.summary[key],null,key);
});

test('actual reported zero stays visible without claiming canonical verification', () => {
  const paper=zeroPaper(),results=zeroResults();
  assert.equal(paper.local,false);
  assert.equal(paper.summary.nav,0);
  assert.equal(results.summary.trades,0);
  assert.equal(results.summary.netPnl,0);
  assert.match(ordersPage(state(paper,results)),/\$0/);
  assert.match(ordersPage(state(paper,results)),/正式交易帳本尚未驗證/);
});

test('non-LIVE account states hide old values and stale trade rows on every financial page', () => {
  for(const status of ['ERROR','STALE','EMPTY','LOADING']) {
    const paper={...zeroPaper(),status,summary:{...zeroPaper().summary,nav:987654}};
    const results={...zeroResults(),status,summary:{...zeroResults().summary,netPnl:987654},recentTrades:[{symbol:'OLDUSDT',netPnl:987654}]};
    const s=state(paper,results);
    for(const html of [ordersPage(s),resultsPage(s),strategyLabPage({...s,ui:{...s.ui,labTab:'paper'}})])
      assert.doesNotMatch(html,/987,654|OLDUSDT|\$0|<strong>0<\/strong>/,status);
  }
});

test('missing trade PnL is rendered as unknown rather than a zero gain', () => {
  const results=normalizeResultsSnapshot({schema:'foxyya-runtime-snapshot/1',trades:[{closed:true,symbol:'TESTUSDT',net_pnl_usdt:null}]});
  assert.doesNotMatch(resultsPage(state(zeroPaper(),results)),/\$0|class="up"|class="down"/);
});

test('existing local simulation remains explicit and keeps its real balances after runtime outage', async () => {
  const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage;
  const data=new Map([['foxyya.paper.local.v1',JSON.stringify({cash:12345,createdAt:'2026-09-27T00:00:00Z',positions:[],trades:[]})]]);
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
  globalThis.fetch=async()=>({status:404,ok:false});
  resetRuntimeBridgeForTests();
  try {
    const paper=await loadPaperSnapshot({marketRows:[['₿','BTC / USDT','60000',0]]});
    const results=await loadResultsSnapshot({allowLocal:true});
    assert.equal(paper.local,true);
    assert.equal(paper.summary.cash,12345);
    assert.equal(results.local,true);
    const html=ordersPage(state(paper,results));
    assert.match(html,/本機模擬/);
    assert.match(html,/12,345/);
    assert.match(html,/正式交易帳本尚未驗證/);
  } finally {globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage;resetRuntimeBridgeForTests();}
});

test('reported positive counts with missing details never claim empty holdings or no trades', () => {
  const paper=normalizePaperSnapshot({summary:{openPositions:2}});
  const results=normalizeResultsSnapshot({summary:{trades:3}});
  const s=state(paper,results);
  assert.doesNotMatch(ordersPage(s),/零持倉|沒有模擬持倉/);
  assert.doesNotMatch(resultsPage(s),/尚無已平倉交易/);
});

test('strategy risk and playbook panels do not turn unavailable holdings into zero', () => {
  for(const agentKey of ['risk','playbook']) {
    for(const status of ['EMPTY','STALE']) {
      const paper={...zeroPaper(),status,summary:{...zeroPaper().summary,openPositions:987}};
      const s=state(paper,emptyResultsSnapshot());
      const html=strategiesPage({...s,ui:{...s.ui,strategyWorkspace:'agents',agentKey}});
      assert.doesNotMatch(html,/<span>持倉<\/span><strong>(0|987)<\/strong>/);
    }
  }
});

test('strategy review does not diagnose missing ratios as losses or count stale samples', () => {
  const results=normalizeResultsSnapshot({summary:{trades:3}});
  const s=state(emptyPaperSnapshot(),results);
  const view=status=>strategiesPage({...s,results:{...results,status},ui:{...s.ui,strategyWorkspace:'review'}});
  assert.doesNotMatch(view('LIVE'),/勝率低於|獲利因子低於|未觸發基礎警示/);
  assert.doesNotMatch(view('STALE'),/[03] 筆已平倉/);
});

test('trade review keeps missing outcomes unknown and hides stale rows', () => {
  const results=normalizeResultsSnapshot({schema:'foxyya-runtime-snapshot/1',trades:[{closed:true,symbol:'GAPUSDT',net_pnl_usdt:null}]});
  const s=state(emptyPaperSnapshot(),results);
  const view=status=>strategiesPage({...s,results:{...results,status},ui:{...s.ui,strategyWorkspace:'agents',agentKey:'review',agentFilter:'all'}});
  assert.doesNotMatch(view('LIVE'),/\$0|Trade Review · 獲利交易|Trade Review · 虧損交易/);
  assert.doesNotMatch(view('STALE'),/GAPUSDT/);
});
