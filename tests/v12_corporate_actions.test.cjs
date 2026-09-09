const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../v12/core/corporate_actions.js');
const Core=require('../v12/core/index.js');

const instrument=Object.freeze({
  instrumentId:'TWSE:2330',exchange:'TWSE',symbol:'2330',market:'TW',region:'TW',currency:'TWD',timezone:'Asia/Taipei',assetType:'EQUITY'
});

function base(type,details={}){
  return {
    eventId:`TWSE:2330:${type}:2026-07-15`,
    instrument,
    actionType:type,
    status:'ANNOUNCED',
    announcedAt:Date.parse('2026-06-20T08:00:00Z'),
    receivedAt:Date.parse('2026-06-20T08:00:01Z'),
    effectiveDate:'2026-07-15',
    source:'TWSE:CORPORATE_ACTIONS',
    sourceEventId:'ca-2330-20260715',
    details
  };
}

test('corporate action vocabulary is explicit and stable',()=>{
  assert.deepEqual(C.ACTION_TYPES,['SPLIT','REVERSE_SPLIT','CASH_DIVIDEND','STOCK_DIVIDEND','SYMBOL_CHANGE','DELISTING','RELISTING']);
  assert.deepEqual(C.ACTION_STATUS,['ANNOUNCED','EFFECTIVE','CANCELLED']);
  assert.deepEqual(C.PRICE_SERIES_KINDS,['RAW','ADJUSTED']);
});

test('split and reverse split preserve explicit ratios and never infer action type from sign',()=>{
  const split=C.makeCorporateAction(base('SPLIT',{newShares:2,oldShares:1}));
  const reverse=C.makeCorporateAction(base('REVERSE_SPLIT',{newShares:1,oldShares:10}));
  assert.equal(split.details.ratio,2);
  assert.equal(reverse.details.ratio,0.1);
  assert.equal(split.actionType,'SPLIT');
  assert.equal(reverse.actionType,'REVERSE_SPLIT');
  assert.equal(Object.isFrozen(split),true);
  assert.throws(()=>C.makeCorporateAction(base('SPLIT',{newShares:0,oldShares:1})),/ACTION_DETAILS_INVALID/);
});

test('cash and stock dividends require explicit economic metadata',()=>{
  const cash=C.makeCorporateAction(base('CASH_DIVIDEND',{amountPerShare:5,currency:'TWD'}));
  const stock=C.makeCorporateAction(base('STOCK_DIVIDEND',{sharesPerShare:0.1}));
  assert.deepEqual(cash.details,{amountPerShare:5,currency:'TWD'});
  assert.deepEqual(stock.details,{sharesPerShare:0.1});
  assert.throws(()=>C.makeCorporateAction(base('CASH_DIVIDEND',{amountPerShare:5})),/ACTION_DETAILS_INVALID/);
  assert.throws(()=>C.makeCorporateAction(base('STOCK_DIVIDEND',{sharesPerShare:0})),/ACTION_DETAILS_INVALID/);
});

test('symbol change links successor identity without mutating the historical instrument',()=>{
  const event=C.makeCorporateAction(base('SYMBOL_CHANGE',{fromSymbol:'2330',toSymbol:'2330A',successorInstrumentId:'TWSE:2330A'}));
  assert.equal(event.instrument.instrumentId,'TWSE:2330');
  assert.equal(event.instrument.symbol,'2330');
  assert.equal(event.details.successorInstrumentId,'TWSE:2330A');
  assert.throws(()=>C.makeCorporateAction(base('SYMBOL_CHANGE',{fromSymbol:'9999',toSymbol:'2330A',successorInstrumentId:'TWSE:2330A'})),/ACTION_DETAILS_INVALID/);
});

test('delisting and relisting remain explicit lifecycle actions',()=>{
  const delist=C.makeCorporateAction(base('DELISTING',{venue:'TWSE',reason:'MERGER'}));
  const relist=C.makeCorporateAction({...base('RELISTING',{venue:'TWSE'}),eventId:'TWSE:2330:RELISTING:2026-08-01',effectiveDate:'2026-08-01'});
  assert.equal(delist.actionType,'DELISTING');
  assert.equal(relist.actionType,'RELISTING');
  assert.equal(delist.details.venue,'TWSE');
});

test('corporate action rejects missing provenance and future knowledge ordering',()=>{
  assert.throws(()=>C.makeCorporateAction({...base('SPLIT',{newShares:2,oldShares:1}),source:''}),/SOURCE_REQUIRED/);
  assert.throws(()=>C.makeCorporateAction({...base('SPLIT',{newShares:2,oldShares:1}),sourceEventId:''}),/SOURCE_EVENT_ID_REQUIRED/);
  assert.throws(()=>C.makeCorporateAction({...base('SPLIT',{newShares:2,oldShares:1}),receivedAt:Date.parse('2026-06-20T07:59:59Z')}),/TIME_ORDER_INVALID/);
  assert.throws(()=>C.makeCorporateAction({...base('SPLIT',{newShares:2,oldShares:1}),effectiveDate:'2026-02-30'}),/EFFECTIVE_DATE_INVALID/);
});

test('raw price series descriptor cannot carry adjustment metadata',()=>{
  const raw=C.makePriceSeriesDescriptor({
    instrument,field:'price.close',seriesKind:'RAW',source:'TWSE:STOCK_DAY_ALL',asOf:Date.parse('2026-09-09T06:00:00Z')
  });
  assert.equal(raw.seriesKind,'RAW');
  assert.equal(raw.adjustment,null);
  assert.equal(raw.field,'price.close');
  assert.equal(raw.retroactiveAdjustmentRisk,false);
  assert.throws(()=>C.makePriceSeriesDescriptor({
    instrument,field:'price.close',seriesKind:'RAW',source:'TWSE:STOCK_DAY_ALL',asOf:1,
    adjustment:{method:'PROVIDER_ADJUSTED'}
  }),/RAW_SERIES_ADJUSTMENT_FORBIDDEN/);
});

test('adjusted price series requires an explicitly different field plus method version and action lineage',()=>{
  const adjusted=C.makePriceSeriesDescriptor({
    instrument,
    field:'price.adjusted_close',
    rawField:'price.close',
    seriesKind:'ADJUSTED',
    source:'JPX:JQUANTS_V2:EQUITIES_BARS_DAILY',
    asOf:Date.parse('2026-09-09T06:00:00Z'),
    adjustment:{
      method:'PROVIDER_ADJUSTED',version:'jquants-v2',
      corporateActionEventIds:['TSE:7203:SPLIT:2026-01-01'],
      pointInTimeSafe:false,retroactiveAdjustmentRisk:true
    }
  });
  assert.equal(adjusted.seriesKind,'ADJUSTED');
  assert.equal(adjusted.rawField,'price.close');
  assert.equal(adjusted.adjustment.method,'PROVIDER_ADJUSTED');
  assert.equal(adjusted.retroactiveAdjustmentRisk,true);
  assert.equal(Object.isFrozen(adjusted.adjustment.corporateActionEventIds),true);

  assert.throws(()=>C.makePriceSeriesDescriptor({instrument,field:'price.close',rawField:'price.close',seriesKind:'ADJUSTED',source:'X',asOf:1,adjustment:{method:'PROVIDER_ADJUSTED',version:'1',corporateActionEventIds:['x'],pointInTimeSafe:false,retroactiveAdjustmentRisk:true}}),/ADJUSTED_FIELD_COLLISION/);
  assert.throws(()=>C.makePriceSeriesDescriptor({instrument,field:'price.adjusted_close',rawField:'price.close',seriesKind:'ADJUSTED',source:'X',asOf:1,adjustment:{method:'PROVIDER_ADJUSTED',corporateActionEventIds:['x'],pointInTimeSafe:false,retroactiveAdjustmentRisk:true}}),/ADJUSTMENT_VERSION_REQUIRED/);
  assert.throws(()=>C.makePriceSeriesDescriptor({instrument,field:'price.adjusted_close',rawField:'price.close',seriesKind:'ADJUSTED',source:'X',asOf:1,adjustment:{method:'PROVIDER_ADJUSTED',version:'1',corporateActionEventIds:[],pointInTimeSafe:false,retroactiveAdjustmentRisk:true}}),/ACTION_LINEAGE_REQUIRED/);
});

test('adjusted series cannot claim point-in-time safety while declaring retroactive adjustment risk',()=>{
  assert.throws(()=>C.makePriceSeriesDescriptor({
    instrument,field:'price.adjusted_close',rawField:'price.close',seriesKind:'ADJUSTED',source:'X',asOf:1,
    adjustment:{method:'PROVIDER_ADJUSTED',version:'1',corporateActionEventIds:['x'],pointInTimeSafe:true,retroactiveAdjustmentRisk:true}
  }),/ADJUSTMENT_SAFETY_CONFLICT/);
});

test('price series selection is explicit and never falls back from raw to adjusted',()=>{
  const raw={id:'raw'};
  const adjusted={id:'adjusted'};
  assert.deepEqual(C.selectPriceSeries({RAW:raw,ADJUSTED:adjusted},'RAW'),{status:'AVAILABLE',series:raw,seriesKind:'RAW'});
  assert.deepEqual(C.selectPriceSeries({RAW:null,ADJUSTED:adjusted},'RAW'),{status:'UNAVAILABLE',series:null,seriesKind:'RAW',reason:'RAW_SERIES_UNAVAILABLE'});
  assert.deepEqual(C.selectPriceSeries({RAW:raw,ADJUSTED:null},'ADJUSTED'),{status:'UNAVAILABLE',series:null,seriesKind:'ADJUSTED',reason:'ADJUSTED_SERIES_UNAVAILABLE'});
  assert.throws(()=>C.selectPriceSeries({RAW:raw,ADJUSTED:adjusted},'AUTO'),/SERIES_KIND_INVALID/);
});

test('Market Core stable export includes corporate action contract without execution surface',()=>{
  assert.equal(Core.CorporateActions,C);
  assert.doesNotMatch(JSON.stringify(Object.keys(C)).toLowerCase(),/order|execute|fill|position|trade/);
});
