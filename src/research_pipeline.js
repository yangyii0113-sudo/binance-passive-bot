export function validationSpecForMatch(strategyMatch){
  const match = String(strategyMatch || '');

  if(match === 'NO TRADE'){
    return { supported:false, strategyMatch:match, reason:'Risk / market gate 不允許進入策略驗證' };
  }

  if(match.includes('Range')){
    return {
      supported:false,
      strategyMatch:match,
      reason:'Mean Reversion baseline 尚未實作；不以 EMA Trend 偽裝 Range 策略'
    };
  }

  if(match.includes('Momentum') || match.includes('Breakout')){
    return {
      supported:true,
      strategyMatch:match,
      strategy:'B',
      strategyLabel:'EMA10/30 Momentum Baseline',
      timeframe:'1h',
      range:'1Y',
      purpose:'固定 Momentum baseline；不是針對單一標的調參'
    };
  }

  return {
    supported:true,
    strategyMatch:match || 'Trend',
    strategy:'A',
    strategyLabel:'EMA20/50 Trend Baseline',
    timeframe:'4h',
    range:'2Y',
    purpose:'固定 Trend baseline；不是針對單一標的調參'
  };
}

export function researchDecision({technical, guard, risk, spec} = {}){
  if(String(risk?.status || '').toUpperCase() === 'BLOCKED') return { label:'BLOCKED', tone:'blocked' };
  if(!spec?.supported) return { label:'RESEARCH', tone:'pending' };
  if(guard?.label === 'PASS' && technical?.status === 'LIVE') return { label:'VALIDATED', tone:'pass' };
  if(guard?.label === 'REVIEW') return { label:'REVIEW', tone:'review' };
  if(guard?.label === '樣本不足') return { label:'INSUFFICIENT', tone:'caution' };
  return { label:'CAUTION', tone:'caution' };
}
