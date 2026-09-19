const MAX_PORTFOLIO_RISK_PCT = 1.5;
const CAUTION_RISK_PCT = 1.2;

function directionFromCandidate(candidate){
  const d = String(candidate?.signal?.direction || candidate?.signal?.side || '').toUpperCase();
  if(d.includes('SHORT') || d.includes('空')) return 'SHORT';
  if(d.includes('LONG') || d.includes('多')) return 'LONG';
  return 'UNKNOWN';
}
export function evaluatePortfolioRisk(candidate, paper){
  const summary = paper?.summary || {};
  const positions = Array.isArray(paper?.positions) ? paper.positions : [];
  const riskPct = Number(summary.portfolioRiskPct) || 0;
  const direction = directionFromCandidate(candidate);
  const sameSymbol = positions.filter(p=>String(p.symbol||'').toUpperCase()===String(candidate?.symbol||'').toUpperCase());
  const sameDirection = direction === 'UNKNOWN'
    ? []
    : positions.filter(p=>String(p.side||'').toUpperCase()===direction);
  const reasons = [];
  let status = 'PASS';

  if(riskPct >= MAX_PORTFOLIO_RISK_PCT - 1e-9){
    status = 'BLOCKED';
    reasons.push(`Portfolio Risk 已達 ${riskPct.toFixed(2)}%，觸及 ${MAX_PORTFOLIO_RISK_PCT}% 上限。`);
  }
  if(sameSymbol.length){
    if(status !== 'BLOCKED') status = 'CAUTION';
    reasons.push('此標的已有模擬持倉，避免重複曝險。');
  }
  if(sameDirection.length >= 3){
    if(status !== 'BLOCKED') status = 'CAUTION';
    reasons.push(`同方向已有 ${sameDirection.length} 個持倉，需留意 Crypto Beta 集中。`);
  }
  if(riskPct >= CAUTION_RISK_PCT && status === 'PASS'){
    status = 'CAUTION';
    reasons.push(`Portfolio Risk 已達 ${riskPct.toFixed(2)}%，接近 ${MAX_PORTFOLIO_RISK_PCT}% 上限。`);
  }
  if(!reasons.length) reasons.push('目前 Paper 組合未觸發基本風險閘門。');

  return {
    status,
    checkedAt:new Date().toISOString(),
    portfolioRiskPct:riskPct,
    maxPortfolioRiskPct:MAX_PORTFOLIO_RISK_PCT,
    openPositions:Number(summary.openPositions)||positions.length,
    sameDirectionCount:sameDirection.length,
    sameSymbolCount:sameSymbol.length,
    reasons
  };
}
export { MAX_PORTFOLIO_RISK_PCT };
