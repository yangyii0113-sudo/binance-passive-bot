import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyForwardBook,registerForwardAdvice,advanceForward} from '../src/advice_forward.js';
import {validateForwardBook} from '../src/advice_forward_store.js';
import {runLiteBacktest} from '../src/local_backtest.js';
const H=3600000,t=2400*H+120000;
function record(at=t){const p={key:'breakout',status:'SETUP',side:'LONG',entry:100,stop:95,tp1:110,tp2:120,signalAt:2400*H-1,expiresAt:2401*H};return {symbol:'SOLUSDT',status:'LIVE',checkedAt:at,snapshotUntil:at+60000,marketSnapshot:{price:98,high:99,low:97,barOpen:2400*H,requestedAt:at,receivedAt:at},row:{analysis:{status:'VALID',analyzedAt:at,closedAt:p.signalAt,validUntil:p.expiresAt,strategies:[p,{key:'structured',status:'WAIT'},{key:'meanReversion',status:'WAIT'}]}}};}
const tick=(id,time)=>({id,time,eventTime:time,receivedAt:time,price:98});
test('fresh gate after continuously observed expiry creates a separate immutable attempt',()=>{
 const b=emptyForwardBook();registerForwardAdvice(b,record(),{now:t,feed:{startedAt:t-1,last:tick(1,t)}});
 for(let i=1;i<=12;i++)advanceForward(b,'SOLUSDT',tick(i+1,t+i*5000));
 const previous=JSON.stringify(b.rows[0]);assert.equal(b.rows[0].status,'EXPIRED');
 const at=t+60001,feed={startedAt:t-1,last:tick(14,at)};
 assert.equal(registerForwardAdvice(b,record(at),{now:at,feed}).length,1);
 assert.equal(JSON.stringify(b.rows[0]),previous);assert.notEqual(b.rows[0].id,b.rows[1].id);
 assert.equal(registerForwardAdvice(b,record(at),{now:at,feed}).length,0);validateForwardBook(b);
});
test('expired record cannot be reused and filled or cancelled signals never restart',()=>{
 for(const status of ['EXPIRED','CANCELLED','GAP','CLOSED']){
  const b=emptyForwardBook();registerForwardAdvice(b,record(),{now:t,feed:{startedAt:t-1,last:tick(1,t)}});
  b.rows[0].status=status;b.rows[0].endedAt=t+1;
  const at=t+1000;const fresh=record(status==='EXPIRED'?t:at);
  assert.equal(registerForwardAdvice(b,fresh,{now:at,feed:{startedAt:t-1,last:tick(2,at)}}).length,0);
 }
});
test('EMA drawdown reports intrabar adverse excursion and cash-based profit factor',async()=>{
 const now=Date.now(),start=Math.floor(now/H)*H-61*H;
 const rows=Array.from({length:60},(_,i)=>{const p=i<50?50+i:110;return [start+i*H,String(i>=50?100:p),String(Math.max(111,p)),String(i===54?1:Math.min(49,p)),String(p),'100',start+(i+1)*H-1];});
 const saved=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>rows});
 try{const r=await runLiteBacktest({range:'90D'});assert.ok(r.result.maxDrawdownPct>95);assert.equal(r.result.closedDrawdownPct,0);assert.equal(r.result.drawdownMethod,'OHLC_CONSERVATIVE_BOUND');assert.ok(r.recentTrades.every(x=>Number.isFinite(x.netPnl)));}finally{globalThis.fetch=saved;}
});
test('EMA rejects malformed OHLC instead of publishing NaN drawdown',async()=>{
 const now=Date.now(),start=Math.floor(now/H)*H-61*H,rows=Array.from({length:60},(_,i)=>[start+i*H,100+i,102+i,99+i,101+i,100,start+(i+1)*H-1]);rows[54][2]='not-a-price';
 const saved=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>rows});try{await assert.rejects(()=>runLiteBacktest({range:'90D'}),/歷史.*異常/);}finally{globalThis.fetch=saved;}
});
