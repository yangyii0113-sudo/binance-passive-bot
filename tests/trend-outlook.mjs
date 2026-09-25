import test from 'node:test';
import assert from 'node:assert/strict';
import { candleOpenAt, nextCandleOpen, frameOutlookEvidence, buildTrendOutlook, OUTLOOK_TTL } from '../src/trend_outlook.js';
import { trendOutlookView } from '../src/trend_outlook_view.js';
import { analyzeMultiTimeframe } from '../src/multi_timeframe.js';

const now=Date.parse('2026-09-25T03:17:00Z');
const intervals=['15m','1h','4h','12h','1d','1w','1M'];
function bars(interval,at=now,count=60){
  let end=candleOpenAt(at,interval),times=[];
  for(let i=0;i<count;i++){
    let open;
    if(interval==='1M'){const d=new Date(end);open=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1);}
    else open=end-(nextCandleOpen(end,interval)-end);
    times.unshift(open);end=open;
  }
  return times.map((openTime,i)=>({openTime,closeTime:nextCandleOpen(openTime,interval)-1,open:100+i,high:102+i,low:99+i,close:101+i,volume:100}));
}
function fixture(bias='bull'){
  const frames=intervals.map(interval=>({interval,status:'LIVE',source:'Binance USD-M public klines',last:bias==='bull'?160:80,ema20:140,ema50:bias==='bull'?130:150,closedAt:bars(interval).at(-1).closeTime,outlook:frameOutlookEvidence(bars(interval),interval,now)}));
  return {technical:{symbol:'UNIUSDT',status:'LIVE',updatedAt:new Date(now).toISOString(),frames},record:{symbol:'UNIUSDT',status:'LIVE',checkedAt:now}};
}
test('evidence requires continuous latest closed OHLCV without filling or mutating inputs',()=>{
  const valid=bars('1h'),before=structuredClone(valid),e=frameOutlookEvidence(valid,'1h',now);
  assert.equal(e.status,'VALID');assert.equal(e.rangeHigh,160);assert.equal(e.rangeLow,138);assert.equal(e.relativeVolume,1);assert.equal(e.atr,3);
  assert.deepEqual(valid,before);
  for(const mutate of [b=>b.splice(20,1),b=>b[20]=b[19],b=>b[20].close=NaN,b=>b[20].high=1,b=>b[20].volume=-1,b=>b.at(-1).closeTime=now+1000,b=>b.pop(),b=>b[20].openTime+=1]){
    const broken=bars('1h');mutate(broken);assert.equal(frameOutlookEvidence(broken,'1h',now).status,'BLOCKED');
  }
  assert.equal(frameOutlookEvidence(bars('1h',now,54),'1h',now).status,'BLOCKED');
});
test('calendar boundaries honor UTC Mondays and real calendar months',()=>{
  assert.equal(new Date(candleOpenAt(now,'1w')).toISOString(),'2026-09-21T00:00:00.000Z');
  const feb=Date.parse('2024-02-01T00:00:00Z');
  assert.equal(new Date(nextCandleOpen(feb,'1M')).toISOString(),'2024-03-01T00:00:00.000Z');
  for(const interval of intervals)assert.equal(frameOutlookEvidence(bars(interval),interval,now).status,'VALID');
});
test('horizons distinguish agreement and divergence without using numeric scores as probabilities',()=>{
  for(const [bias,expected] of [['bull','多頭同向'],['bear','空頭同向']]){
    const {technical,record}=fixture(bias),before=structuredClone(technical);
    const result=buildTrendOutlook(technical,record,now);
    assert.ok(result.horizons.every(h=>h.trend===expected));assert.deepEqual(technical,before);
    assert.equal(result.winProbability,undefined);
  }
  const {technical,record}=fixture();
  Object.assign(technical.frames[0],{last:100,ema20:120,ema50:140,score:99,direction:'偏多'});
  assert.equal(buildTrendOutlook(technical,record,now).horizons[0].trend,'週期分歧');
});
test('missing, duplicate, stale, historical, mismatched and spot data cannot become horizon advice',()=>{
  for(const mutate of [t=>t.frames=t.frames.filter(f=>f.interval!=='1h'),t=>t.frames.push(t.frames.find(f=>f.interval==='1h')),t=>t.frames.find(f=>f.interval==='1h').source='Binance Spot public klines · fallback',t=>t.frames.find(f=>f.interval==='1h').outlook.status='BLOCKED',t=>t.updatedAt=new Date(now+1).toISOString(),t=>t.historical=true]){
    const {technical,record}=fixture();mutate(technical);assert.equal(buildTrendOutlook(technical,record,now).horizons[0].status,'BLOCKED');
  }
  const {technical,record}=fixture();
  for(const [t,r,at] of [[technical,record,now+OUTLOOK_TTL],[technical,{...record,symbol:'ETHUSDT'},now],[technical,{...record,status:'LOADING'},now]])assert.ok(buildTrendOutlook(t,r,at).horizons.every(h=>h.status==='BLOCKED'));
  const at=Date.parse('2026-09-25T03:16:00Z');
  const t={...technical,updatedAt:new Date(at).toISOString()};
  assert.equal(buildTrendOutlook(t,record,Date.parse('2026-09-25T03:20:00Z')).horizons[0].status,'VALID');
  assert.equal(buildTrendOutlook(t,record,Date.parse('2026-09-25T03:30:00Z')).horizons[0].status,'BLOCKED');
});
test('rendered outlook names uncertainty and never presents reference ranges as validated order levels',()=>{
  const {technical,record}=fixture();
  const html=trendOutlookView(technical,record,{now});
  for(const label of ['短線','中期','長期','上行情境','下行情境','整理情境','失效／重新評估','不是進場、止盈或止損','尚未有此持有週期的獨立進出場驗證','未計算勝率','不驗證本報告的預測能力'])assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/decision-levels|data-real-order|data-paper-open/);
  assert.doesNotMatch(html,/undefined/);
  for(const period of ['1 小時','4 小時','日線'])assert.ok(html.includes(`${period}的前 20 根區間`),period);
  assert.doesNotMatch(trendOutlookView(technical,record,{now:now+OUTLOOK_TTL}),/上行情境|160 USDT/);
  assert.doesNotMatch(trendOutlookView(technical,record,{now,filter:'position'}),/data-outlook="intraday"/);
  assert.match(trendOutlookView({...technical,symbol:'<script>'},record,{now}),/&lt;script&gt;/);
});
test('live multi-timeframe fetch attaches verified evidence but does not reuse open bars',async()=>{
  const previous=globalThis.fetch,at=Date.now();
  globalThis.fetch=async url=>{
    const interval=new URL(url).searchParams.get('interval');
    const data=bars(interval,at).map(c=>[c.openTime,''+c.open,''+c.high,''+c.low,''+c.close,''+c.volume,c.closeTime]);
    const open=candleOpenAt(at,interval);data.push([open,'1','99999','1','99999','99999',nextCandleOpen(open,interval)-1]);
    return {ok:true,json:async()=>data};
  };
  try{const t=await analyzeMultiTimeframe('UNIUSDT');assert.ok(t.frames.every(f=>f.outlook.status==='VALID'));assert.ok(t.frames.every(f=>f.last===160));}
  finally{globalThis.fetch=previous;}
});
