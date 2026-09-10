'use strict';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const text=value=>typeof value==='string'&&value.length>0;
const integerOrNull=value=>Number.isInteger(value)&&value>=0?value:null;
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));

function assertRuntimeInputs(status,executionRead){
  if(!object(status))throw Error('STATUS_REQUIRED');
  if(status.paper_only!==true)throw Error('PAPER_ONLY_REQUIRED');
  if(status.real_order_lock!==true)throw Error('REAL_ORDER_LOCK_REQUIRED');
  if(!text(status.strategy_version))throw Error('STRATEGY_VERSION_REQUIRED');
  if(!Number.isInteger(status.cycle_count)||status.cycle_count<0)throw Error('CYCLE_COUNT_INVALID');

  if(!object(executionRead)||executionRead.schema!=='foxyya-v12-crypto-execution-read/1')throw Error('RUNTIME_READ_MODEL_REQUIRED');
  if(executionRead.paperOnly!==true)throw Error('PAPER_ONLY_REQUIRED');
  if(executionRead.realOrderLock!==true)throw Error('REAL_ORDER_LOCK_REQUIRED');
  if(executionRead.readOnly!==true)throw Error('RUNTIME_READ_ONLY_REQUIRED');
  if(executionRead.strategyVersion!==status.strategy_version)throw Error('STRATEGY_VERSION_MISMATCH');
  if(executionRead.cycleCount!==status.cycle_count)throw Error('CYCLE_COUNT_MISMATCH');
  if(!finite(executionRead.asOf)||executionRead.asOf<0)throw Error('ASOF_INVALID');
  for(const key of ['pending','openPositions','closedTrades'])if(!Array.isArray(executionRead[key]))throw Error(key.toUpperCase()+'_REQUIRED');
  if(!object(executionRead.diagnostics))throw Error('DIAGNOSTICS_REQUIRED');

  const declaredBook=text(status.canonical_book)?status.canonical_book:null;
  const declaredRole=declaredBook&&text(status.canonical_book_role)?status.canonical_book_role:null;
  if(executionRead.canonicalBook!==declaredBook)throw Error('CANONICAL_BOOK_MISMATCH');
  if(executionRead.canonicalBookRole!==declaredRole)throw Error('CANONICAL_BOOK_ROLE_MISMATCH');

  if(executionRead.canonicalNav!==null){
    if(declaredRole!=='PRIMARY'||!finite(executionRead.canonicalNav))throw Error('CANONICAL_NAV_INVALID');
    const expected=`runtime_snapshot.books.${declaredBook}.equity`;
    if(executionRead.canonicalNavSource!==expected)throw Error('CANONICAL_NAV_SOURCE_INVALID');
  }else if(executionRead.canonicalNavSource!==null){
    throw Error('CANONICAL_NAV_SOURCE_WITHOUT_NAV');
  }

  if(typeof executionRead.ledgerIntegrity!=='boolean')throw Error('LEDGER_INTEGRITY_REQUIRED');
  if(typeof status.ledger_integrity==='boolean'&&status.ledger_integrity!==executionRead.ledgerIntegrity)throw Error('LEDGER_INTEGRITY_MISMATCH');
}

function diagnosticNumber(diagnostics,key){
  const value=diagnostics[key];
  return Number.isInteger(value)&&value>=0?value:null;
}

function buildRuntimeReadModel({status,executionRead}={}){
  assertRuntimeInputs(status,executionRead);

  const canonicalReady=executionRead.canonicalBookRole==='PRIMARY'&&finite(executionRead.canonicalNav);
  const runtimeHealthy=status.ok===true&&executionRead.health==='HEALTHY'&&executionRead.ledgerIntegrity===true&&canonicalReady;
  const diagnostics=clone(executionRead.diagnostics);

  return Object.freeze({
    schema_version:'foxyya-runtime/1',
    api_version:'v12',
    mode:'PAPER_ONLY',
    as_of:executionRead.asOf,
    read_only:true,
    execution_write:false,
    runtime:Object.freeze({
      status:runtimeHealthy?'ONLINE':'DEGRADED',
      started_ms:finite(status.started_ms)?status.started_ms:null,
      uptime_seconds:finite(status.uptime_seconds)&&status.uptime_seconds>=0?status.uptime_seconds:null,
      cycle_count:status.cycle_count,
      last_cycle:object(status.last_cycle)?clone(status.last_cycle):null,
      last_error:object(status.last_error)?clone(status.last_error):null
    }),
    safety:Object.freeze({
      paper_only:true,
      real_order_lock:true,
      real_order_capability:false,
      private_api_enabled:false,
      signed_order_enabled:false,
      backfill_allowed:false,
      research_execution_write:false
    }),
    strategy:Object.freeze({
      control_version:executionRead.strategyVersion
    }),
    execution:Object.freeze({
      qualified_24h:diagnosticNumber(executionRead.diagnostics,'qualified_24h'),
      filled_24h:diagnosticNumber(executionRead.diagnostics,'filled_24h'),
      cancelled_24h:diagnosticNumber(executionRead.diagnostics,'cancelled_24h'),
      backfill_count:diagnosticNumber(executionRead.diagnostics,'backfill_count'),
      duplicate_fill_count:diagnosticNumber(executionRead.diagnostics,'duplicate_fill_count'),
      pending:executionRead.pending.length,
      open_positions:executionRead.openPositions.length,
      closed_trades:executionRead.closedTrades.length
    }),
    positions:Object.freeze({
      open:Object.freeze(clone(executionRead.openPositions)),
      pending:Object.freeze(clone(executionRead.pending))
    }),
    ledger:Object.freeze({
      status:executionRead.ledgerIntegrity&&canonicalReady?'HEALTHY':'DEGRADED',
      integrity:executionRead.ledgerIntegrity,
      canonical_book:executionRead.canonicalBook,
      canonical_book_role:executionRead.canonicalBookRole,
      canonical_nav:executionRead.canonicalNav,
      canonical_nav_source:executionRead.canonicalNavSource,
      event_count:integerOrNull(executionRead.ledgerEvents),
      currency:'USDT'
    }),
    diagnostics:Object.freeze(diagnostics),
    provenance:Object.freeze({
      generated_at:executionRead.asOf,
      source_endpoints:Object.freeze(['/api/runtime/status','/api/runtime/snapshot'])
    })
  });
}

module.exports=Object.freeze({buildRuntimeReadModel});
