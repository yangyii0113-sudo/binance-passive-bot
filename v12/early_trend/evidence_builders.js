'use strict';

const STATUS_RANK=Object.freeze({UNAVAILABLE:0,STALE:1,SNAPSHOT:2,DELAYED:3,LIVE:4});
const GUIDANCE_FIELDS=Object.freeze([
  'guidance.sales_fy',
  'guidance.operating_profit_fy',
  'guidance.net_profit_fy',
  'guidance.eps_fy',
]);

const finite=x=>typeof x==='number'&&Number.isFinite(x);
const clamp=x=>Math.max(-1,Math.min(1,x));
const round=x=>Number(x.toFixed(6));
const text=x=>typeof x==='string'&&x.length>0;

function usableObservation(x){
  return x&&typeof x==='object'&&finite(x.value)&&Object.hasOwn(STATUS_RANK,x.status)&&STATUS_RANK[x.status]>0&&finite(x.confidence)&&x.confidence>=0&&x.confidence<=1&&finite(x.receivedAt)&&x.receivedAt>=0&&text(x.source);
}

function worstStatus(items){
  if(!items.length)return'UNAVAILABLE';
  return items.reduce((worst,x)=>STATUS_RANK[x.status]<STATUS_RANK[worst]?x.status:worst,items[0].status);
}
function minConfidence(items){return items.length?Math.min(...items.map(x=>x.confidence)):0;}
function latestAsOf(items,fallback=0){return items.length?Math.max(...items.map(x=>x.receivedAt)):fallback;}
function combinedSource(items,fallback='UNAVAILABLE'){
  const values=[...new Set(items.map(x=>x.source).filter(text))].sort();
  return values.length?values.join(' + '):fallback;
}
function unavailable({family,kind,instrumentId,asOf=0,source='UNAVAILABLE',metrics={}}){
  return Object.freeze({
    family,kind,instrumentId,direction:0,confidence:0,status:'UNAVAILABLE',asOf,source,
    metrics:Object.freeze(metrics),
    invalidation:'Evidence unavailable until required canonical inputs are valid.',
    nextConfirmation:'Wait for valid source data and re-evaluate.',
  });
}

function buildInstitutionalFlowEvidence({instrumentId,flowObservations,volumeObservation,fullScaleRatio}={}){
  if(!finite(fullScaleRatio)||fullScaleRatio<=0)throw Error('FULL_SCALE_RATIO_REQUIRED');
  const flows=Array.isArray(flowObservations)?flowObservations:[];
  const volumeOk=usableObservation(volumeObservation)&&volumeObservation.value>0;
  const total=flows.find(x=>x.field==='flow.total_net'&&usableObservation(x));
  const components=flows.filter(x=>['flow.foreign_net','flow.investment_trust_net','flow.dealer_net'].includes(x?.field)&&usableObservation(x));
  const usedFlows=total?[total]:components;
  const used=volumeOk?[...usedFlows,volumeObservation]:usedFlows;
  const asOf=latestAsOf(used,finite(volumeObservation?.receivedAt)?volumeObservation.receivedAt:0);
  const source=combinedSource(used);
  if(!volumeOk||!usedFlows.length){
    return unavailable({family:'INSTITUTIONAL',kind:'INSTITUTIONAL_NET_VOLUME_RATIO',instrumentId,asOf,source,metrics:{netShares:null,volumeShares:volumeOk?volumeObservation.value:null,netToVolumeRatio:null,fullScaleRatio}});
  }
  const netShares=total?total.value:components.reduce((sum,x)=>sum+x.value,0);
  const volumeShares=volumeObservation.value;
  const ratio=netShares/volumeShares;
  return Object.freeze({
    family:'INSTITUTIONAL',kind:'INSTITUTIONAL_NET_VOLUME_RATIO',instrumentId,
    direction:round(clamp(ratio/fullScaleRatio)),
    confidence:round(minConfidence(used)),
    status:worstStatus(used),
    asOf,
    source,
    metrics:Object.freeze({netShares,volumeShares,netToVolumeRatio:round(ratio),fullScaleRatio,flowMethod:total?'TOTAL_NET':'COMPONENT_SUM'}),
    invalidation:'Institutional net flow reverses materially or volume denominator becomes unavailable.',
    nextConfirmation:'Confirm persistence across subsequent sessions and price/relative-strength response.',
  });
}

function observationMap(summary){return new Map((Array.isArray(summary?.observations)?summary.observations:[]).map(x=>[x.field,x]));}

function buildGuidanceRevisionEvidence({current,previous,fullScalePct}={}){
  if(!finite(fullScalePct)||fullScalePct<=0)throw Error('FULL_SCALE_PCT_REQUIRED');
  const instrumentId=current?.instrument?.instrumentId||previous?.instrument?.instrumentId||null;
  const timingSafe=current?.pointInTimeSafe===true&&previous?.pointInTimeSafe===true&&finite(current?.disclosedAt)&&finite(previous?.disclosedAt)&&current.disclosedAt>previous.disclosedAt;
  const allObs=[...(previous?.observations||[]),...(current?.observations||[])].filter(x=>x&&typeof x==='object');
  const asOf=finite(current?.disclosedAt)?current.disclosedAt:latestAsOf(allObs,0);
  const source=combinedSource(allObs);
  if(!timingSafe){
    return unavailable({family:'EXPECTATION',kind:'MANAGEMENT_GUIDANCE_REVISION',instrumentId,asOf,source,metrics:{usableFields:0,crossZeroFields:[],averageRevisionPct:null,fullScalePct}});
  }
  const prev=observationMap(previous),cur=observationMap(current);
  const revisions=[];const crossZeroFields=[];const used=[];
  for(const field of GUIDANCE_FIELDS){
    const p=prev.get(field),c=cur.get(field);
    if(!usableObservation(p)||!usableObservation(c))continue;
    if(p.value<=0||c.value<=0){crossZeroFields.push(field);continue;}
    const pct=(c.value-p.value)/Math.abs(p.value)*100;
    if(!finite(pct))continue;
    revisions.push({field,pct});used.push(p,c);
  }
  if(!revisions.length){
    return unavailable({family:'EXPECTATION',kind:'MANAGEMENT_GUIDANCE_REVISION',instrumentId,asOf:current.disclosedAt,source,metrics:{usableFields:0,crossZeroFields,averageRevisionPct:null,fullScalePct}});
  }
  const averageRevisionPct=revisions.reduce((sum,x)=>sum+x.pct,0)/revisions.length;
  const coverage=revisions.length/GUIDANCE_FIELDS.length;
  return Object.freeze({
    family:'EXPECTATION',kind:'MANAGEMENT_GUIDANCE_REVISION',instrumentId,
    direction:round(clamp(averageRevisionPct/fullScalePct)),
    confidence:round(minConfidence(used)*coverage),
    status:worstStatus(used),
    asOf:current.disclosedAt,
    source:combinedSource(used,source),
    metrics:Object.freeze({usableFields:revisions.length,crossZeroFields:Object.freeze(crossZeroFields),averageRevisionPct:round(averageRevisionPct),fullScalePct,revisions:Object.freeze(revisions.map(x=>Object.freeze({field:x.field,pct:round(x.pct)})))}),
    invalidation:'Management guidance is subsequently revised in the opposite direction or withdrawn.',
    nextConfirmation:'Confirm with subsequent disclosure, operating data, or price/earnings reaction.',
  });
}

function buildInstitutionalPersistenceEvidence({instrumentId,sessions,minSessions,fullScaleAverageRatio}={}){
  if(!Number.isInteger(minSessions)||minSessions<2)throw Error('MIN_SESSIONS_REQUIRED');
  if(!finite(fullScaleAverageRatio)||fullScaleAverageRatio<=0)throw Error('FULL_SCALE_AVERAGE_RATIO_REQUIRED');
  const input=Array.isArray(sessions)?sessions:[];
  const usable=[];
  for(const session of input){
    const one=buildInstitutionalFlowEvidence({instrumentId,flowObservations:session?.flowObservations,volumeObservation:session?.volumeObservation,fullScaleRatio:fullScaleAverageRatio});
    if(one.status==='UNAVAILABLE'||!finite(one.metrics?.netToVolumeRatio))continue;
    usable.push(one);
  }
  const allSources=usable.map(x=>({source:x.source,receivedAt:x.asOf,status:x.status,confidence:x.confidence}));
  const asOf=usable.length?Math.max(...usable.map(x=>x.asOf)):0;
  if(usable.length<minSessions){
    return unavailable({family:'INSTITUTIONAL',kind:'INSTITUTIONAL_PERSISTENCE',instrumentId,asOf,source:combinedSource(allSources),metrics:{usableSessions:usable.length,requiredSessions:minSessions,positiveSessions:usable.filter(x=>x.metrics.netToVolumeRatio>0).length,negativeSessions:usable.filter(x=>x.metrics.netToVolumeRatio<0).length,averageNetToVolumeRatio:null,fullScaleAverageRatio}});
  }
  const ratios=usable.map(x=>x.metrics.netToVolumeRatio);
  const average=ratios.reduce((a,x)=>a+x,0)/ratios.length;
  const positiveSessions=ratios.filter(x=>x>0).length,negativeSessions=ratios.filter(x=>x<0).length,neutralSessions=ratios.length-positiveSessions-negativeSessions;
  const directionalConsistency=Math.max(positiveSessions,negativeSessions,neutralSessions)/ratios.length;
  return Object.freeze({
    family:'INSTITUTIONAL',kind:'INSTITUTIONAL_PERSISTENCE',instrumentId,
    direction:round(clamp(average/fullScaleAverageRatio)),
    confidence:round(Math.min(...usable.map(x=>x.confidence))*directionalConsistency),
    status:worstStatus(usable),asOf,
    source:[...new Set(usable.map(x=>x.source))].sort().join(' + '),
    metrics:Object.freeze({usableSessions:usable.length,requiredSessions:minSessions,positiveSessions,negativeSessions,neutralSessions,directionalConsistency:round(directionalConsistency),averageNetToVolumeRatio:round(average),fullScaleAverageRatio}),
    invalidation:'Persistence weakens when valid sessions fall below the configured minimum or the dominant flow direction reverses.',
    nextConfirmation:'Confirm continued institutional participation with price structure, relative strength, or breadth improvement.',
  });
}

function buildRevenueAccelerationEvidence({current,previous,fullScalePct}={}){
  if(!finite(fullScalePct)||fullScalePct<=0)throw Error('FULL_SCALE_PCT_REQUIRED');
  const instrumentId=current?.instrument?.instrumentId||previous?.instrument?.instrumentId||null;
  const curMap=observationMap(current),prevMap=observationMap(previous);
  const cur=curMap.get('fundamental.revenue.yoy_pct'),prev=prevMap.get('fundamental.revenue.yoy_pct');
  const observations=[cur,prev].filter(Boolean);
  const currentPeriod=String(current?.reportPeriod??''),previousPeriod=String(previous?.reportPeriod??'');
  const validSequence=current?.knowledgeTime==='RECEIVED_AT'&&previous?.knowledgeTime==='RECEIVED_AT'&&instrumentId&&instrumentId===previous?.instrument?.instrumentId&&/^\d{4}-\d{2}$/.test(currentPeriod)&&/^\d{4}-\d{2}$/.test(previousPeriod)&&currentPeriod>previousPeriod&&usableObservation(cur)&&usableObservation(prev)&&cur.receivedAt>prev.receivedAt;
  const asOf=usableObservation(cur)?cur.receivedAt:latestAsOf(observations,0);
  const source=combinedSource(observations);
  if(!validSequence){
    return unavailable({family:'EXPECTATION',kind:'MONTHLY_REVENUE_YOY_ACCELERATION',instrumentId,asOf,source,metrics:{currentReportPeriod:currentPeriod||null,previousReportPeriod:previousPeriod||null,currentYoYPct:usableObservation(cur)?cur.value:null,previousYoYPct:usableObservation(prev)?prev.value:null,accelerationPctPoints:null,fullScalePct}});
  }
  const acceleration=cur.value-prev.value;
  return Object.freeze({
    family:'EXPECTATION',kind:'MONTHLY_REVENUE_YOY_ACCELERATION',instrumentId,
    direction:round(clamp(acceleration/fullScalePct)),
    confidence:round(minConfidence([cur,prev])),
    status:worstStatus([cur,prev]),asOf:cur.receivedAt,source,
    metrics:Object.freeze({currentReportPeriod:currentPeriod,previousReportPeriod:previousPeriod,currentYoYPct:cur.value,previousYoYPct:prev.value,accelerationPctPoints:round(acceleration),fullScalePct}),
    invalidation:'Revenue YoY acceleration reverses on a subsequent released month or the underlying revenue series is restated.',
    nextConfirmation:'Confirm acceleration with additional monthly releases, margin/earnings evidence, or sector demand data.',
  });
}

module.exports=Object.freeze({buildInstitutionalFlowEvidence,buildGuidanceRevisionEvidence,buildInstitutionalPersistenceEvidence,buildRevenueAccelerationEvidence});
