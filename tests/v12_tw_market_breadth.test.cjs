'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const TWSE=require('../v12/providers/twse_adapter.js');
const TPEX=require('../v12/providers/tpex_adapter.js');

const receivedAt=Date.parse('2026-09-09T08:30:00Z');

function miIndexPayload(){
  return {
    stat:'OK',date:'20260909',tables:[
      {
        title:'115年09月09日 價格指數(臺灣證券交易所)',
        fields:['指數','收盤指數','漲跌(+/-)','漲跌點數','漲跌百分比(%)','特殊處理註記'],
        data:[
          ['發行量加權股價指數','47,183.36','<p style="color:red">+</p>','77.58','0.16',''],
          ['水泥類指數','123.70','+','1.41','1.15',''],
          ['食品類指數','1,928.68','-','9.52','-0.49',''],
          ['電機機械類指數','553.72','+','6.21','1.13',''],
          ['化學生技醫療類指數','167.48','-','2.64','-1.55',''],
          ['生技醫療類指數','95.32','-','2.31','-2.37',''],
          ['鋼鐵類指數','121.64','+','0.30','0.25','']
        ]
      },
      {
        title:'漲跌證券數合計',
        fields:['類型','整體市場','股票'],
        data:[
          ['上漲(漲停)','6,805(58)','607(12)'],
          ['下跌(跌停)','5,306(59)','370(0)'],
          ['持平','1,109','99'],
          ['未成交','17,528','0'],
          ['無比價','3,731','7']
        ]
      }
    ]
  };
}

test('TWSE MI_INDEX normalizes TAIEX and stock-only breadth without confusing whole-market securities counts',()=>{
  const result=TWSE.normalizeMarketBreadth(miIndexPayload(),{tradeDate:'20260909',receivedAt});
  assert.equal(result.market,'TW');
  assert.equal(result.venue,'TWSE');
  assert.equal(result.tradeDate,'2026-09-09');
  assert.deepEqual(result.taiex,{close:47183.36,change:77.58,changePct:0.16});
  assert.deepEqual(result.breadth,{advancers:607,decliners:370,unchanged:99,limitUp:12,limitDown:0,untraded:0,noComparison:7,advanceDeclineRatio:607/370,participationPct:(607+370+99)/(607+370+99+0+7)});
  assert.notEqual(result.breadth.advancers,6805,'must use 股票 column, not 整體市場 securities count');
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('TWSE MI_INDEX exposes industry leaders and laggards from official industry index rows',()=>{
  const result=TWSE.normalizeMarketBreadth(miIndexPayload(),{tradeDate:'20260909',receivedAt});
  assert.equal(result.industries.length,6);
  assert.deepEqual(result.industries.slice(0,3).map(x=>[x.name,x.changePct]),[
    ['水泥類',1.15],['電機機械類',1.13],['鋼鐵類',0.25]
  ]);
  assert.deepEqual(result.industries.slice(-2).map(x=>[x.name,x.changePct]),[
    ['化學生技醫療類',-1.55],['生技醫療類',-2.37]
  ]);
  assert.ok(result.observations.some(x=>x.field==='market.index.taiex.close'&&x.value===47183.36));
  assert.ok(result.observations.some(x=>x.field==='market.breadth.advancers'&&x.value===607));
  assert.ok(result.observations.some(x=>x.field==='market.breadth.advance_decline_ratio'&&Math.abs(x.value-607/370)<1e-12));
  for(const observation of result.observations){
    assert.equal(observation.scope,'TW');
    assert.equal(observation.status,'SNAPSHOT');
    assert.ok(observation.observedAt<=observation.receivedAt);
  }
});

test('TWSE MI_INDEX fails closed when the stock breadth table is absent instead of fabricating zeros',()=>{
  const payload=miIndexPayload();
  payload.tables=payload.tables.filter(table=>table.title!=='漲跌證券數合計');
  assert.throws(()=>TWSE.normalizeMarketBreadth(payload,{tradeDate:'20260909',receivedAt}),/TWSE_BREADTH_TABLE_REQUIRED/);
});

test('TPEx market highlight normalizes OTC index and official advance decline counts',()=>{
  const row={
    Date:'1150909',ListedCompanyNumbers:'864',AuthorizedCapital:'900000',MarketCapitalization:'7100000',DailyTradingValue:'210000',DailyTradingVolume:'1900000',
    CloseIndex:'401.25',IndexChange:'-3.75',PriceRiseCompanyNumbers:'336',LimitUpCompanyNumbers:'13',PriceDeclineCompanyNumbers:'444',LimitDownCompanyNumbers:'6',PriceFlatCompanyNumbers:'58',UnmatchedCompanyNumbersSuspensionStocksIncluded:'26'
  };
  const result=TPEX.normalizeMarketHighlight(row,{receivedAt});
  assert.equal(result.market,'TW');
  assert.equal(result.venue,'TPEX');
  assert.equal(result.tradeDate,'2026-09-09');
  assert.equal(result.otc.close,401.25);
  assert.equal(result.otc.change,-3.75);
  assert.ok(Math.abs(result.otc.changePct-(-3.75/405*100))<1e-12);
  assert.deepEqual(result.breadth,{advancers:336,decliners:444,unchanged:58,limitUp:13,limitDown:6,untraded:26,listed:864,advanceDeclineRatio:336/444,participationPct:(336+444+58)/864});
  assert.ok(result.observations.some(x=>x.field==='market.index.otc.close'&&x.value===401.25));
  assert.ok(result.observations.some(x=>x.field==='market.breadth.advancers'&&x.value===336));
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('TPEx industry turnover ranks sectors by official TradeWeight without pretending it is sector return',()=>{
  const rows=[
    {Date:'1150909',Sector:'半導體業',TradeAmount:'28237126414',TradeWeight:'14.84',' NumberOfSharesTraded':'146286717'},
    {Date:'1150909',Sector:'電子零組件業',TradeAmount:'51072604401',TradeWeight:'50.11',' NumberOfSharesTraded':'493814334'},
    {Date:'1150909',Sector:'光電業',TradeAmount:'7544468549',TradeWeight:'6.5',' NumberOfSharesTraded':'64054578'}
  ];
  const result=TPEX.normalizeIndustryTurnover(rows,{receivedAt});
  assert.equal(result.tradeDate,'2026-09-09');
  assert.deepEqual(result.sectors.map(x=>[x.name,x.tradeWeightPct]),[
    ['電子零組件業',50.11],['半導體業',14.84],['光電業',6.5]
  ]);
  assert.equal(result.sectors[0].tradeAmount,51072604401);
  assert.equal(result.sectors[0].sharesTraded,493814334);
  assert.equal(Object.hasOwn(result.sectors[0],'changePct'),false,'turnover share is not sector price performance');
  assert.ok(result.observations.some(x=>x.field==='market.industry.turnover_weight_pct'&&x.value===50.11));
});

test('TPEx highlight rejects accounting mismatch instead of silently making breadth percentages misleading',()=>{
  const row={Date:'1150909',ListedCompanyNumbers:'10',CloseIndex:'400',IndexChange:'1',PriceRiseCompanyNumbers:'8',LimitUpCompanyNumbers:'1',PriceDeclineCompanyNumbers:'8',LimitDownCompanyNumbers:'0',PriceFlatCompanyNumbers:'1',UnmatchedCompanyNumbersSuspensionStocksIncluded:'1'};
  assert.throws(()=>TPEX.normalizeMarketHighlight(row,{receivedAt}),/TPEX_BREADTH_TOTAL_MISMATCH/);
});
