import { runPullbackComparison } from './pullback_replay.js';

// Research only: sequential requests and one shared closed-bar cutoff.
export async function runComparisonBatch(symbols,{compare=runPullbackComparison,onUpdate=()=>{},shouldStop=()=>false,now=Date.now()}={}) {
  if(!Array.isArray(symbols)||!symbols.length||symbols.length>10||new Set(symbols).size!==symbols.length||symbols.some(s=>typeof s!=='string'||! /^[\p{L}\p{N}]+USDT$/u.test(s)))throw new Error('批次比較清單無效');
  const end=Math.floor(now/14400000)*14400000;
  const rows=symbols.map(symbol=>({symbol,status:'PENDING'}));
  const publish=()=>onUpdate(rows.map(row=>({...row})));
  publish();
  for(let i=0;i<rows.length;i++) {
    if(shouldStop()) {
      for(let j=i;j<rows.length;j++)rows[j]={symbol:symbols[j],status:'CANCELLED'};
      publish();break;
    }
    rows[i]={symbol:symbols[i],status:'RUNNING'};publish();
    try {
      const result=await compare(symbols[i],{end});
      if(result.symbol!==symbols[i]||result.end!==end)throw new Error('比較結果標的或期間不一致');
      rows[i]={symbol:symbols[i],status:'DONE',result};
    } catch(error) {rows[i]={symbol:symbols[i],status:'ERROR',error:String(error.message||'比較失敗')};}
    publish();
  }
  return rows;
}
