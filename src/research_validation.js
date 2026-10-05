import { validMetrics } from './strategy_performance.js';
const keys=['pullback','structured','breakout','meanReversion'];
const compact=m=>Object.fromEntries(['trades','signals','skipped','netPnl','netReturnPct','winRate','profitFactor','avgPnl','closedDrawdownPct'].map(k=>[k,m[k]??null]));
// Optional extension: older results stay readable without invented validation.
export function researchExtension(result){
 if(!result?.validation&&!result?.entryStudy)return null;
 const v=result.validation,s=result.entryStudy;
 if(v?.version!=='temporal-v1'||v.folds?.length!==3||s?.version!=='breakout-retest-v1'||s.start!==result.split||s.end!==result.end||!['immediate','retest','retestStress'].every(k=>validMetrics(s[k])))throw new Error('分期／回踩研究資料不完整');
 let boundary=result.split;
 for(const fold of v.folds){
  if(fold.start!==boundary||!Number.isFinite(fold.end)||fold.end<=fold.start||fold.end>result.end||fold.rows?.length!==4||fold.rows.map(r=>r.key).join(',')!==keys.join(',')||fold.rows.some(r=>!validMetrics(r.metrics)))throw new Error('分期研究區間或指標不一致');
  boundary=fold.end;
 }
 if(boundary!==result.end)throw new Error('分期研究缺少末段');
 return {researchVersion:'analysis-upgrade-v1',validation:{version:v.version,folds:v.folds.map(f=>({start:f.start,end:f.end,rows:f.rows.map(r=>({key:r.key,metrics:compact(r.metrics)}))}))},entryStudy:{version:s.version,start:s.start,end:s.end,immediate:compact(s.immediate),retest:compact(s.retest),retestStress:compact(s.retestStress)}};
}
