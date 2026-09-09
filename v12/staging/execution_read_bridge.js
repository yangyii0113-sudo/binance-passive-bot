'use strict';

const BASE_ORIGIN='https://foxyya-paper-engine-production.up.railway.app';
const ENDPOINTS=Object.freeze({
  status:'/api/runtime/status',
  snapshot:'/api/runtime/snapshot',
  backtest:'/api/backtest/latest',
  calendar:'/api/intel/calendar',
  news:'/api/intel/news'
});

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.length>0;

function available(data){return Object.freeze({status:'AVAILABLE',data,researchOnly:true,executionWrite:false});}
function unavailable(reason){return Object.freeze({status:'UNAVAILABLE',data:null,reason:text(reason)?reason:'UNAVAILABLE',researchOnly:true,executionWrite:false});}

function safeRuntime(status,snapshot){
  if(!object(status))throw Error('RUNTIME_STATUS_REQUIRED');
  if(status.paper_only!==true)throw Error('PAPER_ONLY_SAFETY_REQUIRED');
  if(status.real_order_lock!==true)throw Error('REAL_ORDER_LOCK_SAFETY_REQUIRED');
  if(status.execution_enabled===true)throw Error('EXECUTION_ENABLED_SAFETY_VIOLATION');
  if(!text(status.strategy_version))throw Error('STRATEGY_VERSION_REQUIRED');
  if(!Number.isInteger(status.cycle_count)||status.cycle_count<0)throw Error('CYCLE_COUNT_INVALID');
  if(!object(snapshot)||snapshot.schema!=='foxyya-runtime-snapshot/1')throw Error('RUNTIME_SNAPSHOT_SCHEMA_INVALID');
  if(snapshot.status!=='PAPER_ONLY'||snapshot.real_orders!==false||snapshot.complete!==true)throw Error('RUNTIME_SNAPSHOT_SAFETY_INVALID');
  if(!Array.isArray(snapshot.candidates)||!Array.isArray(snapshot.pending)||!Array.isArray(snapshot.trades))throw Error('RUNTIME_SNAPSHOT_COLLECTION_INVALID');
  if(!object(snapshot.books)||!object(snapshot.diagnostics))throw Error('RUNTIME_SNAPSHOT_CONTENT_INVALID');
  return Object.freeze({status:Object.freeze({...status}),snapshot:Object.freeze({...snapshot})});
}

function validateBacktest(payload){
  if(!object(payload)||payload.status!=='OK'||payload.mode!=='HISTORICAL BACKTEST')throw Error('BACKTEST_PAYLOAD_INVALID');
  if(!object(payload.run_config)||!object(payload.metrics)||!object(payload.report))throw Error('BACKTEST_CONTENT_INVALID');
  return Object.freeze({...payload});
}

function validateIntel(payload,label){
  if(!object(payload))throw Error(label+'_PAYLOAD_INVALID');
  if(payload.status==='UNAVAILABLE'||payload.status==='ERROR')throw Error(label+'_'+payload.status);
  return Object.freeze({...payload});
}

function createExecutionReadBridge({fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');

  async function read(path){
    const url=BASE_ORIGIN+path;
    try{
      const response=await fetchImpl(url,Object.freeze({
        method:'GET',
        headers:Object.freeze({Accept:'application/json'})
      }));
      if(!response||response.ok!==true)return unavailable('HTTP_'+(response?.status??'UNAVAILABLE'));
      const contentType=response.headers?.get?.('content-type');
      if(typeof contentType==='string'&&!contentType.toLowerCase().includes('application/json'))return unavailable('CONTENT_TYPE_INVALID');
      let payload;
      try{payload=await response.json();}catch(_error){return unavailable('JSON_INVALID');}
      return available(payload);
    }catch(_error){return unavailable('TRANSPORT_UNAVAILABLE');}
  }

  async function loadRuntime(){
    const statusResult=await read(ENDPOINTS.status);
    if(statusResult.status!=='AVAILABLE')return statusResult;
    const snapshotResult=await read(ENDPOINTS.snapshot);
    if(snapshotResult.status!=='AVAILABLE')return snapshotResult;
    try{return available(safeRuntime(statusResult.data,snapshotResult.data));}
    catch(error){return unavailable(error?.message||'RUNTIME_SAFETY_INVALID');}
  }

  async function loadBacktest(){
    const result=await read(ENDPOINTS.backtest);
    if(result.status!=='AVAILABLE')return result;
    try{return available(validateBacktest(result.data));}
    catch(error){return unavailable(error?.message||'BACKTEST_INVALID');}
  }

  async function loadCalendar(){
    const result=await read(ENDPOINTS.calendar);
    if(result.status!=='AVAILABLE')return result;
    try{return available(validateIntel(result.data,'CALENDAR'));}
    catch(error){return unavailable(error?.message||'CALENDAR_INVALID');}
  }

  async function loadNews(){
    const result=await read(ENDPOINTS.news);
    if(result.status!=='AVAILABLE')return result;
    try{return available(validateIntel(result.data,'NEWS'));}
    catch(error){return unavailable(error?.message||'NEWS_INVALID');}
  }

  return Object.freeze({loadRuntime,loadBacktest,loadCalendar,loadNews});
}

module.exports=Object.freeze({createExecutionReadBridge});