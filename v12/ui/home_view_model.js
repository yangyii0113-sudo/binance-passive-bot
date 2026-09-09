(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_HOME_VIEW_MODEL=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REGION_ORDER=Object.freeze(['US','TW','CN_HK','JP','KR','EU','CRYPTO']);
  const MARKET_ORDER=Object.freeze(['CRYPTO','US','TW']);
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const text=x=>typeof x==='string'&&x.length>0;
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const freezeList=rows=>Object.freeze(rows.map(x=>Object.freeze(x)));

  function assertHomeReadModel(value){
    if(!object(value)||value.schemaVersion!=='foxyya-home-read-model/1'||!object(value.home))throw Error('HOME_READ_MODEL_REQUIRED');
    if(value.researchOnly!==true||value.executionWrite!==false)throw Error('HOME_READ_ONLY_REQUIRED');
    if(!finite(value.asOf)||value.asOf<0)throw Error('ASOF_INVALID');
    return value;
  }

  function regionRow(region,source){
    const row=source.find(x=>x&&x.region===region);
    if(!row)return {region,bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf:null};
    return {
      region,
      bias:text(row.bias)?row.bias:'UNAVAILABLE',
      confidence:finite(row.confidence)?row.confidence:0,
      status:text(row.status)?row.status:'UNAVAILABLE',
      asOf:finite(row.asOf)?row.asOf:null
    };
  }

  function pulseRow(market,source){
    const row=source.find(x=>x&&x.market===market);
    if(!row)return {market,status:'UNAVAILABLE',stateLabel:'UNAVAILABLE',asOf:null,data:null};
    const status=text(row.status)?row.status:'UNAVAILABLE';
    return {
      market,
      status,
      stateLabel:status==='UNAVAILABLE'?'UNAVAILABLE':(text(row.state)?row.state:status),
      asOf:finite(row.asOf)?row.asOf:null,
      data:status==='UNAVAILABLE'?null:(object(row.data)?Object.freeze({...row.data}):null)
    };
  }

  function researchStageLabel(stage){
    return text(stage)?stage.replaceAll('_',' '):'UNAVAILABLE';
  }

  function earlyTrendRow(row){
    return {
      market:text(row?.market)?row.market:'UNAVAILABLE',
      instrumentId:text(row?.instrumentId)?row.instrumentId:'UNAVAILABLE',
      stateLabel:researchStageLabel(row?.stage),
      direction:text(row?.direction)?row.direction:'UNAVAILABLE',
      confidence:finite(row?.confidence)?row.confidence:0,
      mode:'RESEARCH',
      sourceLineage:Object.freeze(Array.isArray(row?.sourceLineage)?row.sourceLineage.filter(text):[])
    };
  }

  function cryptoOpportunity(row){
    if(row?.executionReadOnly!==true||row?.executionWrite===true)throw Error('CRYPTO_OPPORTUNITY_READ_ONLY_REQUIRED');
    return {
      market:'CRYPTO',
      symbol:text(row.symbol)?row.symbol:'UNAVAILABLE',
      side:text(row.side)?row.side:'UNAVAILABLE',
      family:text(row.family)?row.family:'UNAVAILABLE',
      status:text(row.status)?row.status:'UNAVAILABLE',
      mode:'PAPER READ-ONLY',
      executionReadOnly:true,
      executionWrite:false
    };
  }

  function equityOpportunity(market,row){
    if(row?.researchOnly!==true||row?.executionWrite!==false)throw Error('EQUITY_OPPORTUNITY_READ_ONLY_REQUIRED');
    return {
      market,
      instrumentId:text(row.instrumentId)?row.instrumentId:'UNAVAILABLE',
      direction:text(row?.research?.direction)?row.research.direction:'UNAVAILABLE',
      earlyStage:researchStageLabel(row?.earlyTrend?.stage),
      mode:'RESEARCH',
      researchOnly:true,
      executionWrite:false,
      sourceLineage:Object.freeze(Array.isArray(row?.sourceLineage)?row.sourceLineage.filter(text):[])
    };
  }

  function eventRow(row){
    return {
      id:text(row?.id)?row.id:'UNAVAILABLE',
      title:text(row?.title)?row.title:'UNAVAILABLE',
      source:text(row?.source)?row.source:'UNAVAILABLE',
      asOf:finite(row?.asOf)?row.asOf:null
    };
  }

  function buildHomeViewModel(input){
    const read=assertHomeReadModel(input);
    const home=read.home;
    const opportunitySource=object(home.opportunities)?home.opportunities:{};
    const regions=freezeList(REGION_ORDER.map(region=>regionRow(region,Array.isArray(home.regions)?home.regions:[])));
    const marketPulse=freezeList(MARKET_ORDER.map(market=>pulseRow(market,Array.isArray(home.marketPulse)?home.marketPulse:[])));
    const earlyTrend=freezeList((Array.isArray(home.earlyTrend)?home.earlyTrend:[]).map(earlyTrendRow));
    const opportunities=Object.freeze({
      CRYPTO:freezeList((Array.isArray(opportunitySource.CRYPTO)?opportunitySource.CRYPTO:[]).map(cryptoOpportunity)),
      US:freezeList((Array.isArray(opportunitySource.US)?opportunitySource.US:[]).map(row=>equityOpportunity('US',row))),
      TW:freezeList((Array.isArray(opportunitySource.TW)?opportunitySource.TW:[]).map(row=>equityOpportunity('TW',row)))
    });
    const events=freezeList((Array.isArray(home.events)?home.events:[]).map(eventRow));

    return Object.freeze({
      schemaVersion:'foxyya-home-view-model/1',
      asOf:read.asOf,
      regions,
      marketPulse,
      earlyTrend,
      opportunities,
      events,
      researchOnly:true,
      executionWrite:false
    });
  }

  return Object.freeze({REGION_ORDER,MARKET_ORDER,buildHomeViewModel});
});
