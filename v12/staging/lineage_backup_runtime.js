'use strict';

const http=require('node:http');
const {createLineageBackupHandler}=require('./lineage_backup_receiver.js');

function runtimeConfig(env=process.env){
  const host=typeof env.HOST==='string'&&env.HOST.trim()?env.HOST.trim():'0.0.0.0';
  const rawPort=env.PORT===undefined||env.PORT===null||String(env.PORT).trim()===''?'8080':String(env.PORT).trim();
  if(!/^\d+$/.test(rawPort))throw Error('PORT_INVALID');
  const port=Number(rawPort);
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('PORT_INVALID');
  const token=typeof env.FOXYYA_V12_BACKUP_TOKEN==='string'?env.FOXYYA_V12_BACKUP_TOKEN.trim():'';
  if(!token)throw Error('LINEAGE_BACKUP_TOKEN_REQUIRED');
  const storageDir=typeof env.FOXYYA_V12_BACKUP_STORAGE_DIR==='string'&&env.FOXYYA_V12_BACKUP_STORAGE_DIR.trim()?env.FOXYYA_V12_BACKUP_STORAGE_DIR.trim():'/backup';
  if(!storageDir.startsWith('/'))throw Error('LINEAGE_BACKUP_STORAGE_INVALID');
  return Object.freeze({host,port,token,storageDir,researchOnly:true,executionWrite:false});
}

function startBackupRuntime(env=process.env){
  const config=runtimeConfig(env);
  const backupHandler=createLineageBackupHandler({storageDir:config.storageDir,token:config.token});
  const server=http.createServer((req,res)=>{
    if(req.method==='GET'&&req.url==='/health'){
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({service:'foxyya-v12-lineage-backup',status:'ok',researchOnly:true,executionWrite:false}));
      return;
    }
    if((req.method==='PUT'||req.method==='HEAD')&&String(req.url||'').startsWith('/v1/lineage-backups/')){
      backupHandler(req,res);return;
    }
    res.writeHead(404);res.end();
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(config.port,config.host,()=>{
      const address=server.address();
      resolve(Object.freeze({
        server,address,
        close:()=>new Promise((done,fail)=>server.close(error=>error?fail(error):done()))
      }));
    });
  });
}

if(require.main===module){
  startBackupRuntime().then(runtime=>{
    console.log(`FOXYYA v12 lineage backup helper listening on ${runtime.address.address}:${runtime.address.port}`);
    console.log('FOXYYA v12 lineage backup helper mode: RESEARCH_ONLY=true EXECUTION_WRITE=false');
    let closing=false;
    const shutdown=()=>{if(closing)return;closing=true;runtime.close().then(()=>process.exit(0)).catch(()=>process.exit(1));};
    process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  }).catch(error=>{console.error('FOXYYA v12 lineage backup helper failed:',error?.message||error);process.exit(1);});
}

module.exports=Object.freeze({runtimeConfig,startBackupRuntime});
