const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const ui=fs.readFileSync('backtest_ui.js','utf8');
const docker=fs.readFileSync('Dockerfile','utf8');
const service=fs.readFileSync('service.py','utf8');

test('backtest UI is explicitly historical and never falls back to Forward runtime data',()=>{
 assert.match(ui,/HISTORICAL BACKTEST/);
 assert.match(ui,/歷史模擬・非 Forward Performance/);
 assert.match(ui,/\/api\/backtest\/latest/);
 assert.doesNotMatch(ui,/FOXY_RUNTIME_BRIDGE/);
 assert.doesNotMatch(ui,/\/api\/runtime\/snapshot/);
 assert.match(ui,/Sample Insufficient/);
});

test('backtest UI exposes required provenance and performance fields',()=>{
 for(const token of ['run_id','git_sha','strategy_version','closed_trades','win_rate_n','net_return','profit_factor','expectancy_r','max_drawdown','fees_usdt','slippage_usdt','funding_usdt','qualified_to_filled']){
  assert.ok(ui.includes(token),`missing ${token}`);
 }
});

test('production service serves and injects dedicated backtest UI bundle',()=>{
 assert.match(service,/\/backtest_ui\.js/);
 assert.match(service,/backtest_ui\.js/);
 assert.match(docker,/backtest_ui\.js/);
});

async function renderBacktest(value){
 const root={innerHTML:''};
 const nodes=new Map([['backtestContent',root],['foxyyaBacktestStyle',{}]]);
 const payload={
  status:'OK',mode:'HISTORICAL BACKTEST',label:'歷史模擬・非 Forward Performance',
  run_config:{run_id:'bt-ui-fixture',symbol:'ETHUSDT',strategy_version:'fixture',git_sha:'fixture'},
  metrics:{
   start_ms:value,end_ms:value,
   performance:{closed_trades:0,win_rate_n:0,win_rate:value,net_return:value,profit_factor:value,expectancy_r:value,max_drawdown:value},
   cost_attribution:{gross_raw_pnl_usdt:value,slippage_usdt:value,fees_usdt:value,funding_usdt:value,net_pnl_usdt:value},
   funnel:{eligible:0,candidate:0,qualified:0,executable:0,intents:0,filled:0,qualified_to_filled:value},
   risk:{max_reserved_risk_fraction:value},
   segments:{family:{A:{n:0,sample_status:'Sample Insufficient',win_rate:value,expectancy_r:value,profit_factor:value}}},
  },report:{mode:'HISTORICAL BACKTEST',label:'歷史模擬・非 Forward Performance'},
 };
 const context={
  document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)||null,querySelector:()=>null},
  fetch:async()=>({ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(payload))}),
 };
 context.window=context;
 vm.runInNewContext(ui,context);
 await context.FOXY_BACKTEST_UI.load();
 return root.innerHTML;
}

for(const value of [null,undefined]){
 test(`backtest renders ${value} metrics as unavailable instead of numeric zero`,async()=>{
  const html=await renderBacktest(value);
  for(const name of ['勝率','淨報酬','Profit Factor','Expectancy','最大回撤']){
   assert.match(html,new RegExp(`<span>${name}</span><b>UNAVAILABLE</b>`));
  }
  assert.match(html,/Funding<\/span><b>UNAVAILABLE USDT<\/b>/);
  assert.match(html,/Qualified → Filled：UNAVAILABLE/);
  assert.match(html,/勝率 UNAVAILABLE · Expectancy UNAVAILABLE R · PF UNAVAILABLE/);
  assert.match(html,/<span>期間<\/span><b>UNAVAILABLE → UNAVAILABLE<\/b>/);
 });
}

test('backtest still renders measured zero as zero',async()=>{
 const html=await renderBacktest(0);
 assert.match(html,/<span>完整出場交易<\/span><b>0<\/b>/);
 assert.match(html,/<span>勝率<\/span><b>0% · n=0<\/b>/);
 assert.match(html,/<span>淨報酬<\/span><b>0%<\/b>/);
 assert.match(html,/<span>Profit Factor<\/span><b>0<\/b>/);
 assert.match(html,/<span>Expectancy<\/span><b>0 R<\/b>/);
});
