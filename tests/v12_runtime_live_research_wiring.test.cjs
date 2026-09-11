'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Bootstrap=require('../v12/staging/live_research_bootstrap.js');
const Entry=require('../v12/staging/runtime_entry.js');

const nowMs=Date.parse('2026-09-09T06:30:00Z');

function response(status,body){return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}}}
function twQuoteRow(){return {Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'};}
function twFlowPayload(){return {fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],data:[['2330','台積電','4000000','1000000','-250000','4750000']]};}
function revenueRow(){return {'出表日期':'1150909','資料年月':'11508','公司代號':'2330','公司名稱':'台積電','產業別':'半導體業','營業收入-當月營收':'80000000','營業收入-上月營收':'75000000','營業收入-去年當月營收':'65000000','營業收入-上月比較增減(%)':'6.67','營業收入-去年同月增減(%)':'23.08','累計營業收入-當月累計營收':'550000000','累計營業收入-去年累計營收':'460000000','累計營業收入-前期比較增減(%)':'19.57','備註':''};}
function tpQuoteRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶',Open:'455.5',High:'470',Low:'452',Close:'468',Change:'12.5',TradingShares:'100000000',TransactionAmount:'46800000000',TransactionNumber:'83000'};}
function tpFlowRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference':'4000000','SecuritiesInvestmentTrustCompanies-Difference':'1000000','Dealers-Difference':'-250000','TotalDifference':'4750000'};}
function secPayload(){return {cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}};}
function blsPayload(seriesID,value){return {status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID,data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:String(value)}]}]}};}
function ecbPayload(value){return [{TIME_PERIOD:'2026-08',OBS_VALUE:String(value),OBS_STATUS:'A'}];}
function twMarketPayload(){return {stat:'OK',date:'20260909',tables:[{title:'價格指數',fields:['指數','收盤指數','漲跌(+/-)','漲跌點數','漲跌百分比(%)','特殊處理註記'],data:[['發行量加權股價指數','25,500.00','+','250.00','0.99',''],['半導體類指數','820','+','16','2.0',''],['電機機械類指數','560','+','5','0.9',''],['鋼鐵類指數','120','-','1','-0.8','']]},{title:'漲跌證券數合計',fields:['類型','整體市場','股票'],data:[['上漲(漲停)','700(20)','700(20)'],['下跌(跌停)','200(3)','200(3)'],['持平','50','50'],['未成交','0','0'],['無比價','0','0']]}]};}
function tpexHighlight(){return [{Date:'1150909',ListedCompanyNumbers:'850',CloseIndex:'300',IndexChange:'3',PriceRiseCompanyNumbers:'600',LimitUpCompanyNumbers:'18',PriceDeclineCompanyNumbers:'200',LimitDownCompanyNumbers:'4',PriceFlatCompanyNumbers:'50',UnmatchedCompanyNumbersSuspensionStocksIncluded:'0'}];}
function tpexTurnover(){return [{Date:'1150909',Sector:'電子零組件業',TradeAmount:'51072604401',TradeWeight:'50.11',' NumberOfSharesTraded':'493814334'},{Date:'1150909',Sector:'半導體業',TradeAmount:'28237126414',TradeWeight:'14.84',' NumberOfSharesTraded':'146286717'}];}

function fixtures(){
  const input=Bootstrap.buildBootstrapInput(nowMs);
  const table=new Map([
    [input.twMarket.twse.endpoint,response(200,twMarketPayload())],
    [input.twMarket.tpex.highlightEndpoint,response(200,tpexHighlight())],
    [input.twMarket.tpex.industryTurnoverEndpoint,response(200,tpexTurnover())],
    [input.twAssets[0].quoteEndpoint,response(200,[twQuoteRow()])],
    [input.twAssets[0].flowEndpoint,response(200,twFlowPayload())],
    [input.twAssets[0].revenueEndpoint,response(200,[revenueRow()])],
    [input.twAssets[1].quoteEndpoint,response(200,[tpQuoteRow()])],
    [input.twAssets[1].flowEndpoint,response(200,tpFlowRow())],
    [input.usAssets[0].sec.endpoint,response(200,secPayload())]
  ]);
  const blsValues={CUUR0000SA0:'326.5',LNS14000000:'4.2',CES0000000001:'159500'};
  for(const item of input.regions.US.bls){
    const seriesID=Object.keys(item.definitions)[0];
    table.set(item.endpoint,response(200,blsPayload(seriesID,blsValues[seriesID])));
  }
  const ecbValues=['2.1','2.15','2.00'];
  input.regions.EU.ecb.forEach((item,index)=>table.set(item.endpoint,response(200,ecbPayload(ecbValues[index]))));
  return table;
}

function request(address,path){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:address.address,port:address.port,path,method:'GET'},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));
    });
    req.on('error',reject);req.end();
  });
}

test('runtime config defaults to low-frequency official research refresh and rejects aggressive polling',()=>{
  const cfg=Entry.runtimeConfig({});
  assert.equal(cfg.refreshSeconds,1800);
  assert.throws(()=>Entry.runtimeConfig({FOXYYA_V12_REFRESH_SECONDS:'30'}),/REFRESH_SECONDS_INVALID/);
  assert.equal(Entry.runtimeConfig({FOXYYA_V12_REFRESH_SECONDS:'3600'}).refreshSeconds,3600);
});

test('staging runtime shares one durable lineage store across bootstrap, Home, and trace API',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-runtime-live-research-'));
  const lineageFilePath=path.join(dir,'runtime.lineage.jsonl');
  const table=fixtures();
  const calls=[];
  const timers=[];
  const cleared=[];
  const fetchImpl=async(url,init)=>{calls.push({url,init});if(!table.has(url))throw Error('unexpected '+url);return table.get(url)};
  try{
    const runtime=await Entry.startFromEnvironment({
      HOST:'127.0.0.1',PORT:'0',FOXYYA_V12_LINEAGE_PATH:lineageFilePath,FOXYYA_V12_REFRESH_SECONDS:'1800'
    },{
      fetchImpl,
      clock:()=>nowMs,
      setIntervalImpl(fn,ms){const token={fn,ms};timers.push(token);return token},
      clearIntervalImpl(token){cleared.push(token)},
      onResearchError(error){throw error}
    });
    try{
      const initial=await runtime.researchReady;
      assert.ok(initial);
      assert.equal(calls.length,16);
      assert.equal(timers.length,1);
      assert.equal(timers[0].ms,1800*1000);

      const homeRes=await request(runtime.address,'/v12/api/home');
      assert.equal(homeRes.status,200);
      const home=JSON.parse(homeRes.body);
      assert.equal(home.researchOnly,true);
      assert.equal(home.executionWrite,false);
      assert.equal(home.home.opportunities.TW.length,2);
      assert.equal(home.home.opportunities.US.length,1);
      assert.equal(home.home.opportunities.CRYPTO.length,0);
      assert.equal(home.home.regions.find(x=>x.region==='US').facts.length,3);
      assert.equal(home.home.regions.find(x=>x.region==='EU').facts.length,3);
      const twRegion=home.home.regions.find(x=>x.region==='TW');
      assert.equal(twRegion.status,'AVAILABLE');
      assert.ok(twRegion.facts.some(x=>x.field==='market.index.taiex.close'));
      assert.ok(twRegion.facts.some(x=>x.field==='market.index.otc.close'));
      const twPulse=home.home.marketPulse.find(x=>x.market==='TW');
      assert.equal(twPulse.status,'AVAILABLE');
      assert.equal(twPulse.state,'BROAD_ADVANCE');

      const lineageRef=home.home.opportunities.TW[0].lineageRef;
      const traceRes=await request(runtime.address,'/v12/api/lineage/output/'+lineageRef);
      assert.equal(traceRes.status,200);
      const trace=JSON.parse(traceRes.body);
      assert.equal(trace.lineageRef,lineageRef);
      assert.equal(trace.data.output.subjectId,home.home.opportunities.TW[0].instrumentId);
      assert.ok(trace.data.sources.length>=2);
      assert.ok(trace.data.observations.length>=2);
      assert.equal(fs.existsSync(lineageFilePath),true);
    }finally{
      await runtime.close();
      assert.deepEqual(cleared,timers);
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('provider network failures stay unavailable without taking down staging health',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-runtime-research-failure-'));
  const lineageFilePath=path.join(dir,'runtime.lineage.jsonl');
  const errors=[];
  const runtime=await Entry.startFromEnvironment({HOST:'127.0.0.1',PORT:'0',FOXYYA_V12_LINEAGE_PATH:lineageFilePath},{
    fetchImpl:async()=>{throw Error('NETWORK_DOWN')},
    clock:()=>nowMs,
    setIntervalImpl(){return 1},clearIntervalImpl(){},
    onResearchError(error){errors.push(error)}
  });
  try{
    const initial=await runtime.researchReady;
    assert.ok(initial,'provider failures are represented in result, not promoted to runtime exception');
    assert.equal(errors.length,0);
    assert.equal((await request(runtime.address,'/health')).status,200);
    const homeRes=await request(runtime.address,'/v12/api/home');
    assert.equal(homeRes.status,200,'provider UNAVAILABLE states should still publish an honest Home snapshot');
    const home=JSON.parse(homeRes.body);
    assert.equal(home.home.opportunities.TW.length,0);
    assert.equal(home.home.opportunities.US.length,0);
    assert.equal(home.home.regions.find(x=>x.region==='US').status,'UNAVAILABLE');
    assert.equal(home.home.regions.find(x=>x.region==='EU').status,'UNAVAILABLE');
    assert.equal(home.home.regions.find(x=>x.region==='TW').status,'UNAVAILABLE');
  }finally{await runtime.close();fs.rmSync(dir,{recursive:true,force:true})}
});
