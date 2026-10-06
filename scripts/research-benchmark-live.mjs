import {writeFile} from 'node:fs/promises';
import {runPullbackComparison} from '../src/pullback_replay.js';
import {runHorizonComparison} from '../src/horizon_replay.js';
const rows=[];
for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT']){
 for(const scope of ['control-three-families','day','week','month']){
  try{const result=scope==='control-three-families'?await runPullbackComparison(symbol):await runHorizonComparison(symbol,scope);rows.push({symbol,scope,status:'COMPUTED',source:'Binance USD-M public klines',result});console.log(JSON.stringify({symbol,scope,status:'COMPUTED',validation:'RESEARCH_ONLY_NOT_PROFITABILITY_PROOF'}));}
  catch(e){rows.push({symbol,scope,status:'BLOCKED',reason:String(e.message)});console.log(JSON.stringify(rows.at(-1)));}
 }
}
await writeFile('research-benchmark.json',JSON.stringify({generatedAt:new Date().toISOString(),paperOnly:true,realOrderLocked:true,noBackfill:true,fundingIncluded:false,notice:'Computed is not profitable or execution eligible. Blocked cases contain no substituted prices.',rows},null,2));
console.log(`RESEARCH_BENCHMARK computed=${rows.filter(r=>r.status==='COMPUTED').length} blocked=${rows.filter(r=>r.status==='BLOCKED').length}`);
