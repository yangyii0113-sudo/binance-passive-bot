'use strict';

const http=require('node:http');

const OUTPUT_REF=/^out_[a-f0-9]{64}$/;

function collectOutputRefs(value,out=new Set()){
  if(typeof value==='string'){
    if(OUTPUT_REF.test(value))out.add(value);
    return out;
  }
  if(Array.isArray(value)){
    for(const item of value)collectOutputRefs(item,out);
    return out;
  }
  if(value&&typeof value==='object'){
    for(const item of Object.values(value))collectOutputRefs(item,out);
  }
  return out;
}

function requestJson({host,port,path,timeoutMs,httpImpl=http}){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const fail=error=>{if(settled)return;settled=true;reject(error)};
    let req;
    try{
      req=httpImpl.request({host,port,path,method:'GET',headers:{accept:'application/json'}},res=>{
        const chunks=[];
        res.on('data',chunk=>chunks.push(Buffer.from(chunk)));
        res.on('error',fail);
        res.on('end',()=>{
          if(settled)return;
          let body;
          try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
          catch(_error){return fail(Error('LINEAGE_LIVE_PROBE_JSON_INVALID'))}
          settled=true;
          resolve(Object.freeze({statusCode:Number(res.statusCode||0),body}));
        });
      });
    }catch(_error){return fail(Error('LINEAGE_LIVE_PROBE_REQUEST_FAILED'))}
    req.once('error',()=>fail(Error('LINEAGE_LIVE_PROBE_REQUEST_FAILED')));
    req.setTimeout(timeoutMs,()=>{req.destroy();fail(Error('LINEAGE_LIVE_PROBE_TIMEOUT'))});
    req.end();
  });
}

async function runLineageLiveTraceProbe({host='127.0.0.1',port,timeoutMs=5000,httpImpl=http}={}){
  if(typeof host!=='string'||!host.trim())throw Error('LINEAGE_LIVE_PROBE_HOST_INVALID');
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('LINEAGE_LIVE_PROBE_PORT_INVALID');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw Error('LINEAGE_LIVE_PROBE_TIMEOUT_INVALID');
  if(!httpImpl||typeof httpImpl.request!=='function')throw Error('LINEAGE_LIVE_PROBE_HTTP_INVALID');

  const home=await requestJson({host:host.trim(),port,path:'/v12/api/home',timeoutMs,httpImpl});
  if(home.statusCode!==200)throw Error('LINEAGE_LIVE_PROBE_HOME_UNAVAILABLE');
  if(!home.body||home.body.researchOnly!==true||home.body.executionWrite!==false)throw Error('LINEAGE_LIVE_PROBE_READ_ONLY_REQUIRED');

  const refs=[...collectOutputRefs(home.body)].sort();
  if(!refs.length)throw Error('LINEAGE_LIVE_PROBE_REF_MISSING');
  const lineageRef=refs[0];

  const trace=await requestJson({host:host.trim(),port,path:`/v12/api/lineage/output/${lineageRef}`,timeoutMs,httpImpl});
  if(trace.statusCode!==200)throw Error('LINEAGE_LIVE_PROBE_TRACE_UNAVAILABLE');
  const body=trace.body;
  if(!body||body.status!=='AVAILABLE'||body.lineageRef!==lineageRef||body.researchOnly!==true||body.executionWrite!==false)throw Error('LINEAGE_LIVE_PROBE_READ_ONLY_REQUIRED');
  if(!body.data||body.data.researchOnly!==true||body.data.executionWrite!==false||body.data.output?.lineageRef!==lineageRef||!Array.isArray(body.data.sources)||!Array.isArray(body.data.observations))throw Error('LINEAGE_LIVE_PROBE_TRACE_INVALID');

  return Object.freeze({
    status:'PASSED',lineageRef,homeStatus:home.statusCode,traceStatus:trace.statusCode,
    sourceCount:body.data.sources.length,observationCount:body.data.observations.length,
    researchOnly:true,executionWrite:false
  });
}

module.exports=Object.freeze({collectOutputRefs,runLineageLiveTraceProbe});
