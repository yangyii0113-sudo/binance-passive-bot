'use strict';

const STATUS_RANK=Object.freeze({UNAVAILABLE:0,STALE:1,SNAPSHOT:2,DELAYED:3,LIVE:4});
const GUIDANCE_FIELDS=Object.freeze(['guidance.sales_fy','guidance.operating_profit_fy','guidance.net_profit_fy','guidance.eps_fy']);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const clamp=x=>Math.max(-1,Math.min(1,x));
const round=x=>Number(x.toFixed(6));
const text=x=>typeof x==='string'&&x.length>0;

function usableObservation(x){return x&&typeof x==='object'&&finite(x.value)&&Object.hasOwn(STATUS_RANK,x.status)&&STATUS_RANK[x.status]>0&&finite(x.confidence)&&x.confidence>=0&&x.confidence<=1&&finite(x.receivedAt)&&x.receivedAt>=0&&text(x.source);}
function worstStatus(items){if(!items.length)return'UNAVAILABLE';return items.reduce((worst,x)=>STATUS_RANK[x.status]<STATUS_RANK[worst]?x.status:worst,items[0].status);}
function minConfidence(items){return items.length?Math.min(...items.map(x=>x.confidence)):0;}
function latestAsOf(items,fallback=0){return items.length?Math.max(...items.map(x=>x.receivedAt)):fallback;}
function combinedSource(items,fallback='UNAVAILABLE'){const values=[...new Set(items.map(x=>x.source).filter(text))].sort();return values.length?values.join(' + '):fallback;}
function unavailable({family,kind,instrumentId,asOf=0,source='UNAVAILABLE',metrics={}}){return Object.freeze({family,kind,instrumentId,direction:0,confidence:0,status:'UNAVAILABLE',asOf,source,metrics:Object.freeze(metrics),invalidation:'Evidence unavailable until required canonical inputs are valid.',nextConfirmation:'Wait for valid source data and re-evaluate.'});}

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
  if(!volumeOk||!usedFlows.length)return unavailable({family:'INSTITUTIONAL',kind:'INSTITUTIONAL_NET_VOLUME_RATIO',instrumentId,asOf,source,metrics:{netShares:null,volumeShares:volumeOk?volumeObservation.value:null,netToVolumeRatio:null,fullScaleRatio}});
  const netShares=total?total.value:components.reduce((sum,x)=>sum+x.value,0);
  const volumeShares=volumeObservation.value;
  const ratio=netShares/volumeShares;
  return Object.freeze({family:'INSTITUTIONAL',kind:'INSTITUTIONAL_NET_VOLUME_RATIO',instrumentId,direction:round(clamp(ratio/fullScaleRatio)),confidence:round(minConfidence(used)),status:worstStatus(used),asOf,source,metrics:Object.freeze({netShares,volumeShares,netToVolumeRatio:round(ratio),fullScaleRatio,flowMethod:total?'TOTAL_NET':'COMPONENT_SUM'}),invalidation:'Institutional net flow reverses materially or volume denominator becomes unavailable.',nextConfirmation:'Confirm persistence across subsequent sessions and price/relative-strength response.'});
}

function observationMap(summary){return new Map((Array.isArray(summary?.observations)?summary.observations:[]).map(x=>[x.field,x]));}
function buildGuidanceRevisionEvidence({current,previous,fullScalePct}={}){
  if(!finite(fullScalePct)||fullScalePct<=0)throw Error('FULL_SCALE_PCT_REQUIRED');
  const instrumentId=current?.instrument?.instrumentId||previous?.instrument?.instrumentId||null;
  const timingSafe=current?.pointInTimeSafe===true&&previous?.pointInTimeSafe===true&&finite(current?.disclosedAt)&&finite(previous?.disclosedAt)&&current.disclosedAt>previous.disclosedAt;
  const allObs=[...(previous?.observations||[]),...(current?.observations||[])].filter(x=>x&&typeof x==='object');
  const asOf=finite(current?.disclosedAt)?current.disclosedAt:latestAsOf(allObs,0);
  const source=combinedSource(allObs);
  if(!timingSafe)return unavailable({family:'EXPECTATION',kind:'MANAGEMENT_GUIDANCE_REVISION',instrumentId,asOf,source,metrics:{usableFields:0,crossZeroFields:[],averageRevisionPct:null,fullScalePct}});
  const prev=observationMap(previous),cur=observationMap(current);
  const revisions=[];const crossZeroFields=[];const used=[];
  for(const field of GUIDANCE_FIELDS){
    const p=prev.get(field),c=cur.get(field);
    if(!usableObservation(p)||!usableObservation(c))continue;
    if(p.value<=0||c.value<=0){crossZeroFields.push(field);continue;}
    const pct=(c.value-p.value)/Math.abs(p.value)*100;if(!finite(pct))continue;
    revisions.push({field,pct});used.push(p,c);
  }
  if(!revisions.length)return unavailable({family:'EXPECTATION',kind:'MANAGEMENT_GUIDANCE_REVISION',instrumentId,asOf:current.disclosedAt,source,metrics:{usableFields:0,crossZeroFields,averageRevisionPct:null,fullScalePct}});
  const averageRevisionPct=revisions.reduce((sum,x)=>sum+x.pct,0)/revisions.length;
  const coverage=revisions.length/GUIDANCE_FIELDS.length;
  return Object.freeze({family:'EXPECTATION',kind:'MANAGEMENT_GUIDANCE_REVISION',instrumentId,direction:round(clamp(averageRevisionPct/fullScalePct)),confidence:round(minConfidence(used)*coverage),status:worstStatus(used),asOf:current.disclosedAt,source:combinedSource(used,source),metrics:Object.freeze({usableFields:revisions.length,crossZeroFields:Object.freeze(crossZeroFields),averageRevisionPct:round(averageRevisionPct),fullScalePct,revisions:Object.freeze(revisions.map(x=>Object.freeze({field:x.field,pct:round(x.pct)})))}),invalidation:'Management guidance is subsequently revised in the opposite direction or withdrawn.',nextConfirmation:'Confirm with subsequent disclosure, operating data, or price/earnings reaction.'});
}

module.exports=Object.freeze({buildInstitutionalFlowEvidence,buildGuidanceRevisionEvidence});
