'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {backupLineageFile}=require('./lineage_bucket_backup.js');
const {backupLineageFileHttp}=require('./lineage_http_backup.js');
const {createDurableSourceLineageStore,EVENT_SCHEMA,FRAME_SCHEMA}=require('./durable_source_lineage_store.js');

function nonEmpty(value){return typeof value==='string'&&value.trim().length>0;}
function s3Configured(config){
  return config&&typeof config==='object'&&['endpoint','region','bucket','accessKeyId','secretAccessKey'].every(key=>nonEmpty(config[key]));
}
function httpConfigured(config){return config&&typeof config==='object'&&nonEmpty(config.baseUrl)&&nonEmpty(config.token);}
function storageKind(filePath,fsImpl=fs){
  if(!fsImpl.existsSync(filePath))return 'ABSENT';
  let fd=null;
  try{
    fd=fsImpl.openSync(filePath,'r');
    const stat=fsImpl.fstatSync(fd);
    if(!stat.size)return 'EMPTY';
    const length=Math.min(stat.size,4096);
    const buffer=Buffer.alloc(length);
    const read=fsImpl.readSync(fd,buffer,0,length,0);
    const prefix=buffer.subarray(0,read).toString('utf8');
    if(prefix.includes(`"schema":"${EVENT_SCHEMA}"`))return 'LEGACY';
    if(prefix.includes(`"schema":"${FRAME_SCHEMA}"`))return 'COMPRESSED';
    return 'UNKNOWN';
  }finally{if(fd!==null)fsImpl.closeSync(fd);}
}
function s3BackupKey(filePath,stat){
  const name=path.basename(filePath).replace(/[^A-Za-z0-9._-]/g,'_');
  return `lineage-backups/${name}.${stat.size}.${Math.floor(stat.mtimeMs)}.legacy.jsonl`;
}
function httpBackupKey(filePath,stat){
  const name=path.basename(filePath,'.lineage.jsonl').replace(/[^A-Za-z0-9._-]/g,'_');
  return `${name}-${stat.size}-${Math.floor(stat.mtimeMs)}`.slice(0,160);
}
function statFingerprint(stat){return `${stat.size}:${stat.mtimeMs}`;}

async function prepareDurableLineageStore({
  filePath,
  now=Date.now,
  fsImpl=fs,
  compactThresholdBytes=0,
  scratchDir='/tmp',
  backupConfig=null,
  httpBackupConfig=null,
  backupLineageFileImpl=backupLineageFile,
  backupLineageFileHttpImpl=backupLineageFileHttp,
  createStoreImpl=createDurableSourceLineageStore
}={}){
  if(!nonEmpty(filePath)||typeof now!=='function'||!fsImpl||typeof fsImpl!=='object'||typeof backupLineageFileImpl!=='function'||typeof backupLineageFileHttpImpl!=='function'||typeof createStoreImpl!=='function')throw Error('LINEAGE_MIGRATION_CONFIG_INVALID');
  if(!Number.isInteger(compactThresholdBytes)||compactThresholdBytes<0)throw Error('LINEAGE_COMPACT_THRESHOLD_INVALID');
  const exists=fsImpl.existsSync(filePath);
  const before=exists?fsImpl.statSync(filePath):null;
  const kind=storageKind(filePath,fsImpl);
  if(kind==='UNKNOWN')throw Error('LINEAGE_JOURNAL_FORMAT_UNKNOWN');
  const needsMigration=Boolean(before&&before.size>=compactThresholdBytes&&compactThresholdBytes>0&&kind==='LEGACY');

  if(!needsMigration){
    const store=createStoreImpl({filePath,now,fsImpl,compactThresholdBytes});
    return Object.freeze({store,migration:Object.freeze({status:'NOT_REQUIRED',backup:null,backupChannel:null,storageKind:kind})});
  }

  let backup;
  let backupChannel;
  if(s3Configured(backupConfig)){
    const key=s3BackupKey(filePath,before);
    backup=await backupLineageFileImpl({
      filePath,key,
      endpoint:backupConfig.endpoint.trim(),region:backupConfig.region.trim(),bucket:backupConfig.bucket.trim(),
      accessKeyId:backupConfig.accessKeyId.trim(),secretAccessKey:backupConfig.secretAccessKey,now
    });
    if(!backup||backup.status!=='VERIFIED'||backup.key!==key||backup.size!==before.size||!nonEmpty(backup.sha256))throw Error('LINEAGE_BACKUP_VERIFY_FAILED');
    backupChannel='S3';
  }else if(httpConfigured(httpBackupConfig)){
    const key=httpBackupKey(filePath,before);
    backup=await backupLineageFileHttpImpl({
      filePath,key,baseUrl:httpBackupConfig.baseUrl.trim(),token:httpBackupConfig.token
    });
    if(!backup||backup.status!=='VERIFIED'||backup.key!==key||backup.size!==before.size||!nonEmpty(backup.sha256))throw Error('LINEAGE_BACKUP_VERIFY_FAILED');
    backupChannel='HTTP_HELPER';
  }else{
    throw Error('LINEAGE_BACKUP_REQUIRED');
  }

  const after=fsImpl.statSync(filePath);
  if(statFingerprint(after)!==statFingerprint(before))throw Error('LINEAGE_BACKUP_SOURCE_CHANGED');

  const store=createStoreImpl({
    filePath,now,fsImpl,compactThresholdBytes,compactScratchDir:scratchDir,externalBackupVerified:true
  });
  return Object.freeze({
    store,
    migration:Object.freeze({
      status:'COMPACTED',storageKind:'COMPRESSED',originalBytes:before.size,
      compactedBytes:fsImpl.statSync(filePath).size,backupChannel,
      backup:Object.freeze({...backup})
    })
  });
}

module.exports=Object.freeze({storageKind,prepareDurableLineageStore});
