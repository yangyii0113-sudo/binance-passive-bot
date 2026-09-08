(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./market_core.js'):root.FOXY_V12_MARKET_CORE);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_MARKET_CLOCK=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';

  const BASE_SESSIONS=Object.freeze({
    BINANCE:Object.freeze({alwaysOpen:true}),
    NASDAQ:Object.freeze({windows:[[570,960]]}),
    NYSE:Object.freeze({windows:[[570,960]]}),
    TWSE:Object.freeze({windows:[[540,810]]}),
    TPEX:Object.freeze({windows:[[540,810]]}),
    KRX:Object.freeze({windows:[[540,930]]}),
    TSE:Object.freeze({windows:[[540,690],[750,930]]}),
    HKEX:Object.freeze({windows:[[570,720],[780,960]]}),
    XETRA:Object.freeze({windows:[[540,1050]]})
  });

  function localParts(epochMs,timeZone){
    const parts=new Intl.DateTimeFormat('en-CA',{
      timeZone,
      weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }).formatToParts(new Date(epochMs));
    return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  }

  function sessionState(exchange,epochMs,calendarOverride=null){
    if(!Number.isFinite(epochMs)||epochMs<0)return {state:'UNAVAILABLE',reason:'TIME_INVALID',calendarConfidence:'UNAVAILABLE'};
    const meta=M?.EXCHANGES?.[exchange],session=BASE_SESSIONS[exchange];
    if(!meta||!session)return {state:'UNAVAILABLE',reason:'EXCHANGE_UNKNOWN',calendarConfidence:'UNAVAILABLE'};
    if(calendarOverride?.closed===true){
      return {state:'CLOSED',reason:calendarOverride.reason||'CALENDAR_OVERRIDE',calendarConfidence:'EXPLICIT_OVERRIDE',exchange,asOf:epochMs};
    }
    if(session.alwaysOpen){
      return {state:'OPEN',reason:'24_7',calendarConfidence:'BASE_SESSION_ONLY',exchange,asOf:epochMs};
    }
    const p=localParts(epochMs,meta.timezone);
    const weekend=p.weekday==='Sat'||p.weekday==='Sun';
    const minute=Number(p.hour)*60+Number(p.minute);
    const inWindow=!weekend&&session.windows.some(([start,end])=>minute>=start&&minute<end);
    return {
      state:inWindow?'OPEN':'CLOSED',
      reason:weekend?'WEEKEND':inWindow?'REGULAR_SESSION':'OUTSIDE_REGULAR_SESSION',
      calendarConfidence:'BASE_SESSION_ONLY',
      exchange,
      timezone:meta.timezone,
      localDate:`${p.year}-${p.month}-${p.day}`,
      localTime:`${p.hour}:${p.minute}:${p.second}`,
      asOf:epochMs
    };
  }

  return Object.freeze({BASE_SESSIONS,sessionState});
});