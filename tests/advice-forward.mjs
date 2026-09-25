import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyForwardBook, registerForwardAdvice, advanceForward, interruptForward, expireForward, normalizeForwardTick, samplePnl, forwardSummary } from '../src/advice_forward.js';
import { createForwardStore, validateForwardBook, exportForwardBook } from '../src/advice_forward_store.js';
import { createForwardController } from '../src/advice_forward_controller.js';
import { adviceResultsPage } from '../src/advice_forward_view.js';

const H=3600000,now=2400*H+120000;
function record(side='LONG',key='breakout'){
  const p={key,status:'SETUP',side,entry:100,stop:side==='LONG'?95:105,tp1:side==='LONG'?110:90,tp2:side==='LONG'?120:80,signalAt:2400*H-1,expiresAt:2401*H};
  return {symbol:'UNIUSDT',status:'LIVE',checkedAt:now,snapshotUntil:now+60000,row:{symbol:'UNIUSDT',analysis:{status:'VALID',analyzedAt:now,closedAt:p.signalAt,validUntil:p.expiresAt,strategies:['breakout','structured','meanReversion'].map(k=>k===key?p:{key:k,status:'WAIT',reason:'等待條件'})}}};
}
const tick=(id,price,time=now+(id-10)*100)=>({id,price,time,eventTime:time,receivedAt:time});
function setup(side='LONG',key='breakout'){
  const book=emptyForwardBook(),r=record(side,key),feed={startedAt:now-1000,last:tick(10,side==='LONG'?99:101)};
  registerForwardAdvice(book,r,{now,feed});return {book,row:book.rows[0],r,feed};
}
const step=(book,id,price,time)=>advanceForward(book,'UNIUSDT',tick(id,price,time));
function memory(){let raw=null;return {getItem:()=>raw,setItem:(_,s)=>{raw=s;},raw:()=>raw};}

test('long and short forward samples enter only after registration and account for both exit fees',()=>{
  for(const side of ['LONG','SHORT']){
    const {book,row}=setup(side);
    assert.equal(row.status,'PENDING');assert.equal(forwardSummary(book.rows).winRate,null);
    step(book,11,100);assert.equal(row.status,'OPEN');
    step(book,12,side==='LONG'?110:90);assert.equal(row.status,'PARTIAL');
    step(book,13,side==='LONG'?120:80);assert.equal(row.status,'CLOSED');
    validateForwardBook(book);
    const e=row.fills[0],sign=side==='LONG'?1:-1;
    const expected=row.fills.slice(1).reduce((n,f)=>n+sign*(f.price-e.price)*f.qty,0)-row.fills.reduce((n,f)=>n+f.fee,0);
    assert.equal(samplePnl(row),expected);assert.ok(expected>0);assert.equal(forwardSummary(book.rows).closed,1);
    assert.equal(row.fills[1].qty,e.qty/2);assert.equal(row.remaining,0);
    const json=JSON.parse(exportForwardBook(book,now).text);assert.equal(json.canonical,false);assert.equal(json.paperOnly,true);assert.equal(json.realOrderLocked,true);assert.equal(json.noBackfill,true);
  }
});
test('all analysis outcomes are logged and repeated same-hour plans cannot restart failed samples',()=>{
  const {book,r,feed}=setup();assert.equal(registerForwardAdvice(book,r,{now,feed}).length,0);
  interruptForward(book,'斷線',now+1000);assert.equal(registerForwardAdvice(book,r,{now:now+1001,feed}).length,0);
  const waiting=record();waiting.row.analysis.strategies[0].status='WAIT';registerForwardAdvice(book,waiting,{now,feed});
  assert.equal(book.rows[1].status,'NO_SETUP');validateForwardBook(book);
  assert.equal(forwardSummary(book.rows).gap,1);assert.equal(forwardSummary(book.rows).closed,0);
});
test('missing feed, already touched levels and price gaps never create an entry',()=>{
  const cases=[null,{startedAt:now-1,last:tick(10,101)},{startedAt:now+1,last:tick(10,99)},{startedAt:now-1,last:tick(10,99),barOpen:2400*H,high:100,low:98}];
  for(const feed of cases){const book=emptyForwardBook();registerForwardAdvice(book,record(),{now,feed});assert.notEqual(book.rows[0].status,'PENDING');assert.equal(book.rows[0].fills.length,0);validateForwardBook(book);}
  const {book,row}=setup();step(book,11,100.1);assert.equal(row.status,'CANCELLED');assert.equal(row.fills.length,0);
});
test('dropped, delayed, duplicate and out-of-order ticks cannot be silently filled',()=>{
  const {book,row}=setup();step(book,10,99,now);assert.equal(row.events.length,2);
  step(book,12,100);assert.equal(row.status,'GAP');step(book,13,120);assert.equal(row.fills.length,0);
  for(const change of [{T:now-3001,E:now},{a:-1},{s:'SOLUSDT'},{p:'NaN'},{st:2},{T:-1}])assert.throws(()=>normalizeForwardTick({e:'aggTrade',s:'UNIUSDT',a:1,p:'100',T:now,E:now,...change},'UNIUSDT',now));
  assert.equal(normalizeForwardTick({e:'aggTrade',s:'UNIUSDT',a:1,p:'100',T:now,E:now,st:1},'UNIUSDT',now).price,100);
  const q=setup();step(q.book,11,100);step(q.book,12,94,now+11000);assert.equal(q.row.status,'GAP');assert.equal(samplePnl(q.row),null);
});
test('loss of coverage takes precedence over pending expiry; uninterrupted expiry creates no fill',()=>{
  const a=setup();expireForward(a.book,now+60000);assert.equal(a.row.status,'GAP');
  const b=setup();for(let i=11;i<=70;i++)step(b.book,i,99,now+(i-10)*1000);
  assert.equal(b.row.status,'EXPIRED');assert.equal(b.row.fills.length,0);validateForwardBook(b.book);
});
test('stops use worse observed price; all-in TP1/TP2 and structured next-bar protection are deterministic',()=>{
  const a=setup();step(a.book,11,100);step(a.book,12,93);assert.equal(a.row.status,'CLOSED');assert.equal(a.row.fills[1].rawPrice,93);assert.ok(samplePnl(a.row)<-2.5);
  const b=setup();step(b.book,11,100);step(b.book,12,125);assert.equal(b.row.status,'CLOSED');assert.deepEqual(b.row.fills.map(f=>f.rawPrice),[100,110,120]);
  const c=setup('LONG','structured');step(c.book,11,100);step(c.book,12,110);assert.equal(c.row.stop,95);
  const boundary=2401*H;
  // Continuous synthetic ticks are test-only; no history replay exists in the controller.
  let id=13;for(let time=now+1000;time<boundary;time+=9000)step(c.book,id++,105,time);
  step(c.book,id++,105,boundary);assert.equal(c.row.protected,true);assert.ok(c.row.stop>100);
  step(c.book,id++,100,boundary+100);assert.equal(c.row.status,'CLOSED');validateForwardBook(c.book);
});
test('time exit uses the first continuously observed tick at the 48-bar deadline',()=>{
  const {book,row}=setup();step(book,11,100);
  // Move only the clock cursor in this isolated boundary fixture, not a runtime restoration path.
  row.cursor=tick(12,102,row.deadline-100);step(book,13,102,row.deadline);
  assert.equal(row.status,'CLOSED');assert.equal(row.fills[1].kind,'TIME');validateForwardBook(book);
});
test('storage reload, corruption, quota, conflicting writers and malformed PnL fail closed',()=>{
  const storage=memory(),store=createForwardStore(storage),book=store.load();
  const {r,feed}=setup();registerForwardAdvice(book,r,{now,feed});store.save(book);
  const restored=createForwardStore(storage).load();assert.equal(restored.rows[0].status,'PENDING');
  interruptForward(restored,'重整',now+10);store.save(restored);assert.equal(createForwardStore(storage).load().rows[0].status,'GAP');
  storage.setItem('', '{bad');assert.throws(()=>store.load());assert.equal(storage.raw(),'{bad');assert.throws(()=>store.save(book));
  const quota=createForwardStore({getItem:()=>null,setItem:()=>{throw new Error('quota');}});const q=quota.load();assert.throws(()=>quota.save(q),/未保存/);
  const shared=memory(),one=createForwardStore(shared),two=createForwardStore(shared),b1=one.load(),b2=two.load();one.save(b1);assert.throws(()=>two.save(b2),/另一個頁面/);
  const a=setup();step(a.book,11,100);step(a.book,12,120);a.row.fills[1].fee=0;assert.throws(()=>validateForwardBook(a.book));
});

function controllerHarness(storage=memory(),locks={request:(_name,_opts,fn)=>Promise.resolve(fn({}))}){
  const sockets=[];let time=now,visible=true,watchdog;
  class WS{constructor(url){this.url=url;this.closed=false;sockets.push(this);}close(){this.closed=true;}send(id,price){this.onmessage?.({data:JSON.stringify({e:'aggTrade',s:'UNIUSDT',a:id,p:String(price),T:time,E:time,st:1})});}}
  const c=createForwardController({storage,locks,WebSocketClass:WS,clock:()=>time,visible:()=>visible,interval:fn=>{watchdog=fn;return 1;},cancelInterval:()=>{}});
  return {c,storage,sockets,time:t=>{time=t;},hide:()=>{visible=false;},watchdog:()=>watchdog()};
}
test('controller starts an isolated stream, records new analysis, closes on hidden, and never restores entries',async()=>{
  const h=controllerHarness();h.c.load();await h.c.start();h.c.watchSymbol('UNIUSDT');
  assert.equal(h.sockets[0].url,'wss://fstream.binance.com/market/ws/uniusdt@aggTrade');
  h.sockets[0].send(10,99);h.c.register(record());assert.equal(h.c.view().book.rows[0].status,'PENDING');
  h.time(now+100);h.sockets[0].send(11,100);assert.equal(h.c.view().book.rows[0].status,'OPEN');
  h.hide();h.watchdog();assert.equal(h.c.view().book.rows[0].status,'GAP');assert.equal(h.c.view().enabled,false);assert.equal(h.sockets[0].closed,true);
  const fresh=controllerHarness(h.storage);fresh.c.load();await fresh.c.start();assert.equal(fresh.c.view().book.rows[0].status,'GAP');assert.equal(fresh.sockets.length,0);fresh.c.stop();
});
test('controller restart invalidates uncompleted persisted rows; unsupported locks and quota never enable',async()=>{
  const a=controllerHarness();await a.c.start();a.c.watchSymbol('UNIUSDT');a.sockets[0].send(10,99);a.c.register(record());
  const b=controllerHarness(a.storage);b.c.load();await b.c.start();assert.equal(b.c.view().book.rows[0].status,'GAP');b.c.stop();a.c.storageChanged(null);assert.equal(a.c.view().enabled,false);
  for(const h of [controllerHarness(memory(),{}),controllerHarness(memory(),{request:(_n,_o,fn)=>Promise.resolve(fn(null))}),controllerHarness({getItem:()=>null,setItem:()=>{throw new Error('quota');}})]){await h.c.start();assert.equal(h.c.view().enabled,false);assert.ok(h.c.view().error);}
});
test('controller blocks stale feed before expiry and does not reconnect or backfill',async()=>{
  const h=controllerHarness();await h.c.start();h.c.watchSymbol('UNIUSDT');h.sockets[0].send(10,99);h.c.register(record());
  h.time(now+60000);h.watchdog();assert.equal(h.c.view().book.rows[0].status,'GAP');assert.equal(h.sockets.length,1);assert.equal(h.c.view().feeds[0].status,'BLOCKED');h.c.stop();
});
test('analyses begun before activation or a prior session are not silently admitted',async()=>{
  const h=controllerHarness(),before=h.c.ticket();await h.c.start();h.c.watchSymbol('UNIUSDT');h.sockets[0].send(10,99);
  h.c.register(record(),before);assert.equal(h.c.view().book.rows.length,0);
  const old=h.c.ticket();h.c.stop();await h.c.start();h.c.register(record(),old);assert.equal(h.c.view().book.rows.length,0);
  h.c.register({...record(),historical:true});assert.equal(h.c.view().book.rows.length,0);h.c.stop();
});
test('performance UI preserves missing outcomes, escapes records, and has no order controls',()=>{
  const a=setup();interruptForward(a.book,'斷線 <script>',now+100);
  const state={forward:{book:a.book,enabled:false}},before=structuredClone(state),html=adviceResultsPage(state);
  assert.match(html,/尚無足夠證據/);assert.match(html,/結案勝率<\/span>\s*<strong>—/);
  assert.match(html,/資料中斷 · 待覆核/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|data-paper-open|data-paper-close|data-real-order/);
  assert.match(html,/真實下單鎖定/);assert.deepEqual(state,before);
});
