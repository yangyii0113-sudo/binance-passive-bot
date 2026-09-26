import { setTimeout as delay } from 'node:timers/promises';
import { loadMarketSnapshot } from '../src/market.js';
import { homeCandidates } from '../src/home_opportunities.js';
import { generateAgentTradePlan } from '../src/agent_trade_plan.js';

export class ResearchRunner {
  constructor(engine,{WebSocketClass=WebSocket,market=loadMarketSnapshot,analyze=generateAgentTradePlan,clock=Date.now}={}){
    this.engine=engine;this.WebSocketClass=WebSocketClass;this.market=market;this.analyze=analyze;this.clock=clock;
    this.sockets=new Map();this.running=false;this.recovering=false;this.stopped=false;this.lastHour=null;this.scan={status:'WAITING',completedAt:null,error:null};
  }
  closeSocket(symbol){const s=this.sockets.get(symbol);if(s){s.onmessage=s.onerror=s.onclose=null;try{s.close();}catch{}this.sockets.delete(symbol);}}
  fault(){this.stopped=true;for(const symbol of this.sockets.keys())this.closeSocket(symbol);}
  guard(fn){try{return fn();}catch{this.engine.fatal ||= '追蹤服務異常，停止判定；需核對紀錄';this.fault();return null;}}
  connect(symbol){
    const old=this.engine.feeds.get(symbol);
    if(old&&old.status!=='BLOCKED')return old.generation;
    this.closeSocket(symbol);const generation=this.engine.begin(symbol);
    let socket;
    try{socket=new this.WebSocketClass(`wss://fstream.binance.com/market/ws/${symbol.toLowerCase()}@aggTrade`);}
    catch{this.engine.block(symbol,generation,'無法建立即時連線');return generation;}
    this.sockets.set(symbol,socket);
    socket.onmessage=e=>this.guard(()=>{
      if(this.sockets.get(symbol)!==socket)return;
      let data;try{data=JSON.parse(e.data);}catch{this.engine.block(symbol,generation,'行情資料無法解析');return;}
      this.engine.tick(symbol,generation,data);
      if(this.engine.feeds.get(symbol)?.status==='BLOCKED')this.closeSocket(symbol);
    });
    socket.onerror=socket.onclose=()=>this.guard(()=>{if(this.sockets.get(symbol)!==socket)return;this.engine.block(symbol,generation,'即時連線中斷；不回補');this.closeSocket(symbol);});
    return generation;
  }
  async check(symbol){
    if(this.stopped||this.engine.fatal)return;
    if(this.engine.feeds.size>=12&&!this.engine.feeds.has(symbol)){
      this.engine.persist('SCAN_SKIPPED',{symbol,reason:'觀察上限已滿'});return;
    }
    const generation=this.connect(symbol),deadline=this.clock()+11000;
    while(!this.stopped&&this.clock()<deadline){
      const feed=this.engine.current(symbol,generation);
      if(!feed)return;
      if(feed.status==='LIVE')break;
      await delay(100);
    }
    if(this.stopped||this.engine.current(symbol,generation)?.status!=='LIVE')return;
    const record=await this.analyze(symbol);
    if(this.stopped)return;
    this.engine.register(record,generation);
  }
  async scanNow(){
    if(this.running||this.recovering||this.stopped||this.engine.fatal)return;
    this.running=true;this.scan={...this.scan,status:'RUNNING',startedAt:this.clock(),error:null};
    try{
      const market=await this.market();
      if(this.stopped)return;
      const selection=homeCandidates(market,this.clock());
      if(selection.reason)throw new Error(selection.reason);
      const selected=selection.rows.map(r=>r.symbol);
      this.engine.persist('SCAN',{selected,marketAt:market.updatedAt,contractsAt:market.contractVerifiedAt});
      for(const symbol of this.engine.feeds.keys())if(!selected.includes(symbol)&&this.engine.releaseIdle(symbol))this.closeSocket(symbol);
      let index=0;
      const worker=async()=>{while(index<selected.length&&!this.stopped)await this.check(selected[index++]);};
      const results=await Promise.allSettled([worker(),worker()]);
      const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
      if(!this.stopped){this.scan={status:'COMPLETE',completedAt:this.clock(),symbols:selected,error:null};this.retryScanAt=null;}
    }catch(error){
      this.scan={...this.scan,status:'BLOCKED',error:String(error.message).slice(0,250)};
      this.retryScanAt=this.clock()+60000;
      if(this.engine.fatal)this.fault();else this.guard(()=>this.engine.persist('SCAN_FAILED',{reason:this.scan.error}));
    }finally{this.running=false;}
  }
  start(){
    if(this.timer)throw new Error('Runner already started');
    this.lastHour=Math.floor(this.clock()/3600000);void this.scanNow();
    this.timer=setInterval(()=>this.guard(()=>this.pulse()),1000);
  }
  pulse(){
      this.engine.heartbeat();
      for(const [symbol,f] of this.engine.feeds)if(f.status==='BLOCKED')this.closeSocket(symbol);
      const hour=Math.floor(this.clock()/3600000);
      // One new scan on an observed hour transition; never replay missed hours.
      if(!this.running&&!this.recovering&&!this.stopped&&hour>this.lastHour){this.lastHour=hour;return this.scanNow();}
      else if(!this.running&&!this.recovering&&!this.stopped&&this.scan.status==='BLOCKED'&&this.clock()>=this.retryScanAt)return this.scanNow();
      else if(!this.running&&!this.recovering&&!this.stopped){
        const retry=[...this.engine.feeds.values()].find(f=>f.status==='BLOCKED'&&this.clock()-f.blockedAt>=30000);
        if(retry){
          this.recovering=true;
          // Old samples stay GAP. A replacement connection can only admit a fresh analysis.
          return this.check(retry.symbol).catch(()=>{this.engine.fatal ||= '重新核對失敗，停止追蹤';this.fault();}).finally(()=>{this.recovering=false;});
        }
      }
  }
  stop(){clearInterval(this.timer);this.timer=null;this.fault();this.engine.stop();}
}
