'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Renderer=require('../v12/ui/home_renderer.js');
const Product=require('../v12/ui/product_renderer.js');
const Bootstrap=require('../v12/staging/live_research_bootstrap.js');

const asOf=Date.parse('2026-09-10T12:00:00Z');
const regionIds=['US','TW','CN_HK','JP','KR','EU','CRYPTO'];

function baseView(overrides={}){
  return Object.freeze({
    schemaVersion:'foxyya-home-view-model/1',asOf,researchOnly:true,executionWrite:false,
    providerDiagnostics:null,
    regions:Object.freeze(regionIds.map(region=>Object.freeze({region,bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf,facts:[],lineageRef:null}))),
    marketPulse:Object.freeze([
      Object.freeze({market:'CRYPTO',status:'AVAILABLE',stateLabel:'PAPER ONLY',asOf,data:Object.freeze({health:'HEALTHY',candidateCount:432,pendingCount:3,openPositionCount:2,ledgerIntegrity:true})}),
      Object.freeze({market:'US',status:'UNAVAILABLE',stateLabel:'UNAVAILABLE',asOf,data:null}),
      Object.freeze({market:'TW',status:'UNAVAILABLE',stateLabel:'UNAVAILABLE',asOf,data:null})
    ]),
    earlyTrend:Object.freeze([]),
    opportunities:Object.freeze({
      CRYPTO:Object.freeze(Array.from({length:12},(_,i)=>Object.freeze({market:'CRYPTO',symbol:`COIN${i}USDT`,side:i%2?'SHORT':'LONG',family:'A',status:'WATCH',mode:'PAPER READ-ONLY',executionReadOnly:true,executionWrite:false}))),
      US:Object.freeze([Object.freeze({market:'US',instrumentId:'NASDAQ:NVDA',direction:'UNAVAILABLE',earlyStage:'UNAVAILABLE',research:Object.freeze({confidence:.4}),facts:Object.freeze([{field:'fundamental.revenue',value:30000000000,unit:'USD',status:'SNAPSHOT',source:'SEC',observedAt:asOf,receivedAt:asOf}]),dataGaps:Object.freeze({realtimeQuote:true}),researchOnly:true,executionWrite:false})]),
      TW:Object.freeze([
        Object.freeze({market:'TW',instrumentId:'TWSE:2330',direction:'POSITIVE',earlyStage:'CONFIRMING',research:Object.freeze({confidence:.65}),facts:Object.freeze([{field:'market.close',value:1215,unit:'TWD',status:'SNAPSHOT',source:'TWSE',observedAt:asOf,receivedAt:asOf}]),dataGaps:Object.freeze({}),researchOnly:true,executionWrite:false}),
        Object.freeze({market:'TW',instrumentId:'TPEX:6488',direction:'UNAVAILABLE',earlyStage:'EARLY WATCH',research:Object.freeze({confidence:.4}),facts:Object.freeze([{field:'market.close',value:468,unit:'TWD',status:'SNAPSHOT',source:'TPEX',observedAt:asOf,receivedAt:asOf}]),dataGaps:Object.freeze({}),researchOnly:true,executionWrite:false})
      ])
    }),
    events:Object.freeze([
      Object.freeze({kind:'NEWS',id:'news-1',title:"Robinhood CEO Vlad Tenev fires back at AMC's Aron in escalating fight over stock tokens",source:'CoinDesk',asOf,impact:'HIGH',status:'SNAPSHOT',summary:'Public companies should not have veto power over third-party securities that reference their shares.',tags:Object.freeze(['TOKENIZATION']),assets:Object.freeze(['HOOD','AMC'])}),
      Object.freeze({kind:'NEWS',id:'news-2',title:'Federal Reserve Board announces termination of enforcement actions with banks',source:'Federal Reserve',asOf:asOf-1000,impact:'HIGH',status:'SNAPSHOT',summary:'The Board terminated several enforcement actions.',tags:Object.freeze(['MACRO']),assets:Object.freeze([])})
    ]),
    calendar:Object.freeze([]),news:Object.freeze([]),
    todayFocus:Object.freeze([
      Object.freeze({kind:'NEWS',id:'news-1',title:"Robinhood CEO Vlad Tenev fires back at AMC's Aron in escalating fight over stock tokens",source:'CoinDesk',asOf,impact:'HIGH',status:'SNAPSHOT',summary:'Public companies should not have veto power over third-party securities that reference their shares.',tags:Object.freeze(['TOKENIZATION']),assets:Object.freeze(['HOOD','AMC'])})
    ]),
    positions:Object.freeze({status:'AVAILABLE',paperOnly:true,realOrderLock:true,readOnly:true,health:'HEALTHY',asOf,ledgerIntegrity:true,pending:Object.freeze([]),open:Object.freeze([])}),
    tradingResults:null,
    ...overrides
  });
}

test('七大區域市場會聚合已存在的研究、事件與 Crypto 執行資料，而不是把有資料的市場畫成空殼',()=>{
  const out=Renderer.renderHomeSections(baseView());
  assert.match(out.regionsHtml,/台灣/);
  assert.match(out.regionsHtml,/部分可用/);
  assert.match(out.regionsHtml,/個股研究 2 檔/);
  assert.match(out.regionsHtml,/2330 · 偏正向/);
  assert.match(out.regionsHtml,/6488 · 暫不判斷/);
  assert.match(out.regionsHtml,/美國/);
  assert.match(out.regionsHtml,/個股研究 1 檔/);
  assert.match(out.regionsHtml,/NVDA · 暫不判斷/);
  assert.match(out.regionsHtml,/重大事件 2 則/);
  assert.match(out.regionsHtml,/加密市場/);
  assert.match(out.regionsHtml,/策略候選 12 筆/);
  assert.match(out.regionsHtml,/多方 6 · 空方 6/);
  assert.match(out.regionsHtml,/執行引擎 健康/);
  assert.match(out.regionsHtml,/data-region="JP"[^>]*compact-gap/);
  assert.match(out.regionsHtml,/data-region="KR"[^>]*compact-gap/);
  assert.match(out.regionsHtml,/data-region="CN_HK"[^>]*compact-gap/);
});

test('今日焦點以中文研究解讀為主，原始英文標題降為來源證據',()=>{
  const out=Renderer.renderHomeSections(baseView());
  assert.match(out.todayFocusHtml,/股票代幣化與證券規則/);
  assert.match(out.todayFocusHtml,/為什麼重要/);
  assert.match(out.todayFocusHtml,/影響市場/);
  assert.match(out.todayFocusHtml,/美股/);
  assert.match(out.todayFocusHtml,/原始標題/);
  assert.match(out.todayFocusHtml,/查看來源摘要/);
  assert.match(out.todayFocusHtml,/Public companies should not have veto power/);
  assert.match(out.todayFocusHtml,/class="panel focus-intel-card"/);
});

test('預設 live bootstrap 使用更多免費官方宏觀資料：美國 3 條 BLS、歐洲 3 條 ECB',()=>{
  const input=Bootstrap.buildBootstrapInput(asOf);
  assert.equal(input.regions.US.bls.length,3);
  assert.equal(input.regions.EU.ecb.length,3);
  const blsFields=input.regions.US.bls.flatMap(x=>Object.values(x.definitions).map(d=>d.field));
  assert.deepEqual(blsFields.sort(),['employment.nonfarm_payroll','inflation.cpi_index','labor.unemployment_rate'].sort());
  for(const item of input.regions.US.bls){
    const url=new URL(item.endpoint);
    assert.equal(url.hostname,'api.bls.gov');
    assert.equal(url.searchParams.get('latest'),'true');
  }
  const ecbFields=input.regions.EU.ecb.map(x=>x.definition.field).sort();
  assert.deepEqual(ecbFields,['inflation.hicp_yoy','rates.deposit_facility','rates.main_refinancing'].sort());
});

test('新增宏觀欄位在使用者介面必須是繁體中文標籤與單位',()=>{
  const facts=[
    {field:'labor.unemployment_rate',value:4.2,unit:'PCT',status:'SNAPSHOT',source:'BLS',observedAt:asOf,receivedAt:asOf},
    {field:'employment.nonfarm_payroll',value:159500,unit:'THOUSANDS',status:'SNAPSHOT',source:'BLS',observedAt:asOf,receivedAt:asOf},
    {field:'rates.main_refinancing',value:2.15,unit:'PCT',status:'SNAPSHOT',source:'ECB',observedAt:asOf,receivedAt:asOf},
    {field:'rates.deposit_facility',value:2,unit:'PCT',status:'SNAPSHOT',source:'ECB',observedAt:asOf,receivedAt:asOf}
  ];
  const html=Product.factsHtml(facts);
  for(const label of ['美國失業率','美國非農就業人數','歐元區主要再融資利率','歐元區存款機制利率','千人'])assert.match(html,new RegExp(label));
  assert.doesNotMatch(html,/labor\.unemployment_rate|employment\.nonfarm_payroll|rates\.main_refinancing|rates\.deposit_facility|THOUSANDS/);
});