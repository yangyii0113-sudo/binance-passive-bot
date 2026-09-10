(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_CRYPTO_RUNTIME_ADAPTER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const text=x=>typeof x==='string'&&x.length>0;
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const clone=x=>JSON.parse(JSON.stringify(x));

  function adaptRuntime(status,snapshot){
    if(!obj(status))throw Error('STATUS_REQUIRED');
    if(status.paper_only!==true)throw Error('PAPER_ONLY_REQUIRED');
    if(status.real_order_lock!==true)throw Error('REAL_ORDER_LOCK_REQUIRED');
    if(!text(status.strategy_version))throw Error('STRATEGY_VERSION_REQUIRED');
    if(!Number.isInteger(status.cycle_count)||status.cycle_count<0)throw Error('CYCLE_COUNT_INVALID');
    if(!obj(snapshot)||snapshot.schema!=='foxyya-runtime-snapshot/1')throw Error('SNAPSHOT_SCHEMA_INVALID');
    if(snapshot.status!=='PAPER_ONLY')throw Error('SNAPSHOT_PAPER_ONLY_REQUIRED');
    if(snapshot.real_orders!==false)throw Error('REAL_ORDERS_FORBIDDEN');
    if(snapshot.complete!==true)throw Error('SNAPSHOT_INCOMPLETE');
    if(!finite(snapshot.served_at)||snapshot.served_at<0)throw Error('SERVED_AT_INVALID');
    for(const k of ['candidates','pending','trades'])if(!Array.isArray(snapshot[k]))throw Error(k.toUpperCase()+'_REQUIRED');
    if(!obj(snapshot.books)||!obj(snapshot.diagnostics))throw Error('SNAPSHOT_CONTENT_INVALID');

    const canonicalBook=text(status.canonical_book)?status.canonical_book:null;
    const canonicalBookRole=canonicalBook&&text(status.canonical_book_role)?status.canonical_book_role:null;
    const canonicalState=canonicalBook&&obj(snapshot.books[canonicalBook])?snapshot.books[canonicalBook]:null;
    const canonicalNav=canonicalBookRole==='PRIMARY'&&canonicalState&&finite(canonicalState.equity)?canonicalState.equity:null;
    const canonicalNavSource=canonicalNav===null?null:`runtime_snapshot.books.${canonicalBook}.equity`;
    const canonicalReady=canonicalNav!==null;
    const ledgerIntegrity=status.ledger_integrity===true;
    const healthy=status.ok===true&&ledgerIntegrity&&canonicalReady;
    const trades=clone(snapshot.trades);

    const out={
      schema:'foxyya-v12-crypto-execution-read/1',
      paperOnly:true,
      realOrderLock:true,
      readOnly:true,
      strategyVersion:status.strategy_version,
      cycleCount:status.cycle_count,
      ledgerIntegrity,
      canonicalBook,
      canonicalBookRole,
      canonicalNav,
      canonicalNavSource,
      health:healthy?'HEALTHY':'DEGRADED',
      asOf:snapshot.served_at,
      ledgerEvents:snapshot.ledger_events??null,
      candidates:Object.freeze(clone(snapshot.candidates)),
      pending:Object.freeze(clone(snapshot.pending)),
      openPositions:Object.freeze(trades.filter(t=>t.closed!==true)),
      closedTrades:Object.freeze(trades.filter(t=>t.closed===true)),
      books:Object.freeze(clone(snapshot.books)),
      diagnostics:Object.freeze(clone(snapshot.diagnostics))
    };
    return Object.freeze(out);
  }

  return Object.freeze({adaptRuntime});
});