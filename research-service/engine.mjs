import { emptyForwardBook, activeForward, registerForwardAdvice, advanceForward, interruptForward, expireForward, normalizeForwardTick, tickContinuity, FEED_GAP_MS } from '../src/advice_forward.js';

// No strategy/price/risk logic here: reuse the reviewed browser-independent functions.
export class ResearchEngine {
  constructor(store,{clock=Date.now}={}){
    this.store=store;this.clock=clock;this.startedAt=clock();this.feeds=new Map();this.generation=0;this.fatal=null;this.stopped=false;
    this.book=store.activeBook();
    interruptForward(this.book,'服務曾停止或重啟；中斷期間不回補',this.startedAt);
    this.persist('START',{source:'independent-research-v1'},this.book.rows);
    this.prune();
  }
  persist(kind,data,rows=[]){
    if(this.fatal||this.stopped)throw new Error('Research engine stopped');
    try{this.store.commit(kind,data,rows,this.clock());}
    catch(error){this.fatal='持久紀錄失敗，停止追蹤；需核對磁碟與紀錄';throw error;}
  }
  prune(){this.book.rows=this.book.rows.filter(activeForward);}
  begin(symbol){
    if(!/^[A-Z0-9]+USDT$/.test(symbol)||symbol.length>40)throw new Error('Invalid symbol');
    if(this.fatal||this.stopped)throw new Error('Research engine stopped');
    if(this.feeds.size>=12&&!this.feeds.has(symbol))throw new Error('Observation capacity reached');
    const old=this.feeds.get(symbol);
    if(old?.status==='LIVE'||old?.status==='CONNECTING')return old.generation;
    const f={symbol,generation:++this.generation,startedAt:this.clock(),status:'CONNECTING',last:null,barOpen:null,high:null,low:null};
    this.persist('FEED_START',{symbol,generation:f.generation});this.feeds.set(symbol,f);return f.generation;
  }
  current(symbol,generation){const f=this.feeds.get(symbol);return !this.fatal&&!this.stopped&&f?.generation===generation&&f.status!=='BLOCKED'?f:null;}
  block(symbol,generation,reason){
    const f=this.current(symbol,generation);if(!f)return;
    f.status='BLOCKED';f.reason=reason;f.blockedAt=this.clock();
    interruptForward(this.book,reason,this.clock(),symbol);
    this.persist('FEED_GAP',{symbol,generation,reason},this.book.rows.filter(r=>r.symbol===symbol));this.prune();
  }
  tick(symbol,generation,data){
    const f=this.current(symbol,generation);if(!f)return false;
    let tick;
    try{tick=normalizeForwardTick(data,symbol,this.clock());}
    catch{this.block(symbol,generation,'行情格式或時間異常；不回補');return false;}
    const continuity=tickContinuity(f.last,tick);
    if(continuity==='duplicate')return false;
    if(continuity==='gap'){this.block(symbol,generation,'行情序號或時間不連續；不回補');return false;}
    const active=this.book.rows.some(r=>r.symbol===symbol&&activeForward(r));
    const changed=advanceForward(this.book,symbol,tick);
    // Every observed trade while a sample is active is durable, including event/receive times.
    if(active)this.persist('TICK',{symbol,generation,tick},changed?this.book.rows.filter(r=>r.symbol===symbol):[]);
    else if(!f.last)this.persist('FEED_FIRST',{symbol,generation,tick});
    f.last=tick;f.status='LIVE';const bar=Math.floor(tick.time/3600000)*3600000;
    if(f.barOpen!==bar){f.barOpen=bar;f.high=tick.price;f.low=tick.price;}else{f.high=Math.max(f.high,tick.price);f.low=Math.min(f.low,tick.price);}
    this.prune();return true;
  }
  register(record,generation){
    const f=this.current(record?.symbol,generation);
    if(!f||f.status!=='LIVE'||record?.historical||record?.checkedAt<this.startedAt)return [];
    const trial={...emptyForwardBook(),rows:structuredClone(this.book.rows)};
    const added=registerForwardAdvice(trial,record,{now:this.clock(),feed:f}).filter(r=>!this.store.has(r.id));
    if(!added.length)return [];
    this.persist('ANALYSIS',{record,generation},added);
    this.book.rows.push(...added);this.prune();return added;
  }
  heartbeat(){
    if(this.fatal||this.stopped)return;
    const now=this.clock();
    for(const [symbol,f] of this.feeds)if(f.status!=='BLOCKED'&&(now<(f.last?.receivedAt??f.startedAt)||now-(f.last?.receivedAt??f.startedAt)>FEED_GAP_MS))this.block(symbol,f.generation,'行情逾時或時間倒退；不回補');
    if(expireForward(this.book,now)){this.persist('EXPIRY',{},this.book.rows);this.prune();}
  }
  releaseIdle(symbol){
    if(this.book.rows.some(r=>r.symbol===symbol))return false;
    this.feeds.delete(symbol);return true;
  }
  stop(){
    if(this.stopped)return;
    if(!this.fatal){interruptForward(this.book,'服務停止；未完成樣本中斷，不回補',this.clock());this.persist('STOP',{},this.book.rows);this.prune();}
    this.stopped=true;
  }
  health(){
    const now=this.clock();const feeds=[...this.feeds.values()].map(f=>({symbol:f.symbol,status:f.status,lastReceivedAt:f.last?.receivedAt??null,reason:f.reason??null}));
    return {startedAt:this.startedAt,checkedAt:now,status:this.fatal?'BLOCKED':this.stopped?'STOPPED':feeds.length&&feeds.every(f=>f.status==='LIVE'&&now-f.lastReceivedAt<=FEED_GAP_MS&&now>=f.lastReceivedAt)?'LIVE':'WAITING',error:this.fatal,feeds};
  }
}
