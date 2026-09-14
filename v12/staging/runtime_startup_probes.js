'use strict';

const {runLineageLiveTraceProbe}=require('./lineage_live_trace_probe.js');
const {runMarketCoverageLiveProbe}=require('./market_coverage_live_probe.js');

async function runStartupProbes(runtime,{runLineageProbeImpl=runLineageLiveTraceProbe,runCoverageProbeImpl=runMarketCoverageLiveProbe,logImpl=console.log}={}){
  const port=runtime?.address?.port;
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('STARTUP_PROBE_PORT_INVALID');
  if(typeof runLineageProbeImpl!=='function'||typeof runCoverageProbeImpl!=='function')throw Error('STARTUP_PROBE_IMPL_REQUIRED');
  if(typeof logImpl!=='function')throw Error('STARTUP_PROBE_LOG_REQUIRED');
  const options=Object.freeze({host:'127.0.0.1',port,timeoutMs:10000});
  const lineage=await runLineageProbeImpl(options);
  logImpl('FOXYYA v12 live lineage trace probe passed',JSON.stringify(lineage));
  const coverage=await runCoverageProbeImpl(options);
  logImpl('FOXYYA v12 live market coverage probe passed',JSON.stringify(coverage));
  return Object.freeze({lineage,coverage});
}

module.exports=Object.freeze({runStartupProbes});
