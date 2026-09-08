(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_MARKET_CORE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PRIMARY_MARKETS=Object.freeze(['CRYPTO','US','TW']);
  const REGION_IDS=Object.freeze(['US','TW','CN_HK','JP','KR','EU','CRYPTO']);
  const EXCHANGES=Object.freeze({
    BINANCE:Object.freeze({market:'CRYPTO',region:'CRYPTO',currency:'USDT',timezone:'UTC'}),
    NASDAQ:Object.freeze({market:'US',region:'US',currency:'USD',timezone:'America/New_York'}),
    NYSE:Object.freeze({market:'US',region:'US',currency:'USD',timezone:'America/New_York'}),
    TWSE:Object.freeze({market:'TW',region:'TW',currency:'TWD',timezone:'Asia/Taipei'}),
    TPEX:Object.freeze({market:'TW',region:'TW',currency:'TWD',timezone:'Asia/Taipei'}),
    KRX:Object.freeze({market:'KR',region:'KR',currency:'KRW',timezone:'Asia/Seoul'}),
    TSE:Object.freeze({market:'JP',region:'JP',currency:'JPY',timezone:'Asia/Tokyo'}),
    HKEX:Object.freeze({market:'CN_HK',region:'CN_HK',currency:'HKD',timezone:'Asia/Hong_Kong'}),
    XETRA:Object.freeze({market:'EU',region:'EU',currency:'EUR',timezone:'Europe/Berlin'})
  });
  const ASSET_TYPES=Object.freeze(['CRYPTO','EQUITY','ETF','INDEX','FX','FUTURE']);
  const token=(v,re)=>typeof v==='string'&&re.test(v);
  const result=errors=>({ok:errors.length===0,errors});

  function instrumentId(exchange,symbol){
    const ex=String(exchange||'').toUpperCase();
    const sym=String(symbol||'').toUpperCase();
    if(!Object.hasOwn(EXCHANGES,ex))throw Error('EXCHANGE_UNKNOWN');
    if(!token(sym,/^[A-Z0-9._-]{1,40}$/))throw Error('SYMBOL_INVALID');
    return `${ex}:${sym}`;
  }

  function validateInstrument(value){
    const errors=[];
    if(!value||typeof value!=='object'||Array.isArray(value))return result(['OBJECT_REQUIRED']);
    const ex=EXCHANGES[value.exchange];
    if(!ex){errors.push('EXCHANGE_UNKNOWN');return result(errors)}
    if(!token(value.symbol,/^[A-Z0-9._-]{1,40}$/))errors.push('SYMBOL_INVALID');
    else if(value.instrumentId!==`${value.exchange}:${value.symbol}`)errors.push('INSTRUMENT_ID_MISMATCH');
    if(value.market!==ex.market)errors.push('MARKET_MISMATCH');
    if(value.region!==ex.region)errors.push('REGION_MISMATCH');
    if(value.currency!==ex.currency)errors.push('CURRENCY_MISMATCH');
    if(value.timezone!==ex.timezone)errors.push('TIMEZONE_MISMATCH');
    if(!ASSET_TYPES.includes(value.assetType))errors.push('ASSET_TYPE_INVALID');
    return result(errors);
  }

  return Object.freeze({PRIMARY_MARKETS,REGION_IDS,EXCHANGES,ASSET_TYPES,instrumentId,validateInstrument});
});