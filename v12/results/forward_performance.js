(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_FORWARD_PERFORMANCE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const HORIZONS=Object.freeze([{key:'1D',sessions:1},{key:'5D',sessions:5},{key:'20D',sessions:20}]);
  const MARKETS=Object.freeze(['US','TW']);
  const DIRECTIONS=Object.freeze(['POSITIVE','NEGATIVE']);

  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const text=value=>typeof value==='string'&&value.trim().length>0;
  const isoDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
  const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  const round=value=>finite(value)?Number(value.toFixed(12)):value;

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    for(const key of Object.keys(value))deepFreeze(value[key]);
    return Object.freeze(value);
  }

  function assertBaseline(value,createdAt){
    if(!object(value)||!isoDate(value.sessionDate)||!finite(value.close)||value.close<=0||!finite(value.asOf)||value.asOf<0||!text(value.source))throw Error('BASELINE_INVALID');
    if(value.asOf>createdAt)throw Error('LOOKAHEAD_FORBIDDEN');
    return deepFreeze({sessionDate:value.sessionDate,close:value.close,asOf:value.asOf,source:value.source});
  }

  function assertRegime(value,createdAt){
    if(!object(value)||!text(value.state)||!text(value.label)||!finite(value.asOf)||value.asOf<0||!text(value.source))throw Error('REGIME_INVALID');
    if(value.asOf>createdAt)throw Error('LOOKAHEAD_FORBIDDEN');
    return deepFreeze({state:value.state,label:value.label,asOf:value.asOf,source:value.source});
  }

  function createForwardTrack(input={}){
    if(!object(input)||!text(input.id)||!MARKETS.includes(input.market)||!text(input.instrumentId)||!DIRECTIONS.includes(input.direction)||!finite(input.createdAt)||input.createdAt<0)throw Error('FORWARD_TRACK_INVALID');
    if(input.researchOnly!==true||input.executionWrite!==false)throw Error('RESEARCH_READ_ONLY_REQUIRED');
    if(input.researchScore!==undefined&&(!finite(input.researchScore)||input.researchScore<0||input.researchScore>100))throw Error('RESEARCH_SCORE_INVALID');
    const baseline=assertBaseline(input.baseline,input.createdAt);
    const regime=assertRegime(input.regime,input.createdAt);
    return deepFreeze({
      schemaVersion:'foxyya-forward-research-track/1',
      id:input.id,
      market:input.market,
      instrumentId:input.instrumentId,
      direction:input.direction,
      researchScore:finite(input.researchScore)?input.researchScore:null,
      priority:text(input.priority)?input.priority:'',
      createdAt:input.createdAt,
      baseline,
      regime,
      validationMode:'FORWARD_ONLY',
      status:'TRACKING',
      sessions:[],
      outcomes:{},
      researchOnly:true,
      executionWrite:false
    });
  }

  function assertTrack(track){
    if(!object(track)||track.schemaVersion!=='foxyya-forward-research-track/1'||track.validationMode!=='FORWARD_ONLY'||track.researchOnly!==true||track.executionWrite!==false||!Array.isArray(track.sessions)||!object(track.outcomes))throw Error('FORWARD_TRACK_REQUIRED');
    return track;
  }

  function assertSession(value,track){
    if(!object(value)||value.fullyClosed!==true)throw Error('FULLY_CLOSED_SESSION_REQUIRED');
    if(!isoDate(value.sessionDate)||!finite(value.close)||value.close<=0||!finite(value.high)||value.high<=0||!finite(value.low)||value.low<=0||value.high<value.low||value.high<value.close||value.low>value.close||!finite(value.asOf)||value.asOf<0||!text(value.source))throw Error('SESSION_INVALID');
    if(value.asOf<=track.baseline.asOf||value.asOf<=track.createdAt)throw Error('FORWARD_ONLY_REQUIRED');
    if(value.sessionDate<=track.baseline.sessionDate)throw Error('BACKFILL_FORBIDDEN');
    const duplicate=track.sessions.some(row=>row.sessionDate===value.sessionDate);
    if(duplicate)throw Error('DUPLICATE_SESSION');
    const last=track.sessions[track.sessions.length-1];
    if(last&&(value.sessionDate<=last.sessionDate||value.asOf<=last.asOf))throw Error('BACKFILL_FORBIDDEN');
    return deepFreeze({sessionDate:value.sessionDate,close:value.close,high:value.high,low:value.low,asOf:value.asOf,source:value.source,fullyClosed:true});
  }

  function rawReturn(baselineClose,price){return (price-baselineClose)/baselineClose;}

  function outcomeFor(track,sessions,horizon){
    const rows=sessions.slice(0,horizon.sessions);
    const final=rows[rows.length-1];
    const raw=rawReturn(track.baseline.close,final.close);
    const sign=track.direction==='NEGATIVE'?-1:1;
    const directional=raw*sign;
    let mfe=-Infinity;
    let mae=Infinity;
    for(const row of rows){
      if(sign>0){
        mfe=Math.max(mfe,rawReturn(track.baseline.close,row.high));
        mae=Math.min(mae,rawReturn(track.baseline.close,row.low));
      }else{
        mfe=Math.max(mfe,(track.baseline.close-row.low)/track.baseline.close);
        mae=Math.min(mae,(track.baseline.close-row.high)/track.baseline.close);
      }
    }
    return deepFreeze({
      horizon:horizon.key,
      completedSessions:horizon.sessions,
      asOf:final.asOf,
      sessionDate:final.sessionDate,
      price:final.close,
      returnPct:round(raw),
      directionalReturnPct:round(directional),
      hit:directional>0,
      mfePct:round(mfe),
      maePct:round(mae),
      source:final.source,
      researchOnly:true,
      executionWrite:false
    });
  }

  function rebuildOutcomes(track,sessions){
    const outcomes={};
    for(const horizon of HORIZONS){
      if(sessions.length>=horizon.sessions)outcomes[horizon.key]=outcomeFor(track,sessions,horizon);
    }
    return deepFreeze(outcomes);
  }

  function recordClosedSession(trackValue,sessionValue){
    const track=assertTrack(trackValue);
    if(track.status==='COMPLETE')throw Error('TRACK_COMPLETE');
    const session=assertSession(sessionValue,track);
    const sessions=deepFreeze([...track.sessions,session]);
    const outcomes=rebuildOutcomes(track,sessions);
    return deepFreeze({...track,sessions,outcomes,status:sessions.length>=20?'COMPLETE':'TRACKING'});
  }

  function sampleStatus(count){
    if(count<30)return 'SAMPLE_INSUFFICIENT';
    if(count<100)return 'INITIAL_SAMPLE';
    return 'SAMPLE_ESTABLISHED';
  }

  function summarizeRows(rows,horizonKey){
    const outcomes=rows.map(row=>row.outcomes[horizonKey]).filter(object);
    return deepFreeze({
      sampleCount:outcomes.length,
      hitRate:outcomes.length?round(outcomes.filter(row=>row.hit===true).length/outcomes.length):null,
      meanDirectionalReturnPct:round(mean(outcomes.map(row=>row.directionalReturnPct))),
      meanMfePct:round(mean(outcomes.map(row=>row.mfePct))),
      meanMaePct:round(mean(outcomes.map(row=>row.maePct))),
      sampleStatus:sampleStatus(outcomes.length)
    });
  }

  function horizonSummary(rows){
    const out={};
    for(const horizon of HORIZONS)out[horizon.key]=summarizeRows(rows,horizon.key);
    return deepFreeze(out);
  }

  function summarizeForwardPerformance(tracks,{market,asOf}={}){
    if(!MARKETS.includes(market)||!finite(asOf)||asOf<0)throw Error('SUMMARY_INPUT_INVALID');
    const rows=(Array.isArray(tracks)?tracks:[]).map(assertTrack).filter(row=>row.market===market&&row.createdAt<=asOf);
    const regimes={};
    for(const row of rows){
      const key=row.regime.state;
      if(!regimes[key])regimes[key]=[];
      regimes[key].push(row);
    }
    const regimeSummary={};
    for(const [state,group] of Object.entries(regimes))regimeSummary[state]=deepFreeze({state,label:group[0].regime.label,sampleCount:group.length,horizons:horizonSummary(group)});
    return deepFreeze({
      schemaVersion:'foxyya-forward-research-results/1',
      type:'RESEARCH_RESULTS',
      validationMode:'FORWARD_ONLY',
      market,
      asOf,
      source:'FOXYYA_FORWARD_RESEARCH_LEDGER',
      sampleCount:rows.length,
      horizons:horizonSummary(rows),
      regimes:regimeSummary,
      researchOnly:true,
      executionWrite:false
    });
  }

  return Object.freeze({HORIZONS,createForwardTrack,recordClosedSession,summarizeForwardPerformance});
});