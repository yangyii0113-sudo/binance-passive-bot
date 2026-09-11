'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Bootstrap=require('../v12/staging/live_research_bootstrap.js');

const saturday=Date.parse('2026-09-12T02:00:00Z'); // 10:00 Asia/Taipei, Saturday
function response(status,body){return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}}}
function quote(){return {Date:'1150911',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'};}

test('Taiwan bootstrap aligns date-specific TWSE sources to the latest official closed quote session across weekends and holidays',async()=>{
  const base=Bootstrap.buildBootstrapInput(saturday);
  assert.equal(base.twAssets[0].tradeDate,'20260912');
  assert.match(base.twAssets[0].flowEndpoint,/date=20260912/);
  assert.match(base.twMarket.twse.endpoint,/date=20260912/);

  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push(url);
    assert.equal(init.method,'GET');
    if(url===base.twAssets[0].quoteEndpoint)return response(200,[quote()]);
    throw Error('UNEXPECTED_URL:'+url);
  };

  const aligned=await Bootstrap.alignTaiwanTradeDate(base,{fetchImpl,clock:()=>saturday});
  assert.deepEqual(calls,[base.twAssets[0].quoteEndpoint]);
  assert.equal(aligned.twAssets[0].tradeDate,'20260911');
  assert.match(aligned.twAssets[0].flowEndpoint,/date=20260911/);
  assert.equal(aligned.twMarket.twse.tradeDate,'20260911');
  assert.equal(aligned.twMarket.tpex.tradeDate,'20260911');
  assert.match(aligned.twMarket.twse.endpoint,/date=20260911/);
  assert.equal(aligned.researchOnly,undefined,'bootstrap input must remain data-only and not gain execution authority');
});

test('Taiwan date alignment fails closed to the original calendar-date plan when the official quote resolver is unavailable',async()=>{
  const base=Bootstrap.buildBootstrapInput(saturday);
  const aligned=await Bootstrap.alignTaiwanTradeDate(base,{fetchImpl:async()=>{throw Error('NETWORK_DOWN')},clock:()=>saturday});
  assert.equal(aligned.twAssets[0].flowEndpoint,base.twAssets[0].flowEndpoint);
  assert.equal(aligned.twMarket.twse.endpoint,base.twMarket.twse.endpoint);
});
