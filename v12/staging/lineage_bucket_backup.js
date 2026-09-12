'use strict';

const fs=require('node:fs');
const crypto=require('node:crypto');
const http=require('node:http');
const https=require('node:https');

const UNSIGNED_PAYLOAD='UNSIGNED-PAYLOAD';

function nonEmpty(value){return typeof value==='string'&&value.trim().length>0;}
function hmac(key,value,encoding){return crypto.createHmac('sha256',key).update(value,'utf8').digest(encoding);}
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function amzTimestamp(ms){
  const d=new Date(ms);
  if(!Number.isFinite(d.getTime()))throw Error('LINEAGE_BACKUP_CLOCK_INVALID');
  return d.toISOString().replace(/[:-]|\.\d{3}/g,'');
}
function encodePath(value){return value.split('/').map(part=>encodeURIComponent(part).replace(/[!'()*]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase())).join('/');}
function targetUrl(endpoint,bucket,key){
  let base;
  try{base=new URL(endpoint)}catch(_error){throw Error('LINEAGE_BACKUP_CONFIG_INVALID')}
  if(!/^https?:$/.test(base.protocol)||base.search||base.hash||!base.hostname)throw Error('LINEAGE_BACKUP_CONFIG_INVALID');
  const prefix=base.pathname.replace(/\/+$/,'');
  base.pathname=`${prefix}/${encodeURIComponent(bucket)}/${encodePath(key)}`.replace(/\/+/g,'/');
  return base;
}
function signingKey(secret,date,region){
  const kDate=hmac(Buffer.from('AWS4'+secret,'utf8'),date);
  const kRegion=hmac(kDate,region);
  const kService=hmac(kRegion,'s3');
  return hmac(kService,'aws4_request');
}
function signedHeadersFor({method,url,region,accessKeyId,secretAccessKey,amzDate,shaHex,checksumB64}){
  const headers={
    host:url.host,
    'x-amz-content-sha256':UNSIGNED_PAYLOAD,
    'x-amz-date':amzDate
  };
  if(method==='PUT'){
    headers['x-amz-checksum-sha256']=checksumB64;
    headers['x-amz-meta-sha256']=shaHex;
  }
  const names=Object.keys(headers).sort();
  const canonicalHeaders=names.map(name=>`${name}:${String(headers[name]).trim()}\n`).join('');
  const signedHeaders=names.join(';');
  const canonicalRequest=[method,url.pathname,'',canonicalHeaders,signedHeaders,UNSIGNED_PAYLOAD].join('\n');
  const dateStamp=amzDate.slice(0,8);
  const scope=`${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign=['AWS4-HMAC-SHA256',amzDate,scope,sha256(canonicalRequest)].join('\n');
  const signature=hmac(signingKey(secretAccessKey,dateStamp,region),stringToSign,'hex');
  return {
    ...headers,
    authorization:`AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

function hashFile(filePath){
  return new Promise((resolve,reject)=>{
    const hash=crypto.createHash('sha256');
    const stream=fs.createReadStream(filePath,{highWaterMark:1024*1024});
    stream.on('data',chunk=>hash.update(chunk));
    stream.once('error',()=>reject(Error('LINEAGE_BACKUP_READ_FAILED')));
    stream.once('end',()=>resolve(hash.digest('hex')));
  });
}

function request({method,url,headers,filePath}){
  return new Promise((resolve,reject)=>{
    const transport=url.protocol==='https:'?https:http;
    const req=transport.request({
      protocol:url.protocol,
      hostname:url.hostname,
      port:url.port||undefined,
      method,
      path:url.pathname+url.search,
      headers
    },res=>{
      const chunks=[];
      res.on('data',chunk=>{if(chunks.reduce((n,b)=>n+b.length,0)<64*1024)chunks.push(chunk)});
      res.on('end',()=>resolve({status:res.statusCode||0,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
    });
    req.once('error',()=>reject(Error('LINEAGE_BACKUP_REQUEST_FAILED')));
    if(method==='PUT'){
      const stream=fs.createReadStream(filePath,{highWaterMark:1024*1024});
      stream.once('error',()=>{req.destroy();reject(Error('LINEAGE_BACKUP_READ_FAILED'))});
      stream.pipe(req);
      return;
    }
    req.end();
  });
}

function validateConfig(input){
  const required=['filePath','key','endpoint','region','bucket','accessKeyId','secretAccessKey'];
  if(!input||typeof input!=='object'||required.some(key=>!nonEmpty(input[key]))||typeof input.now!=='function')throw Error('LINEAGE_BACKUP_CONFIG_INVALID');
  if(!input.filePath.endsWith('.lineage.jsonl')||input.key.startsWith('/')||input.key.includes('..'))throw Error('LINEAGE_BACKUP_CONFIG_INVALID');
  let stat;
  try{stat=fs.statSync(input.filePath)}catch(_error){throw Error('LINEAGE_BACKUP_CONFIG_INVALID')}
  if(!stat.isFile())throw Error('LINEAGE_BACKUP_CONFIG_INVALID');
  return stat;
}

async function backupLineageFile(input){
  const stat=validateConfig(input);
  const nowValue=Number(input.now());
  if(!Number.isFinite(nowValue)||nowValue<0)throw Error('LINEAGE_BACKUP_CLOCK_INVALID');
  const url=targetUrl(input.endpoint.trim(),input.bucket.trim(),input.key.trim());
  const shaHex=await hashFile(input.filePath);
  const checksumB64=Buffer.from(shaHex,'hex').toString('base64');
  const amzDate=amzTimestamp(nowValue);
  const putSigned=signedHeadersFor({
    method:'PUT',url,region:input.region.trim(),accessKeyId:input.accessKeyId.trim(),secretAccessKey:input.secretAccessKey,
    amzDate,shaHex,checksumB64
  });
  const put=await request({
    method:'PUT',url,filePath:input.filePath,
    headers:{...putSigned,'content-length':String(stat.size),'content-type':'application/x-ndjson'}
  });
  if(put.status<200||put.status>=300)throw Error('LINEAGE_BACKUP_UPLOAD_FAILED');

  const headAmzDate=amzTimestamp(Number(input.now()));
  const headSigned=signedHeadersFor({
    method:'HEAD',url,region:input.region.trim(),accessKeyId:input.accessKeyId.trim(),secretAccessKey:input.secretAccessKey,
    amzDate:headAmzDate,shaHex,checksumB64
  });
  const head=await request({method:'HEAD',url,headers:headSigned});
  if(head.status<200||head.status>=300)throw Error('LINEAGE_BACKUP_VERIFY_FAILED');
  const remoteSize=Number(head.headers['content-length']);
  const remoteSha=String(head.headers['x-amz-meta-sha256']||'').toLowerCase();
  const remoteChecksum=String(head.headers['x-amz-checksum-sha256']||'');
  if(remoteSize!==stat.size||remoteSha!==shaHex.toLowerCase()||(remoteChecksum&&remoteChecksum!==checksumB64))throw Error('LINEAGE_BACKUP_VERIFY_FAILED');
  return Object.freeze({status:'VERIFIED',key:input.key.trim(),size:stat.size,sha256:shaHex,etag:String(head.headers.etag||put.headers.etag||'')});
}

module.exports=Object.freeze({backupLineageFile});
