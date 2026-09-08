const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(process.env.PLATFORM_HTML||'live_ui.html','utf8');
const bridge=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('const STATE={status:null'));
function harness(){
 const listeners={},timers=[],requests=[];let fail=false;
 const state={schema:'foxyya-runtime-snapshot/1',status:'PAPER_ONLY',real_orders:false,complete:true,books:{},events:[],trades:[],pending:[],candidates:[],diagnostics:{},served_at:Date.now()};
 const ctx={console,AbortController,Date,JSON,Object,Array,Promise,Error,Number,String,setTimeout,clearTimeout,
  setInterval:(fn,ms)=>{timers.push({fn,ms});return 1},
  document:{readyState:'loading',addEventListener:()=>{}},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},
  fetch:async path=>{requests.push(path);if(fail)throw Error('offline');if(requests.length>30)throw Error('runaway refresh');const data=path.includes('snapshot')?state:path.includes('status')?{paper_only:true,real_order_lock:true,mode:'PAPER_ONLY',ok:true,last_cycle:{time_ms:Date.now()}}:path.includes('events')?{schema:'foxyya-runtime-events/1',status:'PAPER_ONLY',real_orders:false,events:[]}:path.includes('news')?{schema:'foxyya-news/1',status:'UNAVAILABLE',items:[]}:{schema:'foxyya-calendar/1',status:'UNAVAILABLE',events:[]};return{ok:true,text:async()=>JSON.stringify(data)}}};
 let dispatched=0;
 ctx.window=ctx;ctx.addEventListener=(n,fn)=>(listeners[n]??=[]).push(fn);ctx.dispatchEvent=e=>{if(++dispatched===1)(listeners[e.type]||[]).forEach(fn=>fn(e))};
 vm.runInNewContext(bridge,ctx);
 return{ctx,requests,fail:()=>fail=true};
}
test('one manual refresh completes without recursively starting another refresh',async()=>{
 const h=harness();await h.ctx.FOXY_RUNTIME_BRIDGE.refresh();await new Promise(r=>setImmediate(r));
 assert.equal(h.requests.filter(x=>x.includes('/status')).length,1);
});
test('failed refresh clears previously verified runtime status',async()=>{
 const h=harness();await h.ctx.FOXY_RUNTIME_BRIDGE.refresh();h.fail();await h.ctx.FOXY_RUNTIME_BRIDGE.refresh();
 assert.equal(h.ctx.FOXY_RUNTIME_BRIDGE.getStatus(),null);
});
test('canonical snapshot is available even when it contains zero events',async()=>{
 const h=harness();await h.ctx.FOXY_RUNTIME_BRIDGE.refresh();
 assert.equal(typeof h.ctx.FOXY_RUNTIME_BRIDGE.getPortfolio,'function');
 assert.equal(h.ctx.FOXY_RUNTIME_BRIDGE.getPortfolio().complete,true);
});
