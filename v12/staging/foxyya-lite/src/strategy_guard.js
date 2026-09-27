export function evaluateStrategyGuard(result){
  if(!result) return { label:'待驗證', tone:'pending', reason:'尚未執行歷史回測' };

  const trades = Number(result.trades) || 0;
  const pf = Number(result.profitFactor);
  const avgTrade = Number(result.avgTradePct);
  const netReturn = Number(result.netReturnPct);
  const maxDd = Number(result.maxDrawdownPct);
  const validationLevel = String(result.validation?.level || '');

  if(trades < 20 || validationLevel.startsWith('INSUFFICIENT')){
    return { label:'樣本不足', tone:'caution', reason:'交易樣本不足以升格策略' };
  }

  if(
    !Number.isFinite(pf) ||
    !Number.isFinite(avgTrade) ||
    !Number.isFinite(netReturn) ||
    !Number.isFinite(maxDd) ||
    pf < 1 ||
    avgTrade <= 0 ||
    netReturn <= 0
  ){
    return { label:'REVIEW', tone:'review', reason:'歷史 Edge 尚未通過正期望條件' };
  }

  const enoughEvidence = validationLevel === 'INITIAL' || validationLevel === 'REFERENCE';
  if(enoughEvidence && pf >= 1.2 && maxDd <= 35){
    return { label:'PASS', tone:'pass', reason:'樣本、PF、平均交易與回撤通過 Strategy Guard' };
  }

  return { label:'CAUTION', tone:'caution', reason:'有正向 Edge，但樣本或回撤尚未達 PASS 門檻' };
}
