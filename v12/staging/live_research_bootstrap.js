'use strict';

const EvidencePolicy=require('../early_trend/evidence_policy.js');
const NewsImpact=require('../intelligence/news_impact_engine.js');
const {createProviderRuntimeGovernance}=require('../providers/runtime_governance.js');
const {createStagingSourcePipeline}=require('./source_pipeline.js');

const TW_POLICY=EvidencePolicy.freezeEvidencePolicy({
  schemaVersion:'foxyya-evidence-policy/1',
  id:'tw-live-bootstrap-v1',
  market:'TW',
  mode:'RESEARCH_CONTROL',
  createdAt:Date.parse('2026-09-09T00:00:00Z'),
  researchOnly:true,
  executionWrite:false,
  parameters:{
    institutionalFlow:{fullScaleRatio:0.05},
    institutionalPersistence:{minSessions:3,fullScaleAverageRatio:0.04},
    revenueAcceleration:{fullScalePct:20}
  }
});

function finite(value){return typeof value==='number'&&Number.isFinite(value)}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)}

function taipeiTradeDate(nowMs){
  if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Taipei',
    year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date(nowMs));
  const values={};
  for(const part of parts)if(part.type!=='literal')values[part.type]=part.value;
  return `${values.year}${values.month}${values.day}`;
}

function nvdaInstrument(){
  return Object.freeze({
    instrumentId:'NASDAQ:NVDA',
    exchange:'NASDAQ',
    symbol:'NVDA',
    market:'US',
    region:'US',
    currency:'USD',
    timezone:'America/New_York',
    assetType:'EQUITY'
  });
}

function blsSource(seriesId,entityId,field,unit){
  return Object.freeze({
    endpoint:`https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}?latest=true`,
    definitions:Object.freeze({
      [seriesId]:Object.freeze({entityId,scope:'US',field,unit})
    })
  });
}

function ecbSource(seriesKey,entityId,field,unit='PCT'){
  const [flow,...key]=seriesKey.split('.');
  return Object.freeze({
    endpoint:`https://data-api.ecb.europa.eu/service/data/${flow}/${key.join('.')}`,
    definition:Object.freeze({seriesKey,entityId,scope:'EU',field,unit})
  });
}

function buildBootstrapInput(nowMs){
  if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');
  const tradeDate=taipeiTradeDate(nowMs);

  return Object.freeze({
    nowMs,
    twMarket:Object.freeze({
      twse:Object.freeze({
        tradeDate,
        endpoint:`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${tradeDate}&type=ALLBUT0999&response=json`
      }),
      tpex:Object.freeze({
        tradeDate,
        highlightEndpoint:'https://www.tpex.org.tw/openapi/v1/tpex_mainborad_highlight',
        industryTurnoverEndpoint:'https://www.tpex.org.tw/openapi/v1/tpex_trading_volume_ratio'
      })
    }),
    twAssets:Object.freeze([
      Object.freeze({
        exchange:'TWSE',
        symbol:'2330',
        tradeDate,
        quoteEndpoint:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
        flowEndpoint:`https://www.twse.com.tw/rwd/zh/fund/T86?date=${tradeDate}&selectType=ALL&response=json`,
        revenueEndpoint:'https://openapi.twse.com.tw/v1/opendata/t187ap05_L',
        policy:TW_POLICY,
        researchEvidence:Object.freeze([])
      }),
      Object.freeze({
        exchange:'TPEX',
        symbol:'6488',
        quoteEndpoint:'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes',
        flowEndpoint:'https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading',
        policy:TW_POLICY,
        researchEvidence:Object.freeze([])
      })
    ]),
    usAssets:Object.freeze([
      Object.freeze({
        instrument:nvdaInstrument(),
        sec:Object.freeze({
          endpoint:'https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json',
          taxonomy:'us-gaap',
          concept:'RevenueFromContractWithCustomerExcludingAssessedTax',
          unit:'USD'
        }),
        researchEvidence:Object.freeze([]),
        earlyEvidence:Object.freeze([]),
        realtimeQuoteAvailable:false,
        consensusAvailable:false,
        optionsAvailable:false
      })
    ]),
    regions:Object.freeze({
      US:Object.freeze({
        bls:Object.freeze([
          blsSource('CUUR0000SA0','MACRO:US:CPI','inflation.cpi_index','INDEX'),
          blsSource('LNS14000000','MACRO:US:UNEMPLOYMENT','labor.unemployment_rate','PCT'),
          blsSource('CES0000000001','MACRO:US:PAYROLL','employment.nonfarm_payroll','THOUSANDS')
        ])
      }),
      EU:Object.freeze({
        ecb:Object.freeze([
          ecbSource('ICP.M.U2.N.000000.4.ANR','MACRO:EU:HICP','inflation.hicp_yoy'),
          ecbSource('FM.D.U2.EUR.4F.KR.MRR_FR.LEV','MACRO:EU:MRO_RATE','rates.main_refinancing'),
          ecbSource('FM.D.U2.EUR.4F.KR.DFR.LEV','MACRO:EU:DEPOSIT_RATE','rates.deposit_facility')
        ])
      })
    }),
    todayFocus:Object.freeze([]),
    events:Object.freeze([]),
    pulses:Object.freeze({
      US:Object.freeze({
        status:'UNAVAILABLE',
        state:'UNAVAILABLE',
        asOf:nowMs,
        reason:'NASDAQ_EOD_LICENSE_REVIEW_REQUIRED|US_FULL_MARKET_BREADTH_UNAVAILABLE',
        data:null
      })
    })
  });
}

function validateExecutionBridge(value){
  if(value===undefined||value===null)return null;
  if(!object(value))throw Error('EXECUTION_READ_BRIDGE_INVALID');
  for(const method of ['loadRuntime','loadCalendar','loadNews']){
    if(typeof value[method]!=='function')throw Error('EXECUTION_READ_BRIDGE_INVALID');
  }
  return value;
}

function unavailable(reason){
  return Object.freeze({status:'UNAVAILABLE',data:null,reason,researchOnly:true,executionWrite:false});
}

async function safeExternalRead(fn,label){
  try{
    const result=await fn();
    if(!object(result)||result.researchOnly!==true||result.executionWrite!==false)return unavailable(label+'_READ_INVALID');
    return result;
  }catch(_error){return unavailable(label+'_READ_FAILED')}
}

function parseTime(value){
  if(finite(value)&&value>=0)return value;
  if(typeof value!=='string'||!value)return null;
  const parsed=Date.parse(value);
  return finite(parsed)&&parsed>=0?parsed:null;
}

function normalizeCalendar(result){
  if(result?.status!=='AVAILABLE'||!object(result.data)||!Array.isArray(result.data.events))return [];
  return result.data.events.map((row,index)=>{
    if(!object(row)||typeof row.title!=='string'||!row.title)return null;
    const asOf=parseTime(row.time);
    if(asOf===null)return null;
    return Object.freeze({
      kind:'CALENDAR',
      id:`calendar:${asOf}:${index}`,
      title:row.title,
      source:typeof row.source==='string'&&row.source?row.source:(result.data.source||'CALENDAR'),
      asOf,
      impact:typeof row.impact==='string'?row.impact:'UNAVAILABLE',
      status:typeof row.status==='string'?row.status:result.data.status,
      description:typeof row.description==='string'?row.description:''
    });
  }).filter(Boolean);
}

function normalizeNews(result,nowMs){
  if(result?.status!=='AVAILABLE'||!object(result.data)||!Array.isArray(result.data.items))return [];
  return result.data.items.map((row,index)=>{
    if(!object(row)||typeof row.title!=='string'||!row.title)return null;
    const asOf=parseTime(row.published_at)??parseTime(result.data.fetched_at);
    if(asOf===null)return null;
    const event={
      kind:'NEWS',
      id:`news:${asOf}:${index}`,
      title:row.title,
      source:typeof row.source==='string'&&row.source?row.source:'NEWS',
      asOf,
      impact:typeof row.impact==='string'?row.impact:'UNAVAILABLE',
      status:typeof row.status==='string'&&row.status?row.status:(typeof result.data.status==='string'&&result.data.status?result.data.status:'SNAPSHOT'),
      summary:typeof row.summary==='string'?row.summary:'',
      tags:Object.freeze(Array.isArray(row.tags)?row.tags.filter(x=>typeof x==='string'):[]),
      assets:Object.freeze(Array.isArray(row.assets)?row.assets.filter(x=>typeof x==='string'):[])
    };
    const intelligence=NewsImpact.evaluateNewsImpact(event,nowMs);
    return Object.freeze({...event,...intelligence});
  }).filter(Boolean);
}

function createLiveResearchBootstrap({fetchImpl=globalThis.fetch,clock=Date.now,lineageStore,publishHome,executionBridge}={}){
  if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
  if(typeof clock!=='function')throw Error('CLOCK_REQUIRED');
  if(!lineageStore||typeof lineageStore!=='object')throw Error('LINEAGE_STORE_REQUIRED');
  if(typeof publishHome!=='function')throw Error('PUBLISH_HOME_REQUIRED');
  const external=validateExecutionBridge(executionBridge);

  const pipeline=createStagingSourcePipeline({
    fetchImpl,
    clock,
    lineageStore,
    providerGovernance:createProviderRuntimeGovernance({clock,policy:{freshnessWarnMs:3600000}}),
    publishHome
  });

  async function runOnce(){
    const nowMs=Number(clock());
    if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');
    const base=buildBootstrapInput(nowMs);
    if(!external)return pipeline.run(base);

    const [runtimeRead,calendarRead,newsRead]=await Promise.all([
      safeExternalRead(()=>external.loadRuntime(),'RUNTIME'),
      safeExternalRead(()=>external.loadCalendar(),'CALENDAR'),
      safeExternalRead(()=>external.loadNews(),'NEWS')
    ]);
    const events=Object.freeze([...normalizeCalendar(calendarRead),...normalizeNews(newsRead,nowMs)]);
    return pipeline.run({...base,crypto:async()=>runtimeRead,events});
  }

  return Object.freeze({runOnce});
}

module.exports=Object.freeze({buildBootstrapInput,createLiveResearchBootstrap,taipeiTradeDate});