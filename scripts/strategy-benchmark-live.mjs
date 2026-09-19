import { writeFile } from 'node:fs/promises';
import { runLiteBacktest } from '../src/local_backtest.js';

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT'];
const STRATEGIES = [
  ['A','EMA20/50'],
  ['B','EMA10/30']
];
const CASES = [
  ['15m','90D'],
  ['1h','1Y'],
  ['4h','2Y'],
  ['12h','3Y'],
  ['1d','5Y'],
  ['1w','10Y'],
  ['1M','10Y']
];

const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const rows = [];

for (const symbol of SYMBOLS) {
  for (const [timeframe, range] of CASES) {
    for (const [strategy, strategyLabel] of STRATEGIES) {
      const started = Date.now();
      try {
        const snapshot = await runLiteBacktest({ symbol, range, strategy, timeframe });
        const r = snapshot.result || {};
        rows.push({
          symbol,
          timeframe,
          range,
          strategy,
          strategyLabel,
          samples: snapshot.input?.samples ?? null,
          dataSource: snapshot.input?.dataSource ?? null,
          trades: r.trades ?? null,
          winRatePct: r.winRatePct ?? null,
          profitFactor: r.profitFactor ?? null,
          expectancyR: r.expectancyR ?? null,
          netReturnPct: r.netReturnPct ?? null,
          maxDrawdownPct: r.maxDrawdownPct ?? null,
          validation: r.validation?.label ?? null,
          validationLevel: r.validation?.level ?? null,
          elapsedMs: Date.now() - started,
          error: null
        });
        console.log(JSON.stringify(rows.at(-1)));
      } catch (error) {
        rows.push({
          symbol,timeframe,range,strategy,strategyLabel,
          samples:null,trades:null,winRatePct:null,profitFactor:null,expectancyR:null,
          netReturnPct:null,maxDrawdownPct:null,validation:null,validationLevel:null,
          elapsedMs:Date.now()-started,error:String(error?.message || error)
        });
        console.log(JSON.stringify(rows.at(-1)));
      }
      await pause(150);
    }
  }
}

const successful = rows.filter(row => !row.error);
const failed = rows.filter(row => row.error);
const safe = (value, digits=2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';

const ranked = successful
  .filter(row => Number.isFinite(Number(row.profitFactor)) && Number.isFinite(Number(row.expectancyR)))
  .sort((a,b) =>
    Number(b.expectancyR) - Number(a.expectancyR) ||
    Number(b.profitFactor) - Number(a.profitFactor)
  );

const markdown = [
  '# FOXYYA Live Strategy Benchmark',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `Successful cases: ${successful.length} / ${rows.length}`,
  `Failed cases: ${failed.length}`,
  '',
  '| Symbol | TF | Range | Strategy | Source | Bars | Trades | Win % | PF | Exp R | Net % | MDD % | Validation |',
  '|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|',
  ...rows.map(row => `| ${row.symbol} | ${row.timeframe} | ${row.range} | ${row.strategyLabel} | ${row.dataSource || '—'} | ${row.samples ?? '—'} | ${row.trades ?? '—'} | ${safe(row.winRatePct)} | ${safe(row.profitFactor)} | ${safe(row.expectancyR,3)} | ${safe(row.netReturnPct)} | ${safe(row.maxDrawdownPct)} | ${row.error ? 'ERROR: '+row.error.replaceAll('|','/') : row.validation || '—'} |`),
  '',
  '## Ranking by Expectancy then Profit Factor',
  '',
  '| # | Symbol | TF | Strategy | Trades | PF | Exp R | Net % | MDD % | Validation |',
  '|---:|---|---:|---|---:|---:|---:|---:|---:|---|',
  ...ranked.slice(0,15).map((row,index)=>`| ${index+1} | ${row.symbol} | ${row.timeframe} | ${row.strategyLabel} | ${row.trades} | ${safe(row.profitFactor)} | ${safe(row.expectancyR,3)} | ${safe(row.netReturnPct)} | ${safe(row.maxDrawdownPct)} | ${row.validation} |`)
].join('\n');

await writeFile('benchmark-result.json', JSON.stringify({
  generatedAt:new Date().toISOString(),
  source:'Binance USD-M public klines',
  paperOnly:true,
  successfulCases:successful.length,
  failedCases:failed.length,
  rows,
  ranked
}, null, 2));
await writeFile('benchmark-result.md', markdown);

console.log('BENCHMARK_DONE');
console.log(`successful=${successful.length} failed=${failed.length}`);
if (failed.length) {
  console.log('FAILURES');
  for (const row of failed) console.log(`${row.symbol} ${row.timeframe} ${row.strategyLabel}: ${row.error}`);
}
