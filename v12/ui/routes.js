(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_UI_ROUTES=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PRIMARY_ROUTES=Object.freeze([
    Object.freeze({id:'HOME',label:'首頁',hash:'#home'}),
    Object.freeze({id:'MARKETS',label:'市場',hash:'#markets'}),
    Object.freeze({id:'RESEARCH',label:'研究',hash:'#research'}),
    Object.freeze({id:'POSITIONS',label:'持倉',hash:'#positions'}),
    Object.freeze({id:'RESULTS',label:'交易結果',hash:'#results'}),
    Object.freeze({id:'LAB',label:'Lab',hash:'#lab'})
  ]);
  const AUX_ROUTES=Object.freeze([
    Object.freeze({id:'INTELLIGENCE',label:'情報中心',hash:'#intelligence'}),
    Object.freeze({id:'CALENDAR',label:'經濟日曆',hash:'#calendar'}),
    Object.freeze({id:'NOTIFICATIONS',label:'通知',hash:'#notifications'}),
    Object.freeze({id:'SYSTEM',label:'系統',hash:'#system'}),
    Object.freeze({id:'SETTINGS',label:'設定',hash:'#settings'})
  ]);
  const ACTION_CLASSES=Object.freeze(['PRIMARY','SECONDARY','FILTER','UTILITY']);
  const HOME_ACTIONS=Object.freeze({
    GLOBAL_STATUS:Object.freeze({primary:Object.freeze(['VIEW_MARKET']),secondary:Object.freeze([])}),
    TODAY_FOCUS:Object.freeze({primary:Object.freeze(['VIEW_INTELLIGENCE']),secondary:Object.freeze([])}),
    EARLY_TREND:Object.freeze({primary:Object.freeze(['VIEW_RESEARCH']),secondary:Object.freeze(['VIEW_EVIDENCE'])}),
    MARKET_PULSE:Object.freeze({primary:Object.freeze(['VIEW_MARKET']),secondary:Object.freeze([])}),
    OPPORTUNITIES:Object.freeze({primary:Object.freeze(['VIEW_RESEARCH']),secondary:Object.freeze(['VIEW_ASSET'])}),
    RISK_EVENTS:Object.freeze({primary:Object.freeze(['VIEW_INTELLIGENCE']),secondary:Object.freeze(['OPEN_CALENDAR'])})
  });
  return Object.freeze({PRIMARY_ROUTES,AUX_ROUTES,ACTION_CLASSES,HOME_ACTIONS});
});