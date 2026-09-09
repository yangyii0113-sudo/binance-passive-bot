const test = require('node:test');
const assert = require('node:assert/strict');
const {sessionState} = require('../v12/core/market_clock.js');

function verifiedDay({localDate,closed=false,reason='OFFICIAL_CALENDAR',sessions}={}){
  return {
    localDate,
    closed,
    reason,
    sessions,
    source:'OFFICIAL_EXCHANGE_CALENDAR',
    asOf:Date.parse(`${localDate}T00:00:00Z`)
  };
}

test('crypto is 24/7 and has no equity-session boundary', () => {
  const value=sessionState('BINANCE', Date.UTC(2026,8,9,0,0));
  assert.equal(value.state, 'OPEN');
  assert.equal(value.session, '24_7');
  assert.equal(value.nextOpenAt, null);
  assert.equal(value.nextCloseAt, null);
});

test('TWSE and TPEx share the authoritative Taiwan regular session', () => {
  const open = Date.UTC(2026,8,9,1,30);
  for(const exchange of ['TWSE','TPEX']){
    const value=sessionState(exchange,open);
    assert.equal(value.state,'OPEN');
    assert.equal(value.session,'REGULAR');
    assert.equal(value.localTime,'09:30:00');
    assert.equal(value.sessionEndAt,Date.UTC(2026,8,9,5,30));
  }
});

test('NYSE and NASDAQ distinguish pre-market regular and after-hours in exchange local time',()=>{
  for(const exchange of ['NYSE','NASDAQ']){
    const pre=sessionState(exchange,Date.parse('2026-06-09T08:00:00Z'));
    assert.equal(pre.state,'OPEN');
    assert.equal(pre.session,'PRE_MARKET');
    assert.equal(pre.localTime,'04:00:00');
    assert.equal(pre.sessionEndAt,Date.parse('2026-06-09T13:30:00Z'));

    const regular=sessionState(exchange,Date.parse('2026-06-09T13:30:00Z'));
    assert.equal(regular.state,'OPEN');
    assert.equal(regular.session,'REGULAR');
    assert.equal(regular.sessionStartAt,Date.parse('2026-06-09T13:30:00Z'));
    assert.equal(regular.sessionEndAt,Date.parse('2026-06-09T20:00:00Z'));

    const after=sessionState(exchange,Date.parse('2026-06-09T20:00:00Z'));
    assert.equal(after.state,'OPEN');
    assert.equal(after.session,'AFTER_HOURS');
    assert.equal(after.sessionEndAt,Date.parse('2026-06-10T00:00:00Z'));
  }
});

test('US market clock follows DST without fixed UTC offsets',()=>{
  const winter=sessionState('NYSE',Date.parse('2026-01-09T14:30:00Z'));
  const summer=sessionState('NYSE',Date.parse('2026-06-09T13:30:00Z'));
  assert.equal(winter.session,'REGULAR');
  assert.equal(winter.localTime,'09:30:00');
  assert.equal(winter.sessionStartAt,Date.parse('2026-01-09T14:30:00Z'));
  assert.equal(summer.session,'REGULAR');
  assert.equal(summer.localTime,'09:30:00');
  assert.equal(summer.sessionStartAt,Date.parse('2026-06-09T13:30:00Z'));
});

test('TSE exposes lunch break and afternoon reopen rather than pretending continuous trading',()=>{
  const morning=sessionState('TSE',Date.parse('2026-09-09T00:00:00Z'));
  assert.equal(morning.session,'REGULAR');
  const lunch=sessionState('TSE',Date.parse('2026-09-09T02:45:00Z'));
  assert.equal(lunch.state,'CLOSED');
  assert.equal(lunch.session,'CLOSED');
  assert.equal(lunch.reason,'SESSION_BREAK');
  assert.equal(lunch.nextOpenAt,Date.parse('2026-09-09T03:30:00Z'));
  assert.equal(lunch.nextCloseAt,Date.parse('2026-09-09T06:30:00Z'));
  const afternoon=sessionState('TSE',Date.parse('2026-09-09T03:30:00Z'));
  assert.equal(afternoon.session,'REGULAR');
});

test('KRX regular session is evaluated in Seoul local time',()=>{
  const value=sessionState('KRX',Date.parse('2026-09-09T00:00:00Z'));
  assert.equal(value.state,'OPEN');
  assert.equal(value.session,'REGULAR');
  assert.equal(value.localTime,'09:00:00');
  assert.equal(value.sessionEndAt,Date.parse('2026-09-09T06:30:00Z'));
});

test('HKEX lunch break is explicit and afternoon session reopens',()=>{
  assert.equal(sessionState('HKEX',Date.parse('2026-09-09T01:30:00Z')).session,'REGULAR');
  const lunch=sessionState('HKEX',Date.parse('2026-09-09T04:30:00Z'));
  assert.equal(lunch.state,'CLOSED');
  assert.equal(lunch.reason,'SESSION_BREAK');
  assert.equal(lunch.nextOpenAt,Date.parse('2026-09-09T05:00:00Z'));
  assert.equal(sessionState('HKEX',Date.parse('2026-09-09T05:00:00Z')).session,'REGULAR');
});

test('XETRA representative regular session follows Europe Berlin timezone',()=>{
  const value=sessionState('XETRA',Date.parse('2026-09-09T07:00:00Z'));
  assert.equal(value.state,'OPEN');
  assert.equal(value.session,'REGULAR');
  assert.equal(value.localTime,'09:00:00');
});

test('weekends remain closed and expose next extended-hours open where defined',()=>{
  const value=sessionState('NYSE',Date.parse('2026-06-07T15:00:00Z'));
  assert.equal(value.state,'CLOSED');
  assert.equal(value.reason,'WEEKEND');
  assert.equal(value.nextOpenAt,Date.parse('2026-06-08T08:00:00Z'));
  assert.equal(value.nextCloseAt,Date.parse('2026-06-09T00:00:00Z'));
});

test('verified holiday override wins over base session and preserves calendar provenance', () => {
  const at = Date.UTC(2026,8,9,1,30);
  const value = sessionState('TWSE', at, verifiedDay({localDate:'2026-09-09',closed:true,reason:'HOLIDAY'}));
  assert.equal(value.state, 'CLOSED');
  assert.equal(value.session,'CLOSED');
  assert.equal(value.reason,'HOLIDAY');
  assert.equal(value.calendarConfidence, 'EXPLICIT_OVERRIDE');
  assert.equal(value.calendarSource,'OFFICIAL_EXCHANGE_CALENDAR');
  assert.equal(value.calendarLocalDate,'2026-09-09');
});

test('half-day or exceptional close can replace the named session windows without changing exchange timezone logic',()=>{
  const override=verifiedDay({
    localDate:'2026-11-27',
    reason:'EARLY_CLOSE',
    sessions:{
      PRE_MARKET:[[240,570]],
      REGULAR:[[570,780]],
      AFTER_HOURS:[[780,1020]]
    }
  });
  const regular=sessionState('NYSE',Date.parse('2026-11-27T17:30:00Z'),override);
  assert.equal(regular.localTime,'12:30:00');
  assert.equal(regular.session,'REGULAR');
  assert.equal(regular.sessionEndAt,Date.parse('2026-11-27T18:00:00Z'));
  const after=sessionState('NYSE',Date.parse('2026-11-27T18:15:00Z'),override);
  assert.equal(after.session,'AFTER_HOURS');
  assert.equal(after.sessionEndAt,Date.parse('2026-11-27T22:00:00Z'));
});

test('calendar override without source metadata fails unavailable rather than being trusted silently',()=>{
  const value=sessionState('TWSE',Date.UTC(2026,8,9,1,30),{localDate:'2026-09-09',closed:true,reason:'HOLIDAY'});
  assert.equal(value.state,'UNAVAILABLE');
  assert.equal(value.reason,'CALENDAR_OVERRIDE_INVALID');
});

test('future-dated calendar knowledge cannot be used point-in-time',()=>{
  const at=Date.parse('2026-09-09T01:30:00Z');
  const override={...verifiedDay({localDate:'2026-09-09',closed:true}),asOf:at+1};
  const value=sessionState('TWSE',at,override);
  assert.equal(value.state,'UNAVAILABLE');
  assert.equal(value.reason,'CALENDAR_OVERRIDE_FUTURE');
});

test('calendar override for another local date is not applied to today',()=>{
  const at=Date.parse('2026-09-09T01:30:00Z');
  const value=sessionState('TWSE',at,verifiedDay({localDate:'2026-09-10',closed:true}));
  assert.equal(value.state,'OPEN');
  assert.equal(value.session,'REGULAR');
  assert.equal(value.calendarConfidence,'BASE_SESSION_ONLY');
});

test('unknown exchange is unavailable, never guessed', () => {
  const value=sessionState('MARS', Date.UTC(2026,8,9,1,30));
  assert.equal(value.state, 'UNAVAILABLE');
  assert.equal(value.session,'UNAVAILABLE');
});
