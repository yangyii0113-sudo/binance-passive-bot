(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./market_core.js'):root.FOXY_V12_MARKET_CORE);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_MARKET_CLOCK=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';

  const BASE_SESSIONS=Object.freeze({
    BINANCE:Object.freeze({timezone:'UTC',alwaysOpen:true,sessions:Object.freeze({})}),
    NASDAQ:Object.freeze({timezone:'America/New_York',sessions:Object.freeze({
      PRE_MARKET:Object.freeze([[240,570]]),
      REGULAR:Object.freeze([[570,960]]),
      AFTER_HOURS:Object.freeze([[960,1200]])
    })}),
    NYSE:Object.freeze({timezone:'America/New_York',sessions:Object.freeze({
      PRE_MARKET:Object.freeze([[240,570]]),
      REGULAR:Object.freeze([[570,960]]),
      AFTER_HOURS:Object.freeze([[960,1200]])
    })}),
    TWSE:Object.freeze({timezone:'Asia/Taipei',sessions:Object.freeze({REGULAR:Object.freeze([[540,810]])})}),
    TPEX:Object.freeze({timezone:'Asia/Taipei',sessions:Object.freeze({REGULAR:Object.freeze([[540,810]])})}),
    KRX:Object.freeze({timezone:'Asia/Seoul',sessions:Object.freeze({REGULAR:Object.freeze([[540,930]])})}),
    TSE:Object.freeze({timezone:'Asia/Tokyo',sessions:Object.freeze({REGULAR:Object.freeze([[540,690],[750,930]])})}),
    HKEX:Object.freeze({timezone:'Asia/Hong_Kong',sessions:Object.freeze({REGULAR:Object.freeze([[570,720],[780,960]])})}),
    XETRA:Object.freeze({timezone:'Europe/Berlin',sessions:Object.freeze({REGULAR:Object.freeze([[540,1050]])})})
  });

  const SESSION_NAMES=Object.freeze(['PRE_MARKET','REGULAR','AFTER_HOURS']);

  function unavailable(exchange,reason,extra={}){
    return Object.freeze({
      exchange,
      state:'UNAVAILABLE',
      session:'UNAVAILABLE',
      reason,
      sessionStartAt:null,
      sessionEndAt:null,
      nextOpenAt:null,
      nextCloseAt:null,
      calendarConfidence:'UNAVAILABLE',
      ...extra
    });
  }

  function localParts(epochMs,timeZone){
    if(!Number.isFinite(epochMs)||epochMs<0)throw Error('TIME_INVALID');
    const parts=new Intl.DateTimeFormat('en-CA',{
      timeZone,
      weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }).formatToParts(new Date(epochMs));
    const values=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return Object.freeze({
      year:Number(values.year),month:Number(values.month),day:Number(values.day),
      hour:Number(values.hour),minute:Number(values.minute),second:Number(values.second),
      weekday:values.weekday,
      localDate:`${values.year}-${values.month}-${values.day}`,
      localTime:`${values.hour}:${values.minute}:${values.second}`
    });
  }

  function addLocalDays(localDate,days){
    const m=String(localDate||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)throw Error('LOCAL_DATE_INVALID');
    const date=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])+days,12,0,0));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
  }

  function weekdayForDate(localDate){
    const m=String(localDate||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)throw Error('LOCAL_DATE_INVALID');
    const date=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0));
    if(date.getUTCFullYear()!==Number(m[1])||date.getUTCMonth()+1!==Number(m[2])||date.getUTCDate()!==Number(m[3]))throw Error('LOCAL_DATE_INVALID');
    return date.getUTCDay();
  }

  function zonedEpoch(localDate,minuteOfDay,timeZone){
    const m=String(localDate||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m||!Number.isInteger(minuteOfDay)||minuteOfDay<0||minuteOfDay>1440)throw Error('LOCAL_BOUNDARY_INVALID');
    let year=Number(m[1]),month=Number(m[2]),day=Number(m[3]),minute=minuteOfDay;
    if(minute===1440){
      const next=addLocalDays(localDate,1).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      year=Number(next[1]);month=Number(next[2]);day=Number(next[3]);minute=0;
    }
    const hour=Math.floor(minute/60),min=minute%60;
    const desired=Date.UTC(year,month-1,day,hour,min,0);
    let guess=desired;
    for(let i=0;i<8;i++){
      const p=localParts(guess,timeZone);
      const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
      const delta=desired-represented;
      if(delta===0)break;
      guess+=delta;
    }
    const verify=localParts(guess,timeZone);
    if(verify.year!==year||verify.month!==month||verify.day!==day||verify.hour!==hour||verify.minute!==min)throw Error('TIMEZONE_BOUNDARY_INVALID');
    return guess;
  }

  function overridesArray(value){
    if(value===null||value===undefined)return [];
    return Array.isArray(value)?value:[value];
  }

  function matchingOverride(value,localDate){
    const matches=overridesArray(value).filter(row=>row&&typeof row==='object'&&!Array.isArray(row)&&row.localDate===localDate);
    if(matches.length>1)return {error:'CALENDAR_OVERRIDE_CONFLICT',value:null};
    return {error:null,value:matches[0]||null};
  }

  function validateWindows(sessions){
    if(!sessions||typeof sessions!=='object'||Array.isArray(sessions))return false;
    const keys=Object.keys(sessions);
    if(!keys.length||keys.some(key=>!SESSION_NAMES.includes(key)))return false;
    const flattened=[];
    for(const key of keys){
      const windows=sessions[key];
      if(!Array.isArray(windows)||!windows.length)return false;
      for(const window of windows){
        if(!Array.isArray(window)||window.length!==2)return false;
        const [start,end]=window;
        if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>1440||start>=end)return false;
        flattened.push([start,end]);
      }
    }
    flattened.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    for(let i=1;i<flattened.length;i++)if(flattened[i][0]<flattened[i-1][1])return false;
    return true;
  }

  function validateApplicableOverride(override,queryEpoch){
    if(!override||typeof override!=='object'||Array.isArray(override))return {ok:false,reason:'CALENDAR_OVERRIDE_INVALID'};
    try{weekdayForDate(override.localDate);}catch(_){return {ok:false,reason:'CALENDAR_OVERRIDE_INVALID'};}
    if(typeof override.source!=='string'||!override.source.trim())return {ok:false,reason:'CALENDAR_OVERRIDE_INVALID'};
    if(typeof override.reason!=='string'||!override.reason.trim())return {ok:false,reason:'CALENDAR_OVERRIDE_INVALID'};
    if(!Number.isFinite(override.asOf)||override.asOf<0)return {ok:false,reason:'CALENDAR_OVERRIDE_INVALID'};
    if(override.asOf>queryEpoch)return {ok:false,reason:'CALENDAR_OVERRIDE_FUTURE'};
    if(override.closed!==undefined&&typeof override.closed!=='boolean')return {ok:false,reason:'CALENDAR_OVERRIDE_INVALID'};
    if(override.sessions!==undefined&&!validateWindows(override.sessions))return {ok:false,reason:'CALENDAR_OVERRIDE_INVALID'};
    if(override.closed!==true&&override.sessions===undefined)return {ok:false,reason:'CALENDAR_OVERRIDE_INVALID'};
    return {ok:true};
  }

  function daySchedule(exchange,localDate,queryEpoch,calendarOverrides){
    const matched=matchingOverride(calendarOverrides,localDate);
    if(matched.error)return {status:'UNAVAILABLE',reason:matched.error,sessions:{},calendarConfidence:'UNAVAILABLE'};
    const override=matched.value;
    if(override){
      const check=validateApplicableOverride(override,queryEpoch);
      if(!check.ok)return {status:'UNAVAILABLE',reason:check.reason,sessions:{},calendarConfidence:'UNAVAILABLE'};
      const meta={calendarConfidence:'EXPLICIT_OVERRIDE',calendarSource:override.source,calendarAsOf:override.asOf,calendarLocalDate:override.localDate};
      if(override.closed===true)return {status:'CLOSED',reason:override.reason,sessions:{},...meta};
      return {status:'SCHEDULED',reason:override.reason,sessions:override.sessions,...meta};
    }
    const weekday=weekdayForDate(localDate);
    if(weekday===0||weekday===6)return {status:'CLOSED',reason:'WEEKEND',sessions:{},calendarConfidence:'BASE_SESSION_ONLY'};
    return {status:'SCHEDULED',reason:null,sessions:BASE_SESSIONS[exchange].sessions,calendarConfidence:'BASE_SESSION_ONLY'};
  }

  function intervalsForDay(exchange,localDate,queryEpoch,calendarOverrides){
    const base=BASE_SESSIONS[exchange];
    const day=daySchedule(exchange,localDate,queryEpoch,calendarOverrides);
    if(day.status!=='SCHEDULED')return {day,intervals:[]};
    const intervals=[];
    for(const session of SESSION_NAMES){
      for(const [startMinute,endMinute] of day.sessions[session]||[]){
        intervals.push(Object.freeze({
          session,
          startMinute,endMinute,
          start:zonedEpoch(localDate,startMinute,base.timezone),
          end:zonedEpoch(localDate,endMinute,base.timezone)
        }));
      }
    }
    intervals.sort((a,b)=>a.start-b.start||a.end-b.end);
    return {day,intervals};
  }

  function contiguousClose(intervals,index){
    let end=intervals[index].end;
    for(let i=index+1;i<intervals.length;i++){
      if(intervals[i].start!==end)break;
      end=intervals[i].end;
    }
    return end;
  }

  function nextBoundaries(exchange,epochMs,currentDate,currentIntervals,openIndex,calendarOverrides){
    if(openIndex>=0)return {nextOpenAt:null,nextCloseAt:contiguousClose(currentIntervals,openIndex)};
    for(let offset=0;offset<=10;offset++){
      const date=addLocalDays(currentDate,offset);
      const {day,intervals}=intervalsForDay(exchange,date,epochMs,calendarOverrides);
      if(day.status==='UNAVAILABLE')continue;
      for(let i=0;i<intervals.length;i++){
        if(intervals[i].start>epochMs)return {nextOpenAt:intervals[i].start,nextCloseAt:contiguousClose(intervals,i)};
      }
    }
    return {nextOpenAt:null,nextCloseAt:null};
  }

  function calendarFields(day){
    const fields={calendarConfidence:day.calendarConfidence};
    if(day.calendarConfidence==='EXPLICIT_OVERRIDE'){
      fields.calendarSource=day.calendarSource;
      fields.calendarAsOf=day.calendarAsOf;
      fields.calendarLocalDate=day.calendarLocalDate;
    }
    return fields;
  }

  function sessionState(exchange,epochMs,calendarOverrides=null){
    const meta=M?.EXCHANGES?.[exchange],base=BASE_SESSIONS[exchange];
    if(!meta||!base)return unavailable(exchange,'UNKNOWN_EXCHANGE');
    if(!Number.isFinite(epochMs)||epochMs<0)return unavailable(exchange,'TIME_INVALID');

    if(base.alwaysOpen){
      const iso=new Date(epochMs).toISOString();
      return Object.freeze({
        exchange,state:'OPEN',session:'24_7',reason:null,timezone:base.timezone,
        localDate:iso.slice(0,10),localTime:iso.slice(11,19),asOf:epochMs,
        sessionStartAt:null,sessionEndAt:null,nextOpenAt:null,nextCloseAt:null,
        calendarConfidence:'CONTINUOUS'
      });
    }

    const parts=localParts(epochMs,base.timezone);
    const current=intervalsForDay(exchange,parts.localDate,epochMs,calendarOverrides);
    if(current.day.status==='UNAVAILABLE')return unavailable(exchange,current.day.reason,{timezone:base.timezone,localDate:parts.localDate,localTime:parts.localTime,asOf:epochMs});

    const fields=calendarFields(current.day);
    if(current.day.status==='CLOSED'){
      const next=nextBoundaries(exchange,epochMs,parts.localDate,[], -1,calendarOverrides);
      return Object.freeze({
        exchange,state:'CLOSED',session:'CLOSED',reason:current.day.reason,timezone:base.timezone,
        localDate:parts.localDate,localTime:parts.localTime,asOf:epochMs,
        sessionStartAt:null,sessionEndAt:null,nextOpenAt:next.nextOpenAt,nextCloseAt:next.nextCloseAt,
        ...fields
      });
    }

    const openIndex=current.intervals.findIndex(interval=>epochMs>=interval.start&&epochMs<interval.end);
    if(openIndex>=0){
      const interval=current.intervals[openIndex];
      const next=nextBoundaries(exchange,epochMs,parts.localDate,current.intervals,openIndex,calendarOverrides);
      return Object.freeze({
        exchange,state:'OPEN',session:interval.session,reason:null,timezone:base.timezone,
        localDate:parts.localDate,localTime:parts.localTime,asOf:epochMs,
        sessionStartAt:interval.start,sessionEndAt:interval.end,nextOpenAt:next.nextOpenAt,nextCloseAt:next.nextCloseAt,
        ...fields
      });
    }

    const earlier=current.intervals.some(interval=>interval.end<=epochMs);
    const later=current.intervals.some(interval=>interval.start>epochMs);
    const reason=earlier&&later?'SESSION_BREAK':'OUTSIDE_SESSION';
    const next=nextBoundaries(exchange,epochMs,parts.localDate,current.intervals,-1,calendarOverrides);
    return Object.freeze({
      exchange,state:'CLOSED',session:'CLOSED',reason,timezone:base.timezone,
      localDate:parts.localDate,localTime:parts.localTime,asOf:epochMs,
      sessionStartAt:null,sessionEndAt:null,nextOpenAt:next.nextOpenAt,nextCloseAt:next.nextCloseAt,
      ...fields
    });
  }

  return Object.freeze({BASE_SESSIONS,SESSION_NAMES,sessionState,localParts});
});