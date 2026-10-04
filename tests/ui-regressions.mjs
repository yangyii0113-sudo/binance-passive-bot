import test from 'node:test';
import assert from 'node:assert/strict';
import * as homeModule from '../src/home_opportunities.js';
import { researchOverview } from '../src/research_overview.js';
import { pages } from '../src/pages.js';
import { appState, setStateSlice } from '../src/state.js';
import { normalizePaperSnapshot } from '../src/services/paper.js';
import { normalizeResultsSnapshot } from '../src/services/results.js';
import { HOME_PREFS_KEY, loadHomePreferences, saveHomePreferences, toggleHomeWatch } from '../src/home_preferences.js';

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
  assert.equal((html.match(/<strong>UNI<\/strong>/g)||[]).length,1);
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
  const {s,now}=homeFixture();s.ui.homeOpportunitySort='strength';const before=structuredClone(s),html=researchOverview(s,now);
  assert.match(html,/data-home-opportunity="AAAUSDT"/);assert.match(html,/data-home-opportunity="BBBUSDT"/);
  assert.doesNotMatch(html,/data-home-opportunity="(?:SPIKE|LOW|DOWN)USDT"/);
  assert.ok(html.indexOf('data-home-opportunity="BBBUSDT"')<html.indexOf('data-home-opportunity="AAAUSDT"'));
  assert.equal(homeModule.homeOpportunities(s,now).rows[0].symbol,'AAAUSDT','configured ranking remains intact beneath plan priority');
  assert.match(html,/data-home-check-symbol="AAAUSDT"/);assert.match(html,/data-agent-advice-symbol="BBBUSDT"/);
  assert.match(html,/動能／流動性排序/);assert.match(html,/進場條件排序/);assert.match(html,/分數不是勝率/);
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

 test('home action cards prioritize gated plans and suppress maps for unsafe evidence',()=>{
 const {s,now}=homeFixture(),html=researchOverview(s,now);
 assert.ok(html.indexOf('data-home-opportunity="BBBUSDT"')<html.indexOf('data-home-opportunity="AAAUSDT"'));
 assert.match(html,/價格位置圖/);assert.match(html,/預估止損損失/);
 assert.match(html,/<details[^>]*data-search="home-evidence-BBBUSDT">/);
 for(const change of [r=>r.snapshotUntil=now,r=>r.historical=true,r=>r.row.symbol='AAAUSDT',r=>delete r.marketSnapshot]){
 const copy=structuredClone(s);change(copy.agents.tradePlans.BBBUSDT);
 assert.doesNotMatch(researchOverview(copy,now),/價格位置圖|預估止損損失/);
 }
});
 test('price maps preserve long and short ordering and do not clamp outside quotes',async()=>{
 const {planPriceMap}=await import('../src/plan_price_map.js');
 const long={side:'LONG',entry:100,stop:90,tp1:110,tp2:120};
 const a=planPriceMap(long,130);assert.ok(a.stop<a.entry&&a.entry<a.tp1&&a.tp1<a.tp2&&a.tp2<a.quote);
 const b=planPriceMap({side:'SHORT',entry:100,stop:110,tp1:90,tp2:80},70);assert.ok(b.quote<b.tp2&&b.tp2<b.tp1&&b.tp1<b.entry&&b.entry<b.stop);
 assert.equal(planPriceMap(long,null).quote,null);
 assert.equal(planPriceMap({...long,stop:105},100),null);
 const same=planPriceMap({...long,tp2:110},100);assert.equal(same.tp1,same.tp2);
});

test('market health matches candidate freshness and escapes upstream errors',async()=>{
  const {marketHealth,marketHealthView}=await import('../src/market_health_view.js');
  const {s,now}=homeFixture();
  assert.equal(marketHealth(s.market,now).key,'fresh');
  for(const patch of [{status:'STALE'},{status:'ERROR'},{updatedAt:new Date(now+1).toISOString()},{updatedAt:new Date(now-100000).toISOString()},{cryptoOnly:false},{contractVerifiedAt:new Date(now-301000).toISOString()}]){
    const market={...s.market,...patch};
    assert.equal(marketHealth(market,now).key,'unavailable');
    assert.equal(homeModule.homeCandidates(market,now).rows.length,0);
    assert.match(marketHealthView(market,now),/不代表市場沒有交易機會/);
  }
  assert.equal(marketHealth({},now).age,null);
  const html=marketHealthView({status:'ERROR',error:new Error('<script>bad</script>')},now);
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});

test('visible condition summaries respect expiry, identity and invalid denominators',async()=>{
  const {strategyConditionSummaryView}=await import('../src/strategy_evidence_view.js');
  const {s,now}=homeFixture(),r=s.agents.tradePlans.BBBUSDT;
  const p=r.row.analysis.strategies[0];
  p.observations={version:'strategy-conditions-v1',closedAt:r.row.analysis.closedAt,close:100,upper:99,lower:90,averageVolume:100,lastVolume:160,volumeRatio:1.6,breakout:true,volumePassed:true};
  assert.match(strategyConditionSummaryView(r,{now}),/1.60 倍／門檻 ≥ 1.50/);
  assert.equal(strategyConditionSummaryView(r,{now:now+60001}),'');
  const mismatch=structuredClone(r);mismatch.row.symbol='AAAUSDT';
  assert.equal(strategyConditionSummaryView(mismatch,{now}),'');
  p.observations.averageVolume=0;
  assert.match(strategyConditionSummaryView(r,{now}),/分項數值待更新/);
});

test('compact monitor retains stop controls, errors and foreground boundary',async()=>{
  const {adviceMonitorView}=await import('../src/advice_monitor_view.js');
  const {s,now}=homeFixture();
  s.adviceMonitor={enabled:true,error:'核對失敗',alerts:[]};s.forward={enabled:true};
  const html=adviceMonitorView(s,now,{compact:true});
  const visible=html.replace(/<details[\s\S]*?<\/details>/g,'');
  assert.match(visible,/data-forward-stop/);assert.match(visible,/核對失敗/);
  assert.match(visible,/沒有離線推播/);assert.match(visible,/data-auto-check-toggle/);
});

test('home expiry and distance reveal separate clocks without resurrecting stale prices',()=>{
  const {s,now}=homeFixture();
  const html=researchOverview(s,now);
  assert.match(html,/行情快照剩 1 分 0 秒/);
  assert.match(html,/收盤策略剩/);
  assert.match(html,/核對時距進場門檻 2.04%/);
  const expired=structuredClone(s);expired.agents.tradePlans.BBBUSDT.snapshotUntil=now;
  const stale=researchOverview(expired,now);
  assert.doesNotMatch(stale,/行情快照剩|核對時距進場門檻/);
});

test('watch filter remains inside fresh top ten and never upgrades entry eligibility',()=>{
  const {s,now}=homeFixture();s.ui.homeWatchedSymbols=['AAAUSDT','OUTSIDEUSDT'];s.ui.homeOpportunityFilter='watch';
  const html=researchOverview(s,now);
  assert.match(html,/data-home-opportunity="AAAUSDT"/);
  assert.doesNotMatch(html,/data-home-opportunity="(?:BBB|OUTSIDE)USDT"/);
  assert.match(html,/尚未核對/);
  s.market.status='STALE';assert.doesNotMatch(researchOverview(s,now),/data-home-opportunity=/);
});

test('home preferences restore only watched symbols and sorting without retaining trading data',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  saveHomePreferences({symbols:['SOLUSDT','幣安人生USDT'],sort:'strength',plans:[{entry:100}],enabled:true},storage);
  assert.deepEqual(JSON.parse(data.get(HOME_PREFS_KEY)),{version:1,symbols:['SOLUSDT','幣安人生USDT'],sort:'strength'});
  assert.deepEqual(loadHomePreferences(storage),{symbols:['SOLUSDT','幣安人生USDT'],sort:'strength',error:null});
});

test('invalid or unavailable saved preferences report the problem and do not overwrite stored data',()=>{
  for(const raw of ['{',JSON.stringify({version:2,symbols:[],sort:'strength'}),JSON.stringify({version:1,symbols:['<script>USDT'],sort:'strength'}),JSON.stringify({version:1,symbols:['SOLUSDT','SOLUSDT'],sort:'strength'})]){
    let writes=0;
    const loaded=loadHomePreferences({getItem:()=>raw,setItem:()=>writes++});
    assert.deepEqual(loaded.symbols,[]);assert.equal(loaded.sort,'readiness');assert.ok(loaded.error);assert.equal(writes,0);
  }
  assert.ok(loadHomePreferences({getItem:()=>{throw new Error('disabled');}}).error);
  assert.throws(()=>saveHomePreferences({symbols:['SOLUSDT'],sort:'readiness'},{setItem:()=>{throw new Error('quota');}}),/僅本次頁面有效/);
});

test('watch list limit never silently replaces an existing symbol and removals free capacity',()=>{
  const symbols=Array.from({length:10},(_,i)=>`COIN${i}USDT`),before=[...symbols];
  assert.throws(()=>toggleHomeWatch(symbols,'EXTRAUSDT'),/最多關注 10 檔/);
  assert.deepEqual(symbols,before);
  const remaining=toggleHomeWatch(symbols,'COIN0USDT');
  assert.equal(remaining.length,9);assert.equal(toggleHomeWatch(remaining,'幣安人生USDT').length,10);
});

test('watch management keeps out-of-ranking symbols removable without adding candidates or stale prices',()=>{
  const {s,now}=homeFixture();s.ui.homeWatchedSymbols=['AAAUSDT','OUTSIDEUSDT'];s.ui.homeOpportunityFilter='watch';
  let html=researchOverview(s,now);
  assert.match(html,/管理關注清單 · 2／10/);assert.match(html,/關注候選 1/);
  assert.match(html,/data-home-watch-symbol="OUTSIDEUSDT"/);assert.match(html,/本輪未入選/);
  assert.doesNotMatch(html,/data-home-opportunity="OUTSIDEUSDT"/);
  s.market.status='STALE';s.ui.homePreferencesError='無法儲存；僅本次頁面有效。';
  html=researchOverview(s,now);
  assert.match(html,/行情待核對/);assert.match(html,/僅本次頁面有效/);
  assert.doesNotMatch(html,/data-home-opportunity=|行情快照剩|核對時距進場門檻/);
});

test('public market failures keep response evidence distinct from unknown network failures',async()=>{
  const {fetchMarketJson}=await import('../src/market_request.js');
  for(const [status,kind] of [[451,'restricted'],[429,'rate'],[418,'rate'],[500,'http']]){
    await assert.rejects(fetchMarketJson('contracts',{fetcher:async()=>({ok:false,status})}),e=>e.marketDiagnostic.kind===kind&&e.marketDiagnostic.httpStatus===status&&e.marketDiagnostic.endpoint==='/fapi/v1/exchangeInfo');
  }
  await assert.rejects(fetchMarketJson('tickers',{fetcher:async()=>{throw new TypeError('Failed to fetch');}}),e=>e.marketDiagnostic.kind==='network'&&e.marketDiagnostic.httpStatus===null&&!e.message.includes('HTTP 451'));
  await assert.rejects(fetchMarketJson('tickers',{fetcher:async()=>{throw Object.assign(new Error(),{name:'TimeoutError'});}}),e=>e.marketDiagnostic.kind==='timeout');
  await assert.rejects(fetchMarketJson('tickers',{fetcher:async()=>({ok:true,status:200,json:async()=>({})})}),e=>e.marketDiagnostic.kind==='payload');
});


test('advice prioritizes analysis and has one shared tracker with visible errors and recovery',()=>{
  const s=state();s.agents.tradePlans={};
  s.adviceMonitor={enabled:true,error:'核對失敗',alerts:[]};
  s.forward={enabled:true,error:'連線失敗',dataError:'紀錄異常',feeds:[{symbol:'BTCUSDT',status:'BLOCKED',reason:'行情中斷'}]};
  const before=structuredClone(s),html=pages.advice(s);
  assert.ok(html.indexOf('id="agent-advice-form"')<html.indexOf('class="advice-monitor"'));
  assert.equal((html.match(/data-forward-stop/g)||[]).length,1);
  assert.doesNotMatch(html,/data-forward-start/);
  assert.match(html,/核對失敗/);assert.match(html,/連線失敗/);assert.match(html,/紀錄異常/);
  assert.match(html,/data-forward-reconnect="BTCUSDT"/);assert.match(html,/href="#\/advice-results"/);
  assert.match(html,/沒有離線推播/);assert.match(html,/不回補/);assert.deepEqual(s,before);
});

test('unavailable home removes empty filters and repeated errors while retaining a retry',()=>{
  const {s,now}=homeFixture();s.market.status='ERROR';
  const reason=homeModule.homeOpportunities(s,now).reason;
  s.adviceMonitor={enabled:true,error:reason,alerts:[]};
  const html=researchOverview(s,now);
  assert.equal(html.split(reason).length-1,1);
  assert.doesNotMatch(html,/aria-label="首頁候選篩選"|aria-label="首頁排序"|今日行動/);
  assert.match(html,/data-home-check-all/);assert.match(html,/data-market-health="unavailable"/);
  assert.ok(html.indexOf('data-home-check-all')<html.indexOf('class="advice-monitor"'));
});

test('surge evidence never converts momentum, stale observations or short plans into a long breakout',async()=>{
 const {surgeEvidence,surgeWatchView}=await import('../src/surge_watch_view.js');
 const {s,now}=homeFixture(),r=s.agents.tradePlans.BBBUSDT,p=r.row.analysis.strategies[0];
 assert.equal(surgeEvidence(r,'BBBUSDT',now).plan,false);
 p.observations={version:'strategy-conditions-v1',closedAt:r.row.analysis.closedAt,close:98,upper:97,lower:90,averageVolume:100,lastVolume:160};
 assert.equal(surgeEvidence(r,'BBBUSDT',now).plan,true);
 assert.equal(surgeEvidence(r,'AAAUSDT',now).plan,false);
 assert.equal(surgeEvidence(r,'BBBUSDT',now+60001).plan,false);
 p.observations.closedAt--;assert.equal(surgeEvidence(r,'BBBUSDT',now).plan,false);p.observations.closedAt++;
 p.observations.averageVolume=0;assert.equal(surgeEvidence(r,'BBBUSDT',now).volume,null);p.observations.averageVolume=100;
 p.observations.lastVolume=140;assert.equal(surgeEvidence(r,'BBBUSDT',now).plan,false);p.observations.lastVolume=160;
 const before=structuredClone(s);surgeWatchView(homeModule.homeOpportunities(s,now),s.agents.tradePlans,now);assert.deepEqual(s,before);
 s.market.status='STALE';assert.doesNotMatch(surgeWatchView(homeModule.homeOpportunities(s,now),s.agents.tradePlans,now),/data-surge-candidate=/);
});

test('hunting focus excludes expired and mismatched records and prioritizes verified evidence',async()=>{
 const {surgeWatchView}=await import('../src/surge_watch_view.js');
 const {s,now}=homeFixture(),r=s.agents.tradePlans.BBBUSDT;
 const o={version:'strategy-conditions-v1',closedAt:r.row.analysis.closedAt,close:98,upper:97,lower:90,averageVolume:100,lastVolume:160};
 r.row.analysis.strategies[0].observations=o;
 let html=surgeWatchView(homeModule.homeOpportunities(s,now),s.agents.tradePlans,now);
 assert.match(html,/data-surge-candidate="BBBUSDT"/);
 assert.ok(html.indexOf('data-surge-candidate="BBBUSDT"')<html.indexOf('data-surge-candidate="AAAUSDT"'));
 r.snapshotUntil=now;
 html=surgeWatchView(homeModule.homeOpportunities(s,now),s.agents.tradePlans,now);
 assert.doesNotMatch(html,/data-surge-candidate="BBBUSDT"/);
 r.snapshotUntil=now+60000;r.row.symbol='AAAUSDT';
 assert.doesNotMatch(surgeWatchView(homeModule.homeOpportunities(s,now),s.agents.tradePlans,now),/data-surge-candidate="BBBUSDT"/);
});

test('focused filters remove duplicate hunting cards and expired plans remove execution levels',()=>{
 const {s,now}=homeFixture();
 let html=researchOverview(s,now);
 assert.match(html,/進場、分批止盈與取消規則/);
 assert.match(html,/第一止盈 110\.00 出場 50%/);
 assert.match(html,/止損維持 <strong>95\.00 USDT/);
 s.ui.homeOpportunityFilter='plan';html=researchOverview(s,now);
 assert.doesNotMatch(html,/data-surge-candidate=/);
 assert.match(html,/data-home-opportunity="BBBUSDT"/);
 s.agents.tradePlans.BBBUSDT.snapshotUntil=now;
 assert.doesNotMatch(researchOverview(s,now),/home-execution-guide|第一止盈 110\.00 出場 50%/);
});


test('action focus shows three unique candidates with valid plans first and keeps the rest accessible',()=>{
 const {s,now}=homeFixture();s.ui.homeOpportunitySort='strength';
 s.market.universeRows.push(['','DDD / USDT','100',2,2e7,74],['','EEE / USDT','100',1,2e7,72]);
 const html=researchOverview(s,now),focus=html.match(/data-action-focus[\s\S]*?<\/div><!-- action-focus-end -->/)?.[0];
 assert.ok(focus,'dedicated action focus');
 assert.equal((focus.match(/data-home-opportunity=/g)||[]).length,3);
 assert.ok(focus.indexOf('BBBUSDT')<focus.indexOf('AAAUSDT'),'eligible plan stays above momentum-only candidates');
 assert.match(html,/<details[^>]*data-search="other-candidates"[^>]*>/);
 assert.doesNotMatch(html,/data-surge-candidate=/);
 for(const symbol of ['AAA','BBB','CCC','DDD','EEE'])assert.equal((html.match(new RegExp('data-home-opportunity="'+symbol+'USDT"','g'))||[]).length,1);
});

test('coin identity only uses reviewed local mappings and keeps the complete unknown symbol',async()=>{
 const {coinLogo,coinIdentity}=await import('../src/coin_logo.js');
 assert.doesNotMatch(coinLogo('1000SOLUSDT'),/<img|https:/,'do not strip contract multipliers into an unrelated logo');
 assert.match(coinLogo('1000SOLUSDT'),/>1000SOL</);
 assert.doesNotMatch(coinLogo('UNKNOWNUSDT'),/<img|https:/);
 assert.match(coinLogo('SOLUSDT'),/coins\/sol.svg/);
 assert.doesNotMatch(coinLogo('SOLUSDT'),/coin-logo-fallback[^>]*hidden/,'identity is visible while image loads');
 assert.match(coinIdentity('SOLUSDT'),/Solana/);
 assert.match(coinIdentity('SOLUSDT'),/>SOL</);
 assert.doesNotMatch(coinLogo('<img onerror=alert(1)>USDT'),/<img/);
});

test('price map spells out all price levels and reverses short price order',async()=>{
 const {planPriceMapView}=await import('../src/plan_price_map.js');
 const long={key:'breakout',side:'LONG',entry:100,stop:95,tp1:110,tp2:120};
 const html=planPriceMapView(long,98);
 for(const text of ['止損','進場門檻','止盈一','止盈二','核對時參考價'])assert.ok(html.includes(text));
 const short=planPriceMapView({...long,side:'SHORT',stop:105,tp1:90,tp2:80},102);
 assert.ok(short.indexOf('data-price-level="tp2"')<short.indexOf('data-price-level="entry"'));
 assert.ok(short.indexOf('data-price-level="entry"')<short.indexOf('data-price-level="stop"'));
 assert.equal(planPriceMapView({...long,stop:101},98),'');
});

test('default advice symbols have exact bundled identity including explicit PEPE multiplier',async()=>{
 const {coinInfo,coinLogo}=await import('../src/coin_logo.js');
 for(const symbol of ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','LINK','AVAX','SUI','LTC','BCH','NEAR','DOT','APT','UNI','TRX','ARB','OP','1000PEPE'])assert.match(coinLogo(symbol+'USDT'),/coin-logo-bundled/,symbol);
 assert.equal(coinInfo('1000PEPEUSDT').ticker,'1000PEPE');
 assert.match(coinInfo('1000PEPEUSDT').name,/1,000/);
 assert.equal(coinInfo('1000SOLUSDT').asset,null);
});

test('priority attention appears only for a fresh eligible plan and never promises a buy',()=>{
 const {s,now}=homeFixture();
 const html=researchOverview(s,now);
 assert.equal((html.match(/data-priority-plan=/g)||[]).length,1);
 assert.match(html,/優先關注/);assert.doesNotMatch(html,/必買|趕快入場|保證獲利/);
 for(const change of [r=>r.snapshotUntil=now,r=>r.historical=true,r=>r.row.symbol='AAAUSDT',r=>delete r.marketSnapshot,r=>r.row.analysis.strategies[0].status='WAIT']){
  const copy=structuredClone(s);change(copy.agents.tradePlans.BBBUSDT);assert.doesNotMatch(researchOverview(copy,now),/data-priority-plan=/);
 }
 s.market.status='STALE';assert.doesNotMatch(researchOverview(s,now),/data-priority-plan=/);
});

test('exchange catalog resolves coins outside default list without guessing multipliers',async()=>{
 const {coinInfo,coinLogo}=await import('../src/coin_logo.js');
 for(const s of ['AAVE','INJ','FIL','WIF','TAO','TRUMP','SHIB','BONK']) assert.match(coinLogo(s+'USDT'),/<img/,s+' must have an actual logo');
 assert.match(coinInfo('AAVEUSDT').name,/Aave/i);
 assert.doesNotMatch(coinLogo('1000SOLUSDT'),/<img/);
});

test('live logo metadata rejects unsafe URLs and accepts newly listed exact assets',async()=>{
 const {mergeCoinCatalog,coinInfo,coinLogo}=await import('../src/coin_logo.js');
 mergeCoinCatalog([{assetCode:'LOGOTESTNEW',assetName:'New coin',logoUrl:'https://bin.bnbstatic.com/image/new.png',test:0},{assetCode:'LOGOTESTBAD',logoUrl:'https://bin.bnbstatic.com.evil.test/a.svg'}]);
 assert.match(coinLogo('LOGOTESTNEWUSDT'),/https:\/\/bin.bnbstatic.com\/image\/new.png/);
 assert.equal(coinInfo('LOGOTESTBADUSDT').logoUrl,null);
});
