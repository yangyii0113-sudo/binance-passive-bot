(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./contracts.js'):root.FOXY_V12_RESULTS_CONTRACTS);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_CRYPTO_RESULTS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const round=x=>Number(x.toFixed(12));
  function sum(xs){return round(xs.reduce((a,b)=>a+b,0));}
  function completeMetric(rows,key){return rows.every(x=>finite(x[key]))?sum(rows.map(x=>x[key])):null;}
  function projectCryptoResults(execution){
    if(!execution||typeof execution!=='object'||Array.isArray(execution))throw Error('EXECUTION_READ_REQUIRED');
    if(execution.paperOnly!==true)throw Error('PAPER_ONLY_REQUIRED');
    if(execution.realOrderLock!==true)throw Error('REAL_ORDER_LOCK_REQUIRED');
    if(execution.readOnly!==true)throw Error('READ_ONLY_REQUIRED');
    if(!finite(execution.asOf)||execution.asOf<0)throw Error('ASOF_INVALID');
    if(!Array.isArray(execution.closedTrades))throw Error('CLOSED_TRADES_REQUIRED');
    const rows=execution.closedTrades.filter(t=>t&&t.closed===true&&finite(t.net_pnl_usdt));
    const sampleCount=rows.length;
    const wins=rows.filter(t=>t.net_pnl_usdt>0),losses=rows.filter(t=>t.net_pnl_usdt<0);
    const gp=sum(wins.map(t=>t.net_pnl_usdt)),gl=Math.abs(sum(losses.map(t=>t.net_pnl_usdt)));
    const realized=rows.filter(t=>finite(t.realized_r)).map(t=>t.realized_r);
    const metrics={winRate:sampleCount?wins.length/sampleCount:null,netPnl:sum(rows.map(t=>t.net_pnl_usdt)),netR:realized.length===sampleCount?sum(realized):null,expectancyR:realized.length===sampleCount&&sampleCount?round(sum(realized)/sampleCount):null,profitFactor:gl>0?gp/gl:(gp>0?Infinity:null),fees:completeMetric(rows,'fees_usdt'),funding:completeMetric(rows,'funding_usdt'),maxDrawdown:null};
    const out={type:'TRADING_RESULTS',market:'CRYPTO',sampleCount,asOf:execution.asOf,source:'canonical-ledger-read',researchOnly:false,sampleStatus:sampleCount<20?'SAMPLE_INSUFFICIENT':'DESCRIPTIVE_ONLY',metrics:Object.freeze(metrics),unavailable:Object.freeze(['MAX_DRAWDOWN_HISTORY']),trades:Object.freeze(rows.map(x=>Object.freeze({...x})))};
    const checked=C.validateResultEnvelope(out);if(!checked.ok)throw Error('RESULT_INVALID:'+checked.errors.join('|'));
    return Object.freeze(out);
  }
  return Object.freeze({projectCryptoResults});
});