'use strict';
const {createArchive}=require('./archive.cjs');
const {REFRESH_MS}=require('./refresh.cjs');
function json(body,status=200,head=false,extra={}){return new Response(head?null:JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff',...extra}})}
async function authorized(request,password){
 const header=request.headers.get('authorization')||'';if(!header.startsWith('Basic '))return false;
 let value;try{value=atob(header.slice(6))}catch{return false}
 const expected='owen:'+password;
 // Fixed-size digests avoid comparing variable-length secrets directly.
 const digest=s=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
 const [a,b]=await Promise.all([digest(value),digest(expected)]);let diff=0;
 const x=new Uint8Array(a),y=new Uint8Array(b);for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
async function handleRequest(request,env,{now=Date.now}={}){
 const head=request.method==='HEAD',url=new URL(request.url);
 if(!env.VIEWER_PASSWORD)return json({status:'VIEWER_SECRET_REQUIRED'},503,head);
 if(!await authorized(request,env.VIEWER_PASSWORD))return json({status:'AUTH_REQUIRED'},401,head,{'www-authenticate':'Basic realm="FOXYYA", charset="UTF-8"'});
 if(!['GET','HEAD'].includes(request.method))return json({status:'METHOD_NOT_ALLOWED'},405,head,{allow:'GET, HEAD'});
 if(url.pathname==='/'||url.pathname==='/v12-preview')return new Response(null,{status:302,headers:{location:'/v12-preview/','cache-control':'no-store'}});
 if(url.pathname==='/health')return json({status:'OK',researchOnly:true,executionWrite:false},200,head);
 try{
  const archive=createArchive(env.DB);
  if(url.pathname==='/v12/api/home'){
   const home=await archive.latest();return home?json(home,200,head):json({status:'UNAVAILABLE',data:null},503,head);
  }
  if(url.pathname==='/ready'){
   const home=await archive.latest(),state=await env.DB.prepare('SELECT last_error FROM control WHERE id=1').first();
   const stale=home&&(now()-home.asOf>2*REFRESH_MS||home.asOf>now());
   const status=state?.last_error?'DEGRADED':!home?'STARTING':stale?'STALE':'READY';
   return json({status,ready:status==='READY',asOf:home?.asOf||null,refreshSeconds:7200,researchOnly:true,executionWrite:false},status==='READY'?200:503,head);
  }
  if(url.pathname.startsWith('/v12/api/lineage/output/')){
   const ref=url.pathname.slice('/v12/api/lineage/output/'.length);if(!/^out_[a-f0-9]{64}$/.test(ref))return json({status:'INVALID_LINEAGE_REF'},400,head);
   const data=await archive.trace(ref);return data?json({schemaVersion:'foxyya-lineage-trace-read/1',status:'AVAILABLE',lineageRef:ref,data,researchOnly:true,executionWrite:false},200,head):json({status:'NOT_FOUND',data:null},404,head);
  }
  if(url.pathname.startsWith('/v12/api/'))return json({status:'NOT_FOUND'},404,head);
  if(env.ASSETS){const response=await env.ASSETS.fetch(request);const headers=new Headers(response.headers);headers.set('cache-control','private, no-store');headers.set('x-content-type-options','nosniff');return new Response(head?null:response.body,{status:response.status,headers})}
  return json({status:'NOT_FOUND'},404,head);
 }catch{return json({status:'UNAVAILABLE',reason:'STORAGE_READ_FAILED',data:null},503,head)}
}
module.exports={handleRequest};
