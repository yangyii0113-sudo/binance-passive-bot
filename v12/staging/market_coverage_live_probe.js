'use strict';

const http=require('node:http');

const MARKETS=Object.freeze(['CRYPTO','US','TW','KR']);

function requestText({host,port,path,timeoutMs,httpImpl=http,accept='*/*'}){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const fail=error=>{if(settled)return;settled=true;reject(error)};
    let req;
    try{
      req=httpImpl.request({host,port,path,method:'GET',headers:{accept}},res=>{
        const chunks=[];
        res.on('data',chunk=>chunks.push(Buffer.from(chunk)));
        res.on('error',fail);
        res.on('end',()=>{
          if(settled)return;
          settled=true;
          resolve(Object.freeze({statusCode:Number(res.statusCode||0),body:Buffer.concat(chunks).toString('utf8')}));
        });
      });
    }catch(_error){return fail(Error('MARKET_COVERAGE_LIVE_PROBE_REQUEST_FAILED'))}
    req.once('error',()=>fail(Error('MARKET_COVERAGE_LIVE_PROBE_REQUEST_FAILED')));
    req.setTimeout(timeoutMs,()=>{req.destroy();fail(Error('MARKET_COVERAGE_LIVE_PROBE_TIMEOUT'))});
    req.end();
  });
}

function coverageSummary(markets){
  const summary={};
  for(const market of MARKETS){
    const row=markets[market];
    summary[market]=Object.freeze({
      coverageStatus:row.coverageStatus,
      directionReadiness:row.directionReadiness||'NOT_READY',
      researchReadiness:row.researchReadiness||'NOT_READY',
      rankingEligibility:row.rankingEligibility||'NOT_ELIGIBLE',
      availableCapabilities:Object.freeze(Array.isArray(row.availableCapabilities)?[...row.availableCapabilities]:[]),
      missingCapabilities:Object.freeze(Array.isArray(row.missingCapabilities)?[...row.missingCapabilities]:[]),
      blockers:Object.freeze((Array.isArray(row.blockers)?row.blockers:[]).map(item=>Object.freeze({
        type:item?.type||'UNKNOWN',
        capability:item?.capability||null,
        sourceId:item?.sourceId||null
      })))
    });
  }
  return Object.freeze(summary);
}

function providerSummary(home){
  const datasets=Array.isArray(home?.providerDiagnostics?.datasets)?home.providerDiagnostics.datasets:[];
  const cftc=datasets.find(row=>row?.sourceId==='cftc-cot'&&row?.datasetId==='CFTC:TFF:gpe5-46if:EQUITY_INDEX')||null;
  return Object.freeze({
    cftc:cftc?Object.freeze({
      status:typeof cftc.status==='string'?cftc.status:'UNKNOWN',
      reason:cftc.reason??null,
      observedAt:typeof cftc.observedAt==='number'&&Number.isFinite(cftc.observedAt)?cftc.observedAt:null,
      receivedAt:typeof cftc.receivedAt==='number'&&Number.isFinite(cftc.receivedAt)?cftc.receivedAt:null
    }):null
  });
}

async function runMarketCoverageLiveProbe({host='127.0.0.1',port,timeoutMs=5000,httpImpl=http}={}){
  if(typeof host!=='string'||!host.trim())throw Error('MARKET_COVERAGE_LIVE_PROBE_HOST_INVALID');
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('MARKET_COVERAGE_LIVE_PROBE_PORT_INVALID');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw Error('MARKET_COVERAGE_LIVE_PROBE_TIMEOUT_INVALID');
  if(!httpImpl||typeof httpImpl.request!=='function')throw Error('MARKET_COVERAGE_LIVE_PROBE_HTTP_INVALID');

  const homeResponse=await requestText({host:host.trim(),port,path:'/v12/api/home',timeoutMs,httpImpl,accept:'application/json'});
  if(homeResponse.statusCode!==200)throw Error('MARKET_COVERAGE_LIVE_PROBE_HOME_UNAVAILABLE');
  let home;
  try{home=JSON.parse(homeResponse.body)}catch(_error){throw Error('MARKET_COVERAGE_LIVE_PROBE_HOME_JSON_INVALID')}
  if(!home||home.researchOnly!==true||home.executionWrite!==false)throw Error('MARKET_COVERAGE_LIVE_PROBE_READ_ONLY_REQUIRED');

  const coverage=home.marketCoverage;
  if(!coverage||coverage.schemaVersion!=='foxyya-market-coverage/1'||coverage.researchOnly!==true||coverage.executionWrite!==false)throw Error('MARKET_COVERAGE_LIVE_PROBE_READ_ONLY_REQUIRED');
  const marketKeys=coverage.markets&&typeof coverage.markets==='object'&&!Array.isArray(coverage.markets)?Object.keys(coverage.markets):[];
  if(marketKeys.length!==MARKETS.length||MARKETS.some((market,index)=>marketKeys[index]!==market))throw Error('MARKET_COVERAGE_LIVE_PROBE_MARKETS_INVALID');
  for(const market of MARKETS){
    const row=coverage.markets[market];
    if(!row||row.market!==market||row.researchOnly!==true||row.executionWrite!==false)throw Error('MARKET_COVERAGE_LIVE_PROBE_READ_ONLY_REQUIRED');
    if(!['READY','PARTIAL','BLOCKED','UNAVAILABLE'].includes(row.coverageStatus))throw Error('MARKET_COVERAGE_LIVE_PROBE_STATUS_INVALID');
  }
  const marketSummary=coverageSummary(coverage.markets);
  const liveProviderSummary=providerSummary(home);

  const preview=await requestText({host:host.trim(),port,path:'/v12-preview/',timeoutMs,httpImpl,accept:'text/html'});
  if(preview.statusCode!==200)throw Error('MARKET_COVERAGE_LIVE_PROBE_PREVIEW_UNAVAILABLE');
  const cssPos=preview.body.indexOf('coverage.css');
  const homeDomPos=preview.body.indexOf('home_dom.js');
  const rendererPos=preview.body.indexOf('market_coverage_renderer.js');
  const appPos=preview.body.indexOf('app.js');
  if(cssPos<0||homeDomPos<0||rendererPos<0||appPos<0||!(homeDomPos<rendererPos&&rendererPos<appPos))throw Error('MARKET_COVERAGE_LIVE_PROBE_PREVIEW_ORDER_INVALID');

  const css=await requestText({host:host.trim(),port,path:'/v12-preview/coverage.css',timeoutMs,httpImpl,accept:'text/css'});
  if(css.statusCode!==200||!css.body.includes('.coverage-grid')||!css.body.includes('@media'))throw Error('MARKET_COVERAGE_LIVE_PROBE_CSS_INVALID');

  const renderer=await requestText({host:host.trim(),port,path:'/v12-preview/market_coverage_renderer.js',timeoutMs,httpImpl,accept:'application/javascript'});
  if(renderer.statusCode!==200||!renderer.body.includes('MARKET_ORDER')||!renderer.body.includes('ensureCoverageTarget')||!renderer.body.includes('renderMarketCoverage'))throw Error('MARKET_COVERAGE_LIVE_PROBE_RENDERER_INVALID');
  for(const market of MARKETS)if(!renderer.body.includes(market))throw Error('MARKET_COVERAGE_LIVE_PROBE_RENDERER_MARKETS_INVALID');

  return Object.freeze({
    status:'PASSED',
    homeStatus:homeResponse.statusCode,
    marketCount:marketKeys.length,
    markets:Object.freeze([...marketKeys]),
    marketSummary,
    providerSummary:liveProviderSummary,
    previewStatus:preview.statusCode,
    coverageCssStatus:css.statusCode,
    rendererStatus:renderer.statusCode,
    mobileCss:css.body.includes('@media'),
    researchOnly:true,
    executionWrite:false
  });
}

module.exports=Object.freeze({MARKETS,runMarketCoverageLiveProbe});