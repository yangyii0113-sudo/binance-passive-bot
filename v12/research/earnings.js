(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_EARNINGS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  function change(current,prior,label){
    if(!finite(current)||!finite(prior))throw Error(label+'_INPUT_INVALID');
    const delta=current-prior;
    const pct=prior===0?null:delta/Math.abs(prior);
    return Object.freeze({current,prior,delta,pct,direction:delta>0?'POSITIVE':delta<0?'NEGATIVE':'NEUTRAL'});
  }
  function surprise(actual,consensus){
    const x=change(actual,consensus,'SURPRISE');
    return Object.freeze({actual,consensus,delta:x.delta,pct:x.pct,direction:x.direction});
  }
  function revision(current,prior){return change(current,prior,'REVISION');}
  return Object.freeze({surprise,revision});
});