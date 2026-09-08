const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const script=[...fs.readFileSync('live_ui.html','utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes("const VERSION='11.2.0'"));
function core(portfolio){
 const ctx={console,Date,Number,String,Object,Array,Map,Set,Math,JSON,
  document:{readyState:'loading',addEventListener:()=>{}},
  FOXY_UPGRADE:{getLedger:()=>({events:[{kind:'PAPER_ENTRY',symbol:'OLD_LOCAL_RECORD'}]})},
  FOXY_RUNTIME_BRIDGE:{getPortfolio:()=>portfolio,getEvents:()=>portfolio?.events||[]}};
 ctx.window=ctx;vm.runInNewContext(script,ctx);return ctx.FOXY_V11;
}
test('unavailable runtime never falls back to local ledger or reports zero trades as evidence',()=>{
 const c=core(null);assert.equal(c.computeFunnel().filled,null);assert.equal(c.tradeSamples().length,0);
});
test('funnel uses canonical totals and active intents, not revalidation event counts',()=>{
 const c=core({diagnostics:{qualified_24h:14,filled_24h:1},latest_scan:{eligible_universe_count:192,funnel:{candidate:384}},pending:[{}],events:Array(90).fill({kind:'INTENT_REVALIDATED'})});
 assert.equal(c.computeFunnel().pending,1);assert.equal(c.computeFunnel().filled,1);assert.equal(c.computeFunnel().qualified,14);
});
test('strategy lab counts only closed positions and preserves negative capture',()=>{
 const c=core({trades:[{position_id:'closed',symbol:'BTCUSDT',family:'A',side:'LONG',books:['5x','8x','10x'],closed:true,realized_r:-.5,mfe_r:2,mae_r:1,mark_samples:10,net_pnl_usdt:-2},
 {position_id:'open',symbol:'ETHUSDT',family:'B',side:'SHORT',books:['5x'],closed:false,realized_r:null,mark_samples:0,net_pnl_usdt:1}],events:[]});
 const lab=c.computeStrategyLab();assert.equal(lab.overall.trades,1);assert.equal(lab.overall.expectancy,-.5);assert.equal(lab.overall.capture,-.25);assert.equal(lab.byBook[2].trades,1);
});
