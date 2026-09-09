'use strict';

const {startStagingPreviewServer}=require('./server.js');

function runtimeConfig(env=process.env){
  const host=typeof env.HOST==='string'&&env.HOST.trim()?env.HOST.trim():'0.0.0.0';
  const rawPort=env.PORT===undefined||env.PORT===null||String(env.PORT).trim()===''?'8080':String(env.PORT).trim();
  if(!/^\d+$/.test(rawPort))throw Error('PORT_INVALID');
  const port=Number(rawPort);
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('PORT_INVALID');

  const lineageFilePath=typeof env.FOXYYA_V12_LINEAGE_PATH==='string'&&env.FOXYYA_V12_LINEAGE_PATH.trim()
    ?env.FOXYYA_V12_LINEAGE_PATH.trim()
    :'/data/foxyya-v12.lineage.jsonl';
  if(!lineageFilePath.endsWith('.lineage.jsonl'))throw Error('LINEAGE_JOURNAL_PATH_INVALID');

  return Object.freeze({
    host,
    port,
    lineageFilePath,
    researchOnly:true,
    executionWrite:false
  });
}

async function startFromEnvironment(env=process.env){
  const config=runtimeConfig(env);
  return startStagingPreviewServer({
    host:config.host,
    port:config.port,
    lineageFilePath:config.lineageFilePath
  });
}

if(require.main===module){
  startFromEnvironment().then(runtime=>{
    const address=runtime.address;
    console.log(`FOXYYA v12 staging listening on ${address.address}:${address.port}`);
    console.log('FOXYYA v12 staging mode: RESEARCH_ONLY=true EXECUTION_WRITE=false');

    let closing=false;
    const shutdown=()=>{
      if(closing)return;
      closing=true;
      runtime.close().then(()=>process.exit(0)).catch(error=>{
        console.error('FOXYYA v12 staging shutdown failed:',error?.message||error);
        process.exit(1);
      });
    };
    process.once('SIGTERM',shutdown);
    process.once('SIGINT',shutdown);
  }).catch(error=>{
    console.error('FOXYYA v12 staging failed to start:',error?.message||error);
    process.exit(1);
  });
}

module.exports=Object.freeze({runtimeConfig,startFromEnvironment});
