'use strict';

const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {Transform}=require('node:stream');

function nonEmpty(value){return typeof value==='string'&&value.trim().length>0;}
function validKey(value){return typeof value==='string'&&/^[A-Za-z0-9._-]{1,160}$/.test(value);}
function safeEqual(a,b){const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function authorized(req,token){const value=String(req.headers.authorization||'');return value.startsWith('Bearer ')&&safeEqual(value.slice(7),token);}
function respond(res,status,headers={}){res.writeHead(status,headers);res.end();}
function fsyncFile(filePath,fsImpl){let fd=null;try{fd=fsImpl.openSync(filePath,'r+');fsImpl.fsyncSync(fd);}finally{if(fd!==null)fsImpl.closeSync(fd);}}
function cleanup(paths,fsImpl){for(const item of paths){try{if(fsImpl.existsSync(item))fsImpl.unlinkSync(item);}catch(_error){}}}
function parseTarget(req){
  let url;try{url=new URL(req.url||'/','http://backup.local')}catch(_error){return null}
  const match=url.pathname.match(/^\/v1\/lineage-backups\/([^/]+)$/);if(!match)return null;
  let key;try{key=decodeURIComponent(match[1])}catch(_error){return null}
  return validKey(key)?key:null;
}

function createLineageBackupHandler({storageDir,token,durableStorage=false,fsImpl=fs,now=Date.now}={}){
  if(!nonEmpty(storageDir)||!nonEmpty(token)||typeof durableStorage!=='boolean'||!fsImpl||typeof fsImpl!=='object'||typeof now!=='function')throw Error('LINEAGE_BACKUP_RECEIVER_CONFIG_INVALID');
  const root=path.resolve(storageDir);fsImpl.mkdirSync(root,{recursive:true});

  return function lineageBackupHandler(req,res){
    const key=parseTarget(req);if(!key){respond(res,404);return;}
    if(!authorized(req,token)){respond(res,401);return;}
    if(!durableStorage){if(req.method==='PUT')req.resume();respond(res,503,{'x-foxyya-durable-storage':'false'});return;}
    const gzPath=path.join(root,`${key}.lineage.jsonl.gz`);
    const metaPath=path.join(root,`${key}.meta.json`);

    if(req.method==='HEAD'){
      if(!fsImpl.existsSync(gzPath)||!fsImpl.existsSync(metaPath)){respond(res,404);return;}
      let meta;try{meta=JSON.parse(fsImpl.readFileSync(metaPath,'utf8'));}catch(_error){respond(res,500);return;}
      if(meta.status!=='VERIFIED'||meta.durableStorage!==true||!Number.isInteger(meta.rawSize)||!nonEmpty(meta.rawSha256)||!Number.isInteger(meta.compressedSize)){respond(res,500);return;}
      respond(res,200,{
        'x-foxyya-backup-status':'VERIFIED','x-foxyya-durable-storage':'true',
        'x-foxyya-raw-size':String(meta.rawSize),'x-foxyya-raw-sha256':meta.rawSha256,
        'x-foxyya-compressed-size':String(meta.compressedSize),etag:meta.etag||`"${meta.rawSha256}"`
      });return;
    }

    if(req.method!=='PUT'){respond(res,405);return;}
    const declaredSize=Number(req.headers['x-foxyya-raw-size']);
    const declaredSha=String(req.headers['x-foxyya-raw-sha256']||'').toLowerCase();
    const contentLength=Number(req.headers['content-length']);
    if(!Number.isInteger(declaredSize)||declaredSize<0||!Number.isInteger(contentLength)||contentLength!==declaredSize||!/^[a-f0-9]{64}$/.test(declaredSha)){req.resume();respond(res,400);return;}

    const suffix=`${process.pid}-${Number(now())}`;
    const gzTemp=path.join(root,`.${key}.${suffix}.gz.tmp`);
    const metaTemp=path.join(root,`.${key}.${suffix}.meta.tmp`);
    cleanup([gzTemp,metaTemp],fsImpl);
    const hash=crypto.createHash('sha256');let rawBytes=0;let replied=false;
    const fail=(status=500)=>{if(replied)return;replied=true;cleanup([gzTemp,metaTemp],fsImpl);respond(res,status);};
    const tap=new Transform({transform(chunk,_encoding,callback){rawBytes+=chunk.length;hash.update(chunk);callback(null,chunk);}});
    const gzip=zlib.createGzip({level:9});
    const output=fsImpl.createWriteStream(gzTemp,{flags:'wx'});
    req.once('aborted',()=>fail(400));req.once('error',()=>fail(500));tap.once('error',()=>fail(500));gzip.once('error',()=>fail(500));output.once('error',()=>fail(500));
    output.once('finish',()=>{
      if(replied)return;
      let actualSha;try{actualSha=hash.digest('hex');}catch(_error){fail(500);return;}
      if(rawBytes!==declaredSize||actualSha!==declaredSha){fail(422);return;}
      try{
        fsyncFile(gzTemp,fsImpl);
        const compressedSize=fsImpl.statSync(gzTemp).size;
        const meta={schema:'foxyya-lineage-backup/1',status:'VERIFIED',durableStorage:true,key,rawSize:rawBytes,rawSha256:actualSha,compressedSize,createdAt:Number(now()),etag:`"${actualSha}"`};
        fsImpl.writeFileSync(metaTemp,JSON.stringify(meta)+'\n',{encoding:'utf8',flag:'wx'});fsyncFile(metaTemp,fsImpl);
        fsImpl.renameSync(gzTemp,gzPath);fsImpl.renameSync(metaTemp,metaPath);replied=true;
        respond(res,201,{
          'x-foxyya-backup-status':'VERIFIED','x-foxyya-durable-storage':'true','x-foxyya-raw-size':String(rawBytes),
          'x-foxyya-raw-sha256':actualSha,'x-foxyya-compressed-size':String(compressedSize),etag:meta.etag
        });
      }catch(_error){cleanup([gzTemp,metaTemp,gzPath,metaPath],fsImpl);fail(500);}
    });
    req.pipe(tap).pipe(gzip).pipe(output);
  };
}

module.exports=Object.freeze({createLineageBackupHandler});
