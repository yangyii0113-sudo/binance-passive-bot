'use strict';

const Market=require('./market_core.js');

const ACTION_TYPES=Object.freeze([
  'SPLIT',
  'REVERSE_SPLIT',
  'CASH_DIVIDEND',
  'STOCK_DIVIDEND',
  'SYMBOL_CHANGE',
  'DELISTING',
  'RELISTING'
]);
const ACTION_STATUS=Object.freeze(['ANNOUNCED','EFFECTIVE','CANCELLED']);
const PRICE_SERIES_KINDS=Object.freeze(['RAW','ADJUSTED']);

function nonEmpty(value){return typeof value==='string'&&value.trim().length>0;}
function finiteTime(value){return Number.isFinite(value)&&value>=0;}
function positive(value){return Number.isFinite(value)&&value>0;}

function validIsoDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value??'')))return false;
  const [year,month,day]=String(value).split('-').map(Number);
  const parsed=new Date(Date.UTC(year,month-1,day));
  return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&parsed.getUTCDate()===day;
}

function frozenInstrument(instrument){
  const check=Market.validateInstrument(instrument);
  if(!check.ok)throw Error(`INSTRUMENT_INVALID:${check.errors.join(',')}`);
  return Object.freeze({...instrument});
}

function actionDetails(actionType,instrument,details){
  const d=details&&typeof details==='object'&&!Array.isArray(details)?details:{};
  if(actionType==='SPLIT'||actionType==='REVERSE_SPLIT'){
    if(!positive(d.newShares)||!positive(d.oldShares))throw Error('ACTION_DETAILS_INVALID');
    return Object.freeze({newShares:d.newShares,oldShares:d.oldShares,ratio:d.newShares/d.oldShares});
  }
  if(actionType==='CASH_DIVIDEND'){
    if(!positive(d.amountPerShare)||!nonEmpty(d.currency))throw Error('ACTION_DETAILS_INVALID');
    return Object.freeze({amountPerShare:d.amountPerShare,currency:d.currency.trim().toUpperCase()});
  }
  if(actionType==='STOCK_DIVIDEND'){
    if(!positive(d.sharesPerShare))throw Error('ACTION_DETAILS_INVALID');
    return Object.freeze({sharesPerShare:d.sharesPerShare});
  }
  if(actionType==='SYMBOL_CHANGE'){
    const from=String(d.fromSymbol??'').trim().toUpperCase();
    const to=String(d.toSymbol??'').trim().toUpperCase();
    if(!from||from!==instrument.symbol||!to||to===from||!nonEmpty(d.successorInstrumentId))throw Error('ACTION_DETAILS_INVALID');
    return Object.freeze({fromSymbol:from,toSymbol:to,successorInstrumentId:d.successorInstrumentId.trim()});
  }
  if(actionType==='DELISTING'){
    if(!nonEmpty(d.venue))throw Error('ACTION_DETAILS_INVALID');
    const value={venue:d.venue.trim().toUpperCase()};
    if(nonEmpty(d.reason))value.reason=d.reason.trim();
    return Object.freeze(value);
  }
  if(actionType==='RELISTING'){
    if(!nonEmpty(d.venue))throw Error('ACTION_DETAILS_INVALID');
    return Object.freeze({venue:d.venue.trim().toUpperCase()});
  }
  throw Error('ACTION_TYPE_INVALID');
}

function makeCorporateAction(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('ACTION_REQUIRED');
  if(!ACTION_TYPES.includes(input.actionType))throw Error('ACTION_TYPE_INVALID');
  if(!ACTION_STATUS.includes(input.status))throw Error('ACTION_STATUS_INVALID');
  if(!nonEmpty(input.eventId))throw Error('EVENT_ID_REQUIRED');
  if(!nonEmpty(input.source))throw Error('SOURCE_REQUIRED');
  if(!nonEmpty(input.sourceEventId))throw Error('SOURCE_EVENT_ID_REQUIRED');
  if(!finiteTime(input.announcedAt)||!finiteTime(input.receivedAt)||input.receivedAt<input.announcedAt)throw Error('TIME_ORDER_INVALID');
  if(!validIsoDate(input.effectiveDate))throw Error('EFFECTIVE_DATE_INVALID');

  const instrument=frozenInstrument(input.instrument);
  const details=actionDetails(input.actionType,instrument,input.details);
  return Object.freeze({
    eventId:input.eventId.trim(),
    instrument,
    actionType:input.actionType,
    status:input.status,
    announcedAt:input.announcedAt,
    receivedAt:input.receivedAt,
    effectiveDate:input.effectiveDate,
    source:input.source.trim(),
    sourceEventId:input.sourceEventId.trim(),
    details
  });
}

function makePriceSeriesDescriptor(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('PRICE_SERIES_REQUIRED');
  const instrument=frozenInstrument(input.instrument);
  if(!nonEmpty(input.field))throw Error('FIELD_REQUIRED');
  if(!PRICE_SERIES_KINDS.includes(input.seriesKind))throw Error('SERIES_KIND_INVALID');
  if(!nonEmpty(input.source))throw Error('SOURCE_REQUIRED');
  if(!finiteTime(input.asOf))throw Error('AS_OF_INVALID');

  if(input.seriesKind==='RAW'){
    if(input.adjustment!==undefined&&input.adjustment!==null)throw Error('RAW_SERIES_ADJUSTMENT_FORBIDDEN');
    return Object.freeze({
      instrument,
      field:input.field.trim(),
      seriesKind:'RAW',
      source:input.source.trim(),
      asOf:input.asOf,
      adjustment:null,
      retroactiveAdjustmentRisk:false
    });
  }

  if(!nonEmpty(input.rawField))throw Error('RAW_FIELD_REQUIRED');
  const field=input.field.trim();
  const rawField=input.rawField.trim();
  if(field===rawField)throw Error('ADJUSTED_FIELD_COLLISION');
  const adjustment=input.adjustment;
  if(!adjustment||typeof adjustment!=='object'||Array.isArray(adjustment)||!nonEmpty(adjustment.method))throw Error('ADJUSTMENT_METHOD_REQUIRED');
  if(!nonEmpty(adjustment.version))throw Error('ADJUSTMENT_VERSION_REQUIRED');
  if(!Array.isArray(adjustment.corporateActionEventIds)||adjustment.corporateActionEventIds.length===0||adjustment.corporateActionEventIds.some(id=>!nonEmpty(id)))throw Error('ACTION_LINEAGE_REQUIRED');
  if(typeof adjustment.pointInTimeSafe!=='boolean'||typeof adjustment.retroactiveAdjustmentRisk!=='boolean')throw Error('ADJUSTMENT_SAFETY_REQUIRED');
  if(adjustment.pointInTimeSafe&&adjustment.retroactiveAdjustmentRisk)throw Error('ADJUSTMENT_SAFETY_CONFLICT');

  const eventIds=Object.freeze(adjustment.corporateActionEventIds.map(id=>id.trim()));
  const normalizedAdjustment=Object.freeze({
    method:adjustment.method.trim(),
    version:adjustment.version.trim(),
    corporateActionEventIds:eventIds,
    pointInTimeSafe:adjustment.pointInTimeSafe,
    retroactiveAdjustmentRisk:adjustment.retroactiveAdjustmentRisk
  });
  return Object.freeze({
    instrument,
    field,
    rawField,
    seriesKind:'ADJUSTED',
    source:input.source.trim(),
    asOf:input.asOf,
    adjustment:normalizedAdjustment,
    retroactiveAdjustmentRisk:normalizedAdjustment.retroactiveAdjustmentRisk
  });
}

function selectPriceSeries(seriesByKind,seriesKind){
  if(!PRICE_SERIES_KINDS.includes(seriesKind))throw Error('SERIES_KIND_INVALID');
  const series=seriesByKind&&typeof seriesByKind==='object'?seriesByKind[seriesKind]:null;
  if(series!==null&&series!==undefined)return {status:'AVAILABLE',series,seriesKind};
  return {status:'UNAVAILABLE',series:null,seriesKind,reason:`${seriesKind}_SERIES_UNAVAILABLE`};
}

module.exports=Object.freeze({
  ACTION_TYPES,
  ACTION_STATUS,
  PRICE_SERIES_KINDS,
  makeCorporateAction,
  makePriceSeriesDescriptor,
  selectPriceSeries
});
