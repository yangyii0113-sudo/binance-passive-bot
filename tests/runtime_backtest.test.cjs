const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

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
