'use strict';
// CI-only deterministic public-source fixtures. Never loaded by Railway.
const Bootstrap=require('/app/v12/staging/live_research_bootstrap.js');
const nowMs=Date.parse('2026-09-09T06:30:00Z');
Date.now=()=>nowMs;
function response(status,body){
  return {ok:status>=200&&status<300,status,headers:{get(name){return String(name).toLowerCase()==='content-type'?'application/json; charset=utf-8':null;}},async json(){return body;}};
}
function twQuoteRow(){return {Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'};}
function twFlowPayload(){return {fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],data:[['2330','台積電','4000000','1000000','-250000','4750000']]};}
function revenueRow(){return {'出表日期':'1150909','資料年月':'11508','公司代號':'2330','公司名稱':'台積電','產業別':'半導體業','營業收入-當月營收':'80000000','營業收入-上月營收':'75000000','營業收入-去年當月營收':'65000000','營業收入-上月比較增減(%)':'6.67','營業收入-去年同月增減(%)':'23.08','累計營業收入-當月累計營收':'550000000','累計營業收入-去年累計營收':'460000000','累計營業收入-前期比較增減(%)':'19.57','備註':''};}
function tpQuoteRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶',Open:'455.5',High:'470',Low:'452',Close:'468',Change:'12.5',TradingShares:'100000000',TransactionAmount:'46800000000',TransactionNumber:'83000'};}
function tpFlowRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference':'4000000','SecuritiesInvestmentTrustCompanies-Difference':'1000000','Dealers-Difference':'-250000','TotalDifference':'4750000'};}
function secPayload(){return {cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}};}
function blsPayload(seriesID,value){return {status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID,data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:String(value)}]}]}};}
function ecbPayload(value){return [{TIME_PERIOD:'2026-08',OBS_VALUE:String(value),OBS_STATUS:'A'}];}
function cftcRows(){return [{report_date_as_yyyy_mm_dd:'2026-09-08',cftc_contract_market_code:'13874A',market_and_exchange_names:'E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE',contract_market_name:'E-MINI S&P 500',commodity_name:'S&P 500',open_interest_all:'100000',asset_mgr_positions_long:'42000',asset_mgr_positions_short:'18000',asset_mgr_positions_spread:'6000',lev_money_positions_long:'21000',lev_money_positions_short:'30000',lev_money_positions_spread:'5000',dealer_positions_long_all:'15000',dealer_positions_short_all:'27000'}];}
function twMarketPayload(){return {stat:'OK',date:'20260909',tables:[{title:'價格指數',fields:['指數','收盤指數','漲跌(+/-)','漲跌點數','漲跌百分比(%)','特殊處理註記'],data:[['發行量加權股價指數','25,500.00','+','250.00','0.99',''],['半導體類指數','820','+','16','2.0',''],['電機機械類指數','560','+','5','0.9',''],['鋼鐵類指數','120','-','1','-0.8','']]},{title:'漲跌證券數合計',fields:['類型','整體市場','股票'],data:[['上漲(漲停)','700(20)','700(20)'],['下跌(跌停)','200(3)','200(3)'],['持平','50','50'],['未成交','0','0'],['無比價','0','0']]}]};}
function tpexHighlight(){return [{Date:'1150909',ListedCompanyNumbers:'850',CloseIndex:'300',IndexChange:'3',PriceRiseCompanyNumbers:'600',LimitUpCompanyNumbers:'18',PriceDeclineCompanyNumbers:'200',LimitDownCompanyNumbers:'4',PriceFlatCompanyNumbers:'50',UnmatchedCompanyNumbersSuspensionStocksIncluded:'0'}];}
function tpexTurnover(){return [{Date:'1150909',Sector:'電子零組件業',TradeAmount:'51072604401',TradeWeight:'50.11',' NumberOfSharesTraded':'493814334'},{Date:'1150909',Sector:'半導體業',TradeAmount:'28237126414',TradeWeight:'14.84',' NumberOfSharesTraded':'146286717'}];}

function fixtures(input){
  const table=new Map([
    [input.twMarket.twse.endpoint,response(200,twMarketPayload())],
    [input.twMarket.tpex.highlightEndpoint,response(200,tpexHighlight())],
    [input.twMarket.tpex.industryTurnoverEndpoint,response(200,tpexTurnover())],
    [input.twAssets[0].quoteEndpoint,response(200,[twQuoteRow()])],
    [input.twAssets[0].flowEndpoint,response(200,twFlowPayload())],
    [input.twAssets[0].revenueEndpoint,response(200,[revenueRow()])],
    [input.twAssets[1].quoteEndpoint,response(200,[tpQuoteRow()])],
    [input.twAssets[1].flowEndpoint,response(200,[tpFlowRow()])],
    [input.usAssets[0].sec.endpoint,response(200,secPayload())],
    [input.regions.US.cftc[0].endpoint,response(200,cftcRows())]
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

const table=fixtures(Bootstrap.buildBootstrapInput(nowMs));
globalThis.fetch=async(url)=>table.get(String(url))||response(503,{});
