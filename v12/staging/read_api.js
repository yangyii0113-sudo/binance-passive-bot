'use strict';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const OUTPUT_REF=/^out_[a-f0-9]{64}$/;
const LINEAGE_OUTPUT_PREFIX='/v12/api/lineage/output/';

function validateHomeReadModel(value){
  if(!object(value)||value.schemaVersion!=='foxyya-home-read-model/1'||!object(value.home))throw Error('HOME_READ_MODEL_REQUIRED');
  if(value.researchOnly!==true||value.executionWrite!==false)throw Error('HOME_READ_ONLY_REQUIRED');
  if(!finite(value.asOf)||value.asOf<0)throw Error('ASOF_INVALID');
  return value;
}

function validateRuntimeReadModel(value){
  if(!object(value)||value.schema_version!=='foxyya-runtime/1'||value.api_version!=='v12')throw Error('RUNTIME_READ_MODEL_REQUIRED');
  if(value.mode!=='PAPER_ONLY'||value.read_only!==true||value.execution_write!==false)throw Error('RUNTIME_READ_ONLY_REQUIRED');
  if(!finite(value.as_of)||value.as_of<0)throw Error('ASOF_INVALID');
  if(!object(value.safety)||value.safety.paper_only!==true||value.safety.real_order_lock!==true||value.safety.real_order_capability!==false||value.safety.research_execution_write!==false)throw Error('RUNTIME_SAFETY_REQUIRED');
  if(!object(value.runtime)||!object(value.execution)||!object(value.positions)||!object(value.ledger)||!object(value.diagnostics)||!object(value.provenance))throw Error('RUNTIME_CONTENT_REQUIRED');
  if(!Array.isArray(value.positions.open)||!Array.isArray(value.positions.pending))throw Error('RUNTIME_POSITIONS_REQUIRED');
  if(value.ledger.canonical_nav!==null){
    if(typeof value.ledger.canonical_book!=='string'||!value.ledger.canonical_book||value.ledger.canonical_book_role!=='PRIMARY'||!finite(value.ledger.canonical_nav))throw Error('CANONICAL_NAV_INVALID');
    const expected=`runtime_snapshot.books.${value.ledger.canonical_book}.equity`;
    if(value.ledger.canonical_nav_source!==expected)throw Error('CANONICAL_NAV_SOURCE_INVALID');
  }else if(value.ledger.canonical_nav_source!==null){
    throw Error('CANONICAL_NAV_SOURCE_WITHOUT_NAV');
  }
  return value;
}

function validateLineageStore(value){
  if(value===undefined||value===null)return null;
  if(!object(value)||typeof value.traceOutput!=='function')throw Error('LINEAGE_STORE_INVALID');
  return value;
}

function validateTrace(value,lineageRef){
  if(!object(value)||value.researchOnly!==true||value.executionWrite!==false)throw Error('LINEAGE_TRACE_READ_ONLY_REQUIRED');
  if(!object(value.output)||value.output.lineageRef!==lineageRef)throw Error('LINEAGE_TRACE_OUTPUT_INVALID');
  if(!Array.isArray(value.sources)||!Array.isArray(value.observations))throw Error('LINEAGE_TRACE_INVALID');
  return value;
}

function createHomeSnapshotStore(){
  let current=null;

  function publish(value){
    validateHomeReadModel(value);
    if(current&&value.asOf<current.asOf)throw Error('SNAPSHOT_TIME_REGRESSION');
    current=value;
    return current;
  }

  function read(){
    return current;
  }

  return Object.freeze({publish,read});
}

function createRuntimeSnapshotStore(){
  let current=null;

  function publish(value){
    validateRuntimeReadModel(value);
    if(current&&value.as_of<current.as_of)throw Error('SNAPSHOT_TIME_REGRESSION');
    current=value;
    return current;
  }

  function read(){
    return current;
  }

  return Object.freeze({publish,read});
}

function sendJson(res,statusCode,body,{head=false}={}){
  const payload=JSON.stringify(body);
  res.statusCode=statusCode;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  if(head)return res.end();
  return res.end(payload);
}

function methodAllowed(req,res){
  const method=String(req.method||'GET').toUpperCase();
  if(method==='GET'||method==='HEAD')return method;
  res.setHeader('allow','GET, HEAD');
  sendJson(res,405,{status:'METHOD_NOT_ALLOWED'});
  return null;
}

function createReadOnlyHandler({homeStore,runtimeStore,lineageStore}={}){
  if(!homeStore||typeof homeStore.read!=='function')throw Error('HOME_STORE_REQUIRED');
  if(runtimeStore!==undefined&&runtimeStore!==null&&typeof runtimeStore.read!=='function')throw Error('RUNTIME_STORE_INVALID');
  const lineage=validateLineageStore(lineageStore);

  return function readOnlyHandler(req,res){
    const pathname=String(req.url||'').split('?')[0];
    const isHome=pathname==='/v12/api/home';
    const isRuntime=pathname==='/v12/api/runtime';
    const isLineage=pathname.startsWith(LINEAGE_OUTPUT_PREFIX);
    if(!isHome&&!isRuntime&&!isLineage)return sendJson(res,404,{status:'NOT_FOUND'});

    const method=methodAllowed(req,res);
    if(!method)return;
    const head=method==='HEAD';

    if(isHome){
      const snapshot=homeStore.read();
      if(!snapshot)return sendJson(res,503,{status:'UNAVAILABLE',data:null},{head});
      return sendJson(res,200,snapshot,{head});
    }

    if(isRuntime){
      const snapshot=runtimeStore?.read?.()||null;
      if(!snapshot)return sendJson(res,503,{status:'UNAVAILABLE',data:null},{head});
      try{validateRuntimeReadModel(snapshot)}catch(_error){
        return sendJson(res,503,{status:'UNAVAILABLE',reason:'RUNTIME_SNAPSHOT_INVALID',data:null},{head});
      }
      return sendJson(res,200,snapshot,{head});
    }

    const lineageRef=pathname.slice(LINEAGE_OUTPUT_PREFIX.length);
    if(!OUTPUT_REF.test(lineageRef))return sendJson(res,400,{status:'INVALID_LINEAGE_REF',data:null},{head});
    if(!lineage)return sendJson(res,503,{status:'UNAVAILABLE',reason:'LINEAGE_STORE_UNAVAILABLE',data:null},{head});

    let trace;
    try{trace=lineage.traceOutput(lineageRef)}catch(_error){
      return sendJson(res,503,{status:'UNAVAILABLE',reason:'LINEAGE_TRACE_FAILED',data:null},{head});
    }
    if(!trace)return sendJson(res,404,{status:'NOT_FOUND',data:null},{head});

    try{validateTrace(trace,lineageRef)}catch(_error){
      return sendJson(res,503,{status:'UNAVAILABLE',reason:'LINEAGE_TRACE_INVALID',data:null},{head});
    }

    return sendJson(res,200,Object.freeze({
      schemaVersion:'foxyya-lineage-trace-read/1',
      status:'AVAILABLE',
      lineageRef,
      data:trace,
      researchOnly:true,
      executionWrite:false
    }),{head});
  };
}

module.exports=Object.freeze({
  validateHomeReadModel,
  validateRuntimeReadModel,
  validateLineageStore,
  validateTrace,
  createHomeSnapshotStore,
  createRuntimeSnapshotStore,
  createReadOnlyHandler
});
