'use strict';

const fs=require('node:fs');
const crypto=require('node:crypto');
const http=require('node:http');
const https=require('node:https');

function nonEmpty(value){return typeof value==='string'&&value.trim().length>0;}
function validKey(value){return typeof value==='string'&&/^[A-Za-z0-9._-]{1,160}$/.test(value);}
function hashFile(filePath){
  return new Promise((resolve,reject)=>{
    const hash=crypto.createHash('sha256');
    const stream=fs.createReadStream(filePath,{highWaterMark:1024*1024});
    stream.on('data',chunk=>hash.update(chunk));
    stream.once('error',()=>reject(Error('LINEAGE_BACKUP_READ_FAILED')));
    stream.once('end',()=>resolve(hash.digest('hex')));
  });
}
function target(baseUrl,key){
  let base;try{base=new URL(baseUrl)}catch(_error){throw Error('LINEAGE_BACKUP_CONFIG_INVALID')}
  if(!/^https?:$/.test(base.protocol)||base.search||base.hash||!base.hostname)throw Error('LINEAGE_BACKUP_CONFIG_INVALID');
  base.pathname=`${base.pathname.replace(/\/+$/,'')}/v1/lineage-backups/${encodeURIComponent(key)}`.replace(/\/+/g,'/');
  return base;
}
function request({method,url,headers,filePath}){
  return new Promise((resolve,reject)=>{
    const transport=url.protocol==='https:'?https:http;
    const req=transport.request({protocol:url.protocol,hostname:url.hostname,port:url.port||undefined,method,path:url.pathname,headers},res=>{
      res.resume();res.once('end',()=>resolve({status:res.statusCode||0,headers:res.headers}));
    });
    req.once('error',()=>reject(Error('LINEAGE_BACKUP_REQUEST_FAILED')));
    if(method==='PUT'){
      const stream=fs.createReadStream(filePath,{highWaterMark:1024*1024});
      stream.once('error',()=>{req.destroy();reject(Error('LINEAGE_BACKUP_READ_FAILED'))});stream.pipe(req);return;
    }
    req.end();
  });
}

async function backupLineageFileHttp({filePath,key,baseUrl,token}={}){
  if(!nonEmpty(filePath)||!filePath.endsWith('.lineage.jsonl')||!validKey(key)||!nonEmpty(baseUrl)||!nonEmpty(token))throw Error('LINEAGE_BACKUP_CONFIG_INVALID');
  let stat;try{stat=fs.statSync(filePath)}catch(_error){throw Error('LINEAGE_BACKUP_CONFIG_INVALID')}
  if(!stat.isFile())throw Error('LINEAGE_BACKUP_CONFIG_INVALID');
  const sha=await hashFile(filePath);
  const url=target(baseUrl.trim(),key);
  const auth=`Bearer ${token}`;
  const put=await request({method:'PUT',url,filePath,headers:{authorization:auth,'content-length':String(stat.size),'x-foxyya-raw-size':String(stat.size),'x-foxyya-raw-sha256':sha,'content-type':'application/x-ndjson'}});
  if(put.status<200||put.status>=300)throw Error('LINEAGE_BACKUP_UPLOAD_FAILED');
  if(String(put.headers['x-foxyya-durable-storage']||'')!=='true')throw Error('LINEAGE_BACKUP_VERIFY_FAILED');
  const head=await request({method:'HEAD',url,headers:{authorization:auth}});
  if(head.status<200||head.status>=300)throw Error('LINEAGE_BACKUP_VERIFY_FAILED');
  const remoteStatus=String(head.headers['x-foxyya-backup-status']||'');
  const durableStorage=String(head.headers['x-foxyya-durable-storage']||'')==='true';
  const remoteSize=Number(head.headers['x-foxyya-raw-size']);
  const remoteSha=String(head.headers['x-foxyya-raw-sha256']||'').toLowerCase();
  const compressedSize=Number(head.headers['x-foxyya-compressed-size']);
  if(remoteStatus!=='VERIFIED'||!durableStorage||remoteSize!==stat.size||remoteSha!==sha||!Number.isInteger(compressedSize)||compressedSize<=0)throw Error('LINEAGE_BACKUP_VERIFY_FAILED');
  return Object.freeze({status:'VERIFIED',durableStorage:true,key,size:stat.size,sha256:sha,compressedSize,etag:String(head.headers.etag||put.headers.etag||'')});
}

module.exports=Object.freeze({backupLineageFileHttp});
