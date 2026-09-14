'use strict';

// This measures publication freshness, not freshness/entitlement of every provider.
function createRuntimeReadiness({clock=Date.now,refreshSeconds=1800,buildRevision=null}={}){
  const staleAfterMs=refreshSeconds*2000;
  let startupValidated=false,inFlight=false,lastStartedAt=null,lastSuccessAt=null,lastPublishedAt=null,lastFailureAt=null,lastErrorCode=null;
  let successfulCycles=0,failedCycles=0,consecutiveSuccesses=0;
  function snapshot(){
    const now=clock();
    const stale=lastSuccessAt!==null&&(now-lastSuccessAt>staleAfterMs||now-lastPublishedAt>staleAfterMs);
    const status=lastErrorCode?'DEGRADED':(!startupValidated||lastSuccessAt===null?'STARTING':(stale?'STALE':'READY'));
    return Object.freeze({schemaVersion:'foxyya-staging-readiness/1',service:'foxyya-v12-staging',status,ready:status==='READY',
      buildRevision,startupValidated,inFlight,lastStartedAt,lastSuccessAt,lastPublishedAt,lastFailureAt,lastErrorCode,
      successfulCycles,failedCycles,consecutiveSuccesses,staleAfterMs,researchOnly:true,executionWrite:false});
  }
  return Object.freeze({snapshot,
    start(){inFlight=true;lastStartedAt=clock();},
    succeed(publishedAt){
      if(!Number.isFinite(publishedAt)||publishedAt<0||publishedAt>clock())throw Error('RESEARCH_PUBLICATION_INVALID');
      lastSuccessAt=clock();lastPublishedAt=publishedAt;lastErrorCode=null;inFlight=false;successfulCycles++;consecutiveSuccesses++;
    },
    fail(error){
      const code=String(error?.message||'').split(/[\s:]/)[0];
      lastErrorCode=['DURABLE_WRITE_FAILED','LINEAGE_JOURNAL_CORRUPT','RESEARCH_PUBLICATION_INVALID'].includes(code)?code:'RESEARCH_REFRESH_FAILED';
      lastFailureAt=clock();inFlight=false;failedCycles++;consecutiveSuccesses=0;
    },
    validateStartup(){startupValidated=true;}
  });
}
module.exports=Object.freeze({createRuntimeReadiness});
