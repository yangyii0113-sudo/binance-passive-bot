'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const Bootstrap=require('../v12/staging/live_research_bootstrap.js');
const Entry=require('../v12/staging/runtime_entry.js');

const nowMs=Date.parse('2026-09-09T06:30:00Z');
const available=data=>Object.freeze({status:'AVAILABLE',data,researchOnly:true,executionWrite:false});
function response(status,body){return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}}}
function officialFixtures(){
  const input=Bootstrap.buildBootstrapInput(nowMs);
  return new Map([
    [input.twAssets[0].quoteEndpoint,response(200,[{Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'}])],
    [input.twAssets[0].flowEndpoint,response(200,{fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],data:[['2330','台積電','4000000','1000000','-250000','4750000']]})],
    [input.twAssets[0].revenueEndpoint,response(200,[{'出表日期':'1150909','資料年月':'11508','公司代號':'2330','公司名稱':'台積電','產業別':'半導體業','營業收入-當月營收':'80000000','營業收入-上月營收':'75000000','營業收入-去年當月營收':'65000000','營業收入-上月比較增減(%)':'6.67','營業收入-去年同月增減(%)':'23.08','累計營業收入-當月累計營收':'550000000','累計營業收入-去年累計營收':'460000000','累計營業收入-前期比較增減(%)':'19.57','備註':''}])],
    [input.twAssets[1].quoteEndpoint,response(200,[{Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶',Open:'455.5',High:'470',Low:'452',Close:'468',Change:'12.5',TradingShares:'100000000',TransactionAmount:'46800000000',TransactionNumber:'83000'}])],
    [input.twAssets[1].flowEndpoint,response(200,[{Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference':'4000000','SecuritiesInvestmentTrustCompanies-Difference':'1000000','Dealers-Difference':'-250000','TotalDifference':'4750000'}])],
    [input.usAssets[0].sec.endpoint,response(200,{cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}})],
    [input.regions.US.bls[0].endpoint,response(200,{status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID:'CUUR0000SA0',data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:'326.5'}]}]}})],
    [input.regions.EU.ecb[0].endpoint,response(200,[{TIME_PERIOD:'2026-08',OBS_VALUE:'2.1',OBS_STATUS:'A'}])]
  ]);
}
function bridge(){
  const calls={runtime:0,calendar:0,news:0};
  return {calls,value:Object.freeze({
    async loadRuntime(){calls.runtime++;return available({status:{ok:true,paper_only:true,real_order_lock:true,execution_enabled:false,strategy_version:'FOXYYA-EXEC-V2-20260908',cycle_count:3,ledger_integrity:true},snapshot:{schema:'foxyya-runtime-snapshot/1',status:'PAPER_ONLY',real_orders:false,complete:true,served_at:nowMs,ledger_events:3,books:{'5x':{}},candidates:[{symbol:'ETHUSDT',family:'A',side:'LONG',status:'ARMED'}],pending:[],trades:[],diagnostics:{qualified_24h:1,filled_24h:0}}})},
    async loadCalendar(){calls.calendar++;return available({schema:'foxyya-calendar/1',status:'LIVE_SOURCE',fetched_at:nowMs,events:[{time:'2026-09-10T12:30:00Z',title:'Consumer Price Index',source:'BLS',impact:'EXTREME'}]})},
    async loadNews(){calls.news++;return available({schema:'foxyya-news/1',status:'LIVE_SOURCE',fetched_at:nowMs,items:[{title:'Fed statement',published_at:'2026-09-09T05:00:00Z',source:'Federal Reserve',impact:'HIGH'}]})},
    async loadBacktest(){throw Error('not used')}
  })};
}
function request(address,path){return new Promise((resolve,reject)=>{const req=http.request({host:address.address,port:address.port,path,method:'GET'},res=>{let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}))});req.on('error',reject);req.end()})}

test('runtime entry passes one injected read-only Production bridge into each research refresh',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-entry-bridge-'));
  const lineageFilePath=path.join(dir,'runtime.lineage.jsonl');
  const table=officialFixtures();
  const pair=bridge();
  const runtime=await Entry.startFromEnvironment({HOST:'127.0.0.1',PORT:'0',FOXYYA_V12_LINEAGE_PATH:lineageFilePath,FOXYYA_V12_REFRESH_SECONDS:'1800'},{
    fetchImpl:async url=>{if(!table.has(url))throw Error('unexpected '+url);return table.get(url)},
    executionBridge:pair.value,
    clock:()=>nowMs,
    setIntervalImpl(){return 1},clearIntervalImpl(){},onResearchError(error){throw error}
  });
  try{
    const result=await runtime.researchReady;
    assert.ok(result);
    assert.deepEqual(pair.calls,{runtime:1,calendar:1,news:1});
    const home=JSON.parse((await request(runtime.address,'/v12/api/home')).body);
    assert.equal(home.home.marketPulse.find(x=>x.market==='CRYPTO').status,'AVAILABLE');
    assert.equal(home.home.opportunities.CRYPTO.length,1);
    assert.equal(home.home.events.length,2);
    assert.equal(home.executionWrite,false);
  }finally{await runtime.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('runtime entry source includes default Production read bridge construction for real deployment',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../v12/staging/runtime_entry.js'),'utf8');
  assert.match(source,/createExecutionReadBridge/);
  assert.match(source,/executionBridge/);
});