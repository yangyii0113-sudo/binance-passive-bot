'use strict';

const ALLOWED_EXACT=new Set([
  '.github/workflows/v12-integration.yml'
]);

function normalizePath(value){
  if(typeof value!=='string'||!value.trim())throw Error('PATH_INVALID');
  const p=value.replace(/\\/g,'/').replace(/^\.\/+/, '');
  if(p.startsWith('/')||p.includes('../')||p==='..'||p.includes('/./')||p.endsWith('/..'))throw Error('PATH_INVALID');
  return p;
}

function isAllowed(p){
  if(ALLOWED_EXACT.has(p))return true;
  if(p.startsWith('docs/architecture/'))return true;
  if(p.startsWith('docs/superpowers/'))return true;
  if(/^tests\/v12_[^/]+$/.test(p))return true;
  if(p.startsWith('v12/'))return true;
  return false;
}

function auditChangedPaths(paths){
  if(!Array.isArray(paths))throw Error('PATHS_REQUIRED');
  const normalized=paths.map(normalizePath);
  const forbidden=normalized.filter(p=>!isAllowed(p));
  return Object.freeze({
    safe:forbidden.length===0,
    changed:Object.freeze([...normalized]),
    forbidden:Object.freeze([...forbidden]),
    productionReleaseAuthorized:false
  });
}

module.exports=Object.freeze({auditChangedPaths});
