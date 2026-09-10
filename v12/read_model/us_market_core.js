'use strict';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);

function validateNasdaq(value,nowMs){
  if(value===undefined||value===null)return null;
  if(!object(value)||value.schemaVersion!=='foxyya-us-nasdaq-market-snapshot/1'||value.market!=='US'||value.scope!=='NASDAQ_LISTED_US'||value.venue!=='NASDAQ')throw Error('US_MARKET_INPUT_INVALID');
  if(value.researchOnly!==true||value.executionWrite!==false||value.realtime!==false||value.fullMarketBreadthAvailable!==false)throw Error('US_MARKET_INPUT_INVALID');
  if(value.licenseStatus!=='REVIEW_REQUIRED'||value.redistributionStatus!=='NOT_CLEARED'||value.publicDisplayAllowed!==false)throw Error('US_MARKET_LICENSE_INVALID');
  if(!finite(value.asOf)||value.asOf<0||value.asOf>nowMs)throw Error('US_MARKET_INPUT_INVALID');
  if(!object(value.indices?.composite)||!object(value.indices?.nasdaq100)||!object(value.breadth)||!Array.isArray(value.sectors))throw Error('US_MARKET_INPUT_INVALID');
  for(const index of [value.indices.composite,value.indices.nasdaq100])if(!finite(index.close)||!finite(index.changePct))throw Error('US_MARKET_INPUT_INVALID');
  for(const key of ['advancers','decliners','unchanged','issueCount'])if(!finite(value.breadth[key])||value.breadth[key]<0)throw Error('US_MARKET_INPUT_INVALID');
  const ratio=value.breadth.advanceDeclineRatio;
  if(!(finite(ratio)||ratio===Infinity)||ratio<0)throw Error('US_MARKET_INPUT_INVALID');
  return value;
}

function stateFor(nasdaq){
  if(!nasdaq)return 'UNAVAILABLE';
  const composite=nasdaq.indices.composite.changePct;
  const n100=nasdaq.indices.nasdaq100.changePct;
  const ratio=nasdaq.breadth.advanceDeclineRatio;
  if(composite>0&&n100>0&&(ratio===Infinity||ratio>=1.25))return 'NASDAQ_BROAD_ADVANCE';
  if(composite<0&&n100<0&&finite(ratio)&&ratio<=0.8)return 'NASDAQ_BROAD_DECLINE';
  return 'NASDAQ_MIXED';
}

function confidenceFor(state,nasdaq){
  if(state==='UNAVAILABLE'||!nasdaq)return 0;
  const composite=nasdaq.indices.composite.changePct;
  const n100=nasdaq.indices.nasdaq100.changePct;
  const sameDirection=(composite>0&&n100>0)||(composite<0&&n100<0);
  const ratio=nasdaq.breadth.advanceDeclineRatio;
  const breadthStrength=ratio===Infinity?1:(ratio>=1?Math.min(1,ratio-1):Math.min(1,(1-ratio)/0.75));
  const indexStrength=Math.min(1,(Math.abs(composite)+Math.abs(n100))/4);
  return Math.round(Math.min(1,(sameDirection?0.45:0)+0.35*breadthStrength+0.20*indexStrength)*10000)/10000;
}

function buildUSMarketCore(input={}){
  const nowMs=input.nowMs;
  if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');
  const nasdaq=validateNasdaq(input.nasdaq,nowMs);
  const status=nasdaq?'AVAILABLE':'UNAVAILABLE';
  const state=stateFor(nasdaq);
  const missingSources=['US_FULL_MARKET_BREADTH','LICENSE_CLEARANCE'];
  if(!nasdaq)missingSources.unshift('NASDAQ_MARKET_CORE');
  return Object.freeze({
    schemaVersion:'foxyya-us-market-core/1',
    market:'US',status,state,confidence:confidenceFor(state,nasdaq),asOf:nasdaq?.asOf??nowMs,
    marketScope:nasdaq?'NASDAQ_LISTED_US':'UNAVAILABLE',latency:nasdaq?'EOD':'UNAVAILABLE',realtime:false,
    directionCoverage:'PARTIAL',fullMarketState:'UNAVAILABLE',fullMarketBreadthAvailable:false,
    licenseStatus:'REVIEW_REQUIRED',redistributionStatus:'NOT_CLEARED',publicDisplayAllowed:false,
    missingSources:Object.freeze(missingSources),
    data:nasdaq?Object.freeze({indices:nasdaq.indices,breadth:nasdaq.breadth,sectors:nasdaq.sectors,liquidity:nasdaq.liquidity}):null,
    researchOnly:true,executionWrite:false
  });
}

module.exports=Object.freeze({buildUSMarketCore});
