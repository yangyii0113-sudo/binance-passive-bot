import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { ResearchStore } from '../research-service/store.mjs';
import { ResearchEngine } from '../research-service/engine.mjs';
import { ResearchRunner } from '../research-service/runner.mjs';
import { researchHttp } from '../research-service/http.mjs';

const H=3600000,BASE=2400*H+120000;
function record(now=BASE){
  const p={key:'breakout',status:'SETUP',side:'LONG',entry:100,stop:95,tp1:110,tp2:120,signalAt:2400*H-1,expiresAt:2401*H};
  return {symbol:'UNIUSDT',status:'LIVE',checkedAt:now,snapshotUntil:now+60000,marketSnapshot:{price:98,high:99,low:97,barOpen:2400*H,requestedAt:now,receivedAt:now},row:{symbol:'UNIUSDT',analysis:{status:'VALID',analyzedAt:now,closedAt:p.signalAt,validUntil:p.expiresAt,strategies:['breakout','structured','meanReversion'].map(k=>k===p.key?p:{key:k,status:'WAIT',reason:'等待條件'})}}};
}
function harness(t,options={}){
  const dir=mkdtempSync(join(tmpdir(),'foxyya-research-test-'));let time=BASE;
  const store=new ResearchStore(dir,options),engine=new ResearchEngine(store,{clock:()=>time});
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const gen=engine.begin('UNIUSDT');
  const send=(id,price,extra={})=>engine.tick('UNIUSDT',gen,{e:'aggTrade',s:'UNIUSDT',a:id,p:String(price),T:time,E:time,...extra});
  send(10,99);
  return {dir,store,engine,gen,send,now:()=>time,advance:(n=100)=>{time+=n;},set:n=>{time=n;},register:()=>engine.register(record(time),gen)};
}
test('durable continuous observations close a sample with existing costs; history is separate from live book',t=>{
  const h=harness(t);h.register();h.advance();h.send(11,100);h.advance();h.send(12,110);h.advance();h.send(13,120);
  assert.equal(h.engine.book.rows.length,0);const out=h.store.snapshot();
  assert.equal(out.summary.closed,1);assert.ok(out.summary.netPnl>0);assert.equal(out.canonical,false);
  assert.deepEqual(out.rows[0].fills.map(f=>f.kind),['ENTRY','TP1','TP2']);
  const events=h.store.db.prepare('SELECT payload FROM journal').all().map(x=>JSON.parse(x.payload));
  assert.equal(events.filter(x=>x.kind==='TICK').length,3);
  assert.equal(events.find(x=>x.kind==='TICK').data.tick.eventTime,BASE+100);
  h.store.verify();
});
test('restart interrupts unfinished rows and permanent identities prevent a repeated same-signal fill',t=>{
  const h=harness(t);h.register();h.advance();h.send(11,100);h.store.close();h.advance(1000);
  const reopened=new ResearchStore(h.dir);t.after(()=>reopened.close());
  const next=new ResearchEngine(reopened,{clock:h.now});
  assert.equal(reopened.snapshot().rows[0].status,'GAP');assert.equal(reopened.snapshot().summary.closed,0);
  const gen=next.begin('UNIUSDT');next.tick('UNIUSDT',gen,{e:'aggTrade',s:'UNIUSDT',a:100,p:'99',T:h.now(),E:h.now()});
  assert.equal(next.register(record(h.now()),gen).length,0);assert.equal(reopened.snapshot().rows.length,1);
  next.stop();reopened.close();
});
test('duplicates do not append fills; gaps, out-of-order and delayed trades cannot create earnings',t=>{
  const h=harness(t);h.register();const sequence=h.store.seq;
  h.send(10,99);assert.equal(h.store.seq,sequence);
  h.advance();h.send(12,100);assert.equal(h.store.snapshot().rows[0].status,'GAP');
  h.advance();h.send(13,120);assert.equal(h.store.snapshot().summary.closed,0);
});
test('out-of-order and invalid delayed ticks block the feed and preserve the sample as GAP',async t=>{
  for(const kind of ['old','delayed'])await t.test(kind,t=>{
    const h=harness(t);h.register();h.advance();
    if(kind==='old')h.send(9,100);else h.send(11,100,{T:h.now()-4000});
    assert.equal(h.store.snapshot().rows[0].status,'GAP');assert.equal(h.engine.health().feeds[0].status,'BLOCKED');
  });
});
test('coverage timeout wins over expiry and a newer feed rejects an older analysis generation',t=>{
  const h=harness(t);h.register();h.advance(11000);h.engine.heartbeat();
  assert.equal(h.store.snapshot().rows[0].status,'GAP');
  const next=h.engine.begin('UNIUSDT');assert.notEqual(next,h.gen);
  assert.deepEqual(h.engine.register(record(h.now()),h.gen),[]);
});
test('failure to persist a triggering trade is atomic and latches the engine closed',t=>{
  let fail=false;const h=harness(t,{beforeWrite:()=>{if(fail)throw new Error('EIO');}});
  h.register();const seq=h.store.seq;fail=true;h.advance();assert.throws(()=>h.send(11,100),/EIO/);
  assert.equal(h.engine.health().status,'BLOCKED');assert.equal(h.store.seq,seq);
  assert.equal(h.store.snapshot().rows[0].status,'PENDING');assert.equal(h.store.snapshot().rows[0].fills.length,0);
  assert.equal(h.send(12,120),false);fail=false;assert.throws(()=>h.store.commit('TEST',{}),/latched/);
});
test('actual SQLite capacity failure rolls back the event and latches storage',t=>{
  const h=harness(t);const seq=h.store.seq;
  const pages=h.store.db.prepare('PRAGMA page_count').get().page_count;
  h.store.db.exec(`PRAGMA max_page_count=${pages}`);
  assert.throws(()=>h.store.commit('OVERSIZED',{data:'x'.repeat(1024*1024)}));
  assert.equal(h.store.db.prepare('SELECT seq FROM meta').get().seq,seq);assert.equal(h.store.failed,true);
  h.store.verify();
});
test('journal edits, tail removal and sample projection tampering fail closed on reopening',async t=>{
  for(const sql of ["UPDATE journal SET payload='{}' WHERE seq=1",'DELETE FROM journal WHERE seq=(SELECT MAX(seq) FROM journal)',"UPDATE samples SET body='{}'"])await t.test(sql,t=>{
    const h=harness(t);h.register();h.store.db.exec(sql);h.store.close();
    assert.throws(()=>new ResearchStore(h.dir),/mismatch|incomplete|Invalid/);
  });
});
test('a different database is never initialized or replaced',t=>{
  const dir=mkdtempSync(join(tmpdir(),'foxyya-other-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'research-v1.sqlite'),db=new DatabaseSync(path);db.exec('CREATE TABLE existing(value TEXT); INSERT INTO existing VALUES(\'preserve\')');db.close();
  assert.throws(()=>new ResearchStore(dir),/Not an independent/);
  const check=new DatabaseSync(path);assert.equal(check.prepare('SELECT * FROM existing').get().value,'preserve');check.close();
});
test('SQLite writer lock rejects another writer, including a second process; crash releases the lock',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'foxyya-lock-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const module=new URL('../research-service/store.mjs',import.meta.url).href;
  const code=`import {ResearchStore} from ${JSON.stringify(module)};new ResearchStore(${JSON.stringify(dir)});console.log('READY');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGKILL'));
  await once(child.stdout,'data');assert.throws(()=>new ResearchStore(dir),/locked/);
  const ended=once(child,'exit');child.kill('SIGKILL');await ended;
  const next=new ResearchStore(dir);next.commit('AFTER_CRASH',{});next.close();
});
test('read-only API distinguishes process liveness from data readiness and never exposes canonical endpoints',async t=>{
  const h=harness(t),runner={scan:{status:'WAITING'},fault:()=>{}};
  const server=researchHttp(h.engine,runner);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/healthz')).status,200);assert.equal((await fetch(base+'/readyz')).status,503);
  runner.scan={status:'COMPLETE',completedAt:h.now()};assert.equal((await fetch(base+'/readyz')).status,200);
  assert.equal((await fetch(base+'/api/research/snapshot',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/api/runtime/snapshot')).status,404);
  assert.equal((await fetch(base+'/research-v1.sqlite')).status,404);
  h.engine.fatal='test disk failure';const response=await fetch(base+'/api/research/snapshot');assert.equal(response.status,503);
  const data=await response.json();assert.equal(data.summary,null);assert.deepEqual(data.rows,[]);
});
test('stale socket callbacks cannot disconnect the replacement feed',t=>{
  const h=harness(t);h.engine.block('UNIUSDT',h.gen,'test gap');
  const sockets=[];class WS{constructor(){sockets.push(this);}close(){this.closed=true;}}
  const r=new ResearchRunner(h.engine,{WebSocketClass:WS,clock:h.now});r.connect('UNIUSDT');
  const staleClose=sockets[0].onclose,staleMessage=sockets[0].onmessage;
  h.engine.block('UNIUSDT',h.engine.feeds.get('UNIUSDT').generation,'second gap');r.connect('UNIUSDT');
  staleClose();staleMessage({data:'{}'});assert.notEqual(sockets[1].closed,true);
  assert.equal(h.engine.feeds.get('UNIUSDT').status,'CONNECTING');r.stop();
});
test('failed market scan creates no invented candidates, plans or historical fills',async t=>{
  const h=harness(t);const runner=new ResearchRunner(h.engine,{market:async()=>{throw new Error('unavailable');},clock:h.now});
  await runner.scanNow();assert.equal(runner.scan.status,'BLOCKED');assert.equal(h.store.snapshot().rows.length,0);runner.stop();
});
test('runner uses current strong candidates and registers analysis only after live coverage',async t=>{
  const h=harness(t);let analyses=0;
  const market=async()=>({status:'LIVE',cryptoOnly:true,updatedAt:new Date(h.now()).toISOString(),contractVerifiedAt:new Date(h.now()).toISOString(),universeRows:[['U','UNI / USDT','99',5,20000000,90]]});
  const r=new ResearchRunner(h.engine,{market,analyze:async symbol=>{assert.equal(symbol,'UNIUSDT');analyses++;return record(h.now());},clock:h.now});
  await r.scanNow();assert.equal(analyses,1);assert.equal(r.scan.status,'COMPLETE');assert.equal(h.store.snapshot().rows[0].status,'PENDING');r.stop();
});
test('scheduler observes one current hour after a long outage and retries unavailable data without replay',async t=>{
  const h=harness(t);let calls=0;
  const r=new ResearchRunner(h.engine,{market:async()=>{calls++;throw new Error('offline');},clock:h.now});
  r.lastHour=Math.floor(h.now()/H);h.advance(4*H);await r.pulse();assert.equal(calls,1);
  await r.pulse();assert.equal(calls,1);h.advance(60000);await r.pulse();assert.equal(calls,2);
  assert.equal(h.store.snapshot().rows.length,0);r.stop();
});
test('stopping during an in-flight analysis rejects the delayed result',async t=>{
  const h=harness(t);let finish,started;
  const entered=new Promise(r=>{started=r;});
  const r=new ResearchRunner(h.engine,{analyze:()=>{started();return new Promise(resolve=>{finish=resolve;});},clock:h.now});
  const work=r.check('UNIUSDT');await entered;r.stop();finish(record(h.now()));await work;
  assert.equal(h.store.snapshot().rows.length,0);
});
