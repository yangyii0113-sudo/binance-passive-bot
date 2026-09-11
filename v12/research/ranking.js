(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_RESEARCH_RANKING=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const STAGE_POINTS=Object.freeze({READY:20,CONFIRMING:16,ACCUMULATION:12,EARLY_WATCH:8,DETECT:4,INVALIDATED:0,UNAVAILABLE:0});
  const STAGE_LABELS=Object.freeze({READY:'條件就緒',CONFIRMING:'確認中',ACCUMULATION:'累積',EARLY_WATCH:'早期觀察',DETECT:'偵測',INVALIDATED:'已失效',UNAVAILABLE:'尚未形成'});
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const list=value=>Array.isArray(value)?value:[];
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const round=value=>Number(value.toFixed(1));

  function stageKey(value){return String(value||'UNAVAILABLE').trim().toUpperCase().replaceAll(' ','_');}
  function symbolOf(instrumentId){const raw=String(instrumentId||'');return raw.includes(':')?raw.split(':').pop():raw;}

  function freshnessPoints(asOf,nowMs){
    if(!finite(asOf)||!finite(nowMs)||nowMs<asOf)return 0;
    const ageHours=(nowMs-asOf)/3600000;
    if(ageHours<=6)return 5;
    if(ageHours<=24)return 4;
    if(ageHours<=72)return 2;
    return 0;
  }

  function unavailableGapCount(dataGaps){
    if(!object(dataGaps))return 0;
    return Object.values(dataGaps).filter(value=>value===true||String(value).toUpperCase()==='UNAVAILABLE').length;
  }

  function relevantNews(opportunity,events){
    const id=String(opportunity.instrumentId||'').toUpperCase();
    const symbol=symbolOf(id).toUpperCase();
    const market=String(opportunity.market||'').toUpperCase();
    const relevant=[];
    for(const event of list(events)){
      if(!object(event)||!finite(event.impactScore))continue;
      const assets=list(event.relatedAssets).map(x=>String(x).toUpperCase());
      const markets=list(event.relatedMarkets).map(x=>String(x).toUpperCase());
      const specific=assets.some(asset=>asset===id||asset===symbol||symbolOf(asset).toUpperCase()===symbol);
      const broad=markets.includes(market);
      if(specific||broad)relevant.push({event,specific});
    }
    return relevant;
  }

  function catalystPoints(opportunity,events){
    let best=0,bestEvent=null,specific=false;
    for(const match of relevantNews(opportunity,events)){
      const multiplier=match.specific?0.15:0.08;
      const score=clamp(match.event.impactScore*multiplier,0,match.specific?15:8);
      if(score>best){best=score;bestEvent=match.event;specific=match.specific;}
    }
    return Object.freeze({points:round(best),event:bestEvent,specific});
  }

  function priorityFor(score){
    if(score>=75)return '優先覆核';
    if(score>=55)return '值得關注';
    if(score>=35)return '持續追蹤';
    return '資料不足';
  }

  function scoreResearch(opportunity,events=[],nowMs=Date.now()){
    if(!object(opportunity)||!['US','TW'].includes(opportunity.market)||typeof opportunity.instrumentId!=='string'||!opportunity.instrumentId)throw Error('RESEARCH_OPPORTUNITY_REQUIRED');
    if(opportunity.researchOnly!==true||opportunity.executionWrite!==false)throw Error('RESEARCH_READ_ONLY_REQUIRED');
    if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');

    const research=object(opportunity.research)?opportunity.research:{};
    const early=object(opportunity.earlyTrend)?opportunity.earlyTrend:{};
    const confidence=finite(research.confidence)?clamp(research.confidence,0,1):0;
    const researchConfidence=round(confidence*40);
    const stage=stageKey(early.stage||opportunity.earlyStage);
    const earlyTrend=STAGE_POINTS[stage]??0;
    const missing=list(research.missingDimensions).length;
    const gaps=unavailableGapCount(opportunity.dataGaps);
    const dataCompleteness=round(clamp(20-missing*3-gaps*4,0,20));
    const catalyst=catalystPoints(opportunity,events);
    const freshness=freshnessPoints(opportunity.asOf,nowMs);
    const contradictions=list(research.contradictions).length;
    const contradictionPenalty=-Math.min(10,contradictions*5);
    const invalidatedPenalty=stage==='INVALIDATED'?-10:0;
    const penalty=contradictionPenalty+invalidatedPenalty;
    const researchScore=round(clamp(researchConfidence+earlyTrend+dataCompleteness+catalyst.points+freshness+penalty,0,100));

    const reasons=[
      `研究可信度 ${Math.round(confidence*100)}% → ${researchConfidence}/40`,
      `Early Trend ${STAGE_LABELS[stage]||stage} → ${earlyTrend}/20`,
      `資料完整度 ${dataCompleteness}/20${missing||gaps?`（缺研究維度 ${missing}、資料缺口 ${gaps}）`:''}`,
      catalyst.event?`新聞催化 ${catalyst.points}/15（${catalyst.specific?'標的直接相關':'市場層級'} · 影響分數 ${Math.round(catalyst.event.impactScore)}）`:'新聞催化 0/15',
      `資料新鮮度 ${freshness}/5`
    ];
    if(penalty<0)reasons.push(`反向／失效證據懲罰 ${penalty}`);

    return Object.freeze({
      market:opportunity.market,
      instrumentId:opportunity.instrumentId,
      direction:research.direction||opportunity.direction||'UNAVAILABLE',
      researchScore,
      priority:priorityFor(researchScore),
      components:Object.freeze({researchConfidence,earlyTrend,dataCompleteness,newsCatalyst:catalyst.points,freshness,penalty}),
      reasons:Object.freeze(reasons),
      catalystEventId:catalyst.event?.id||null,
      rankingPurpose:'HUMAN_REVIEW',
      researchOnly:true,
      executionWrite:false
    });
  }

  function rankResearch(opportunities,events=[],nowMs=Date.now()){
    const scored=list(opportunities).map(row=>Object.freeze({...scoreResearch(row,events,nowMs),source:row}));
    scored.sort((a,b)=>b.researchScore-a.researchScore||((b.source?.research?.confidence||0)-(a.source?.research?.confidence||0))||((b.source?.asOf||0)-(a.source?.asOf||0))||String(a.instrumentId).localeCompare(String(b.instrumentId)));
    return Object.freeze(scored.map((row,index)=>Object.freeze({...row,rank:index+1})));
  }

  return Object.freeze({scoreResearch,rankResearch});
});