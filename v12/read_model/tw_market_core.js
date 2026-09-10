'use strict';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);

function assertNow(nowMs){
  if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');
  return nowMs;
}

function validateCore(value,venue,nowMs){
  if(value===undefined||value===null)return null;
  if(!object(value)||value.market!=='TW'||value.venue!==venue||value.researchOnly!==true||value.executionWrite!==false)throw Error('TW_MARKET_INPUT_INVALID');
  if(!finite(value.asOf)||value.asOf<0||value.asOf>nowMs)throw Error('TW_MARKET_INPUT_INVALID');
  const index=venue==='TWSE'?value.taiex:value.otc;
  if(!object(index)||!finite(index.close)||!finite(index.change)||!finite(index.changePct)||!object(value.breadth))throw Error('TW_MARKET_INPUT_INVALID');
  for(const key of ['advancers','decliners','unchanged','limitUp','limitDown'])if(!finite(value.breadth[key])||value.breadth[key]<0)throw Error('TW_MARKET_INPUT_INVALID');
  return value;
}

function validateTurnover(value,nowMs){
  if(value===undefined||value===null)return null;
  if(!object(value)||value.market!=='TW'||value.venue!=='TPEX'||value.researchOnly!==true||value.executionWrite!==false||!finite(value.asOf)||value.asOf<0||value.asOf>nowMs||!Array.isArray(value.sectors))throw Error('TW_MARKET_INPUT_INVALID');
  return value;
}

function combinedBreadth(twse,tpex){
  if(!twse&&!tpex)return null;
  const rows=[twse?.breadth,tpex?.breadth].filter(Boolean);
  const advancers=rows.reduce((sum,row)=>sum+row.advancers,0);
  const decliners=rows.reduce((sum,row)=>sum+row.decliners,0);
  const unchanged=rows.reduce((sum,row)=>sum+row.unchanged,0);
  const limitUp=rows.reduce((sum,row)=>sum+row.limitUp,0);
  const limitDown=rows.reduce((sum,row)=>sum+row.limitDown,0);
  const advanceDeclineRatio=decliners===0?(advancers>0?Infinity:0):advancers/decliners;
  return Object.freeze({advancers,decliners,unchanged,limitUp,limitDown,advanceDeclineRatio});
}

function directionState(twse,tpex,combined){
  if(!twse||!tpex||!combined)return 'UNAVAILABLE';
  const taiex=twse.taiex.changePct;
  const otc=tpex.otc.changePct;
  const ratio=combined.advanceDeclineRatio;
  if(taiex>0&&otc>0&&ratio>=1.25)return 'BROAD_ADVANCE';
  if(taiex<0&&otc<0&&ratio<=0.8)return 'BROAD_DECLINE';
  return 'MIXED';
}

function confidenceFor(state,twse,tpex,combined){
  if(state==='UNAVAILABLE'||!twse||!tpex||!combined)return 0;
  const a=twse.taiex.changePct,b=tpex.otc.changePct;
  const sameDirection=(a>0&&b>0)||(a<0&&b<0);
  const ratio=combined.advanceDeclineRatio;
  const breadthStrength=Number.isFinite(ratio)
    ?(ratio>=1?Math.min(1,ratio-1):Math.min(1,(1-ratio)/0.75))
    :1;
  const indexStrength=Math.min(1,(Math.abs(a)+Math.abs(b))/4);
  const score=(sameDirection?0.45:0)+0.35*breadthStrength+0.20*indexStrength;
  return Math.round(Math.min(1,score)*10000)/10000;
}

function industries(twse,turnover){
  const twRows=Array.isArray(twse?.industries)?[...twse.industries]:[];
  const leaders=twRows.filter(row=>finite(row?.changePct)&&row.changePct>0).sort((a,b)=>b.changePct-a.changePct).slice(0,3);
  const laggards=twRows.filter(row=>finite(row?.changePct)&&row.changePct<0).sort((a,b)=>a.changePct-b.changePct).slice(0,3);
  const turnoverRows=Array.isArray(turnover?.sectors)?[...turnover.sectors].filter(row=>finite(row?.tradeWeightPct)).sort((a,b)=>b.tradeWeightPct-a.tradeWeightPct).slice(0,5):[];
  return Object.freeze({
    twseLeaders:Object.freeze(leaders.map(row=>Object.freeze({...row}))),
    twseLaggards:Object.freeze(laggards.map(row=>Object.freeze({...row}))),
    tpexTurnoverLeaders:Object.freeze(turnoverRows.map(row=>Object.freeze({...row})))
  });
}

function buildTaiwanMarketCore(input={}){
  const nowMs=assertNow(input.nowMs);
  const twse=validateCore(input.twse,'TWSE',nowMs);
  const tpex=validateCore(input.tpex,'TPEX',nowMs);
  const turnover=validateTurnover(input.tpexIndustryTurnover,nowMs);
  const availableCore=[twse,tpex].filter(Boolean);
  const status=availableCore.length?'AVAILABLE':'UNAVAILABLE';
  const directionCoverage=availableCore.length===2?'COMPLETE':availableCore.length===1?'PARTIAL':'NONE';
  const twseIndustryAvailable=Array.isArray(twse?.industries)&&twse.industries.length>0;
  const tpexIndustryAvailable=Array.isArray(turnover?.sectors)&&turnover.sectors.length>0;
  const industryCoverage=twseIndustryAvailable&&tpexIndustryAvailable?'COMPLETE':(twseIndustryAvailable||tpexIndustryAvailable?'PARTIAL':'NONE');
  const combined=combinedBreadth(twse,tpex);
  const state=directionState(twse,tpex,combined);
  const confidence=confidenceFor(state,twse,tpex,combined);
  const missingSources=[];
  if(!twse)missingSources.push('TWSE_MARKET_CORE');
  if(!tpex)missingSources.push('TPEX_MARKET_CORE');
  if(!turnover)missingSources.push('TPEX_INDUSTRY_TURNOVER');
  const asOf=availableCore.length||turnover?Math.max(0,...[twse?.asOf,tpex?.asOf,turnover?.asOf].filter(finite)):nowMs;

  return Object.freeze({
    schemaVersion:'foxyya-tw-market-core/1',
    market:'TW',status,state,confidence,asOf,
    directionCoverage,industryCoverage,
    missingSources:Object.freeze(missingSources),
    data:Object.freeze({
      taiex:twse?Object.freeze({...twse.taiex}):null,
      otc:tpex?Object.freeze({...tpex.otc}):null,
      breadth:Object.freeze({
        twse:twse?Object.freeze({...twse.breadth}):null,
        tpex:tpex?Object.freeze({...tpex.breadth}):null,
        combined
      }),
      industries:industries(twse,turnover)
    }),
    researchOnly:true,
    executionWrite:false
  });
}

module.exports=Object.freeze({buildTaiwanMarketCore});
