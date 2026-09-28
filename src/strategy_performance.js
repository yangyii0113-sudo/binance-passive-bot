const KEYS=['pullback','structured','breakout','meanReversion'];
const finite=Number.isFinite;
const close=(a,b)=>Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(a),Math.abs(b));

export function familyAssessment(row){
 if(!row?.holdout||!row?.stress||!Number.isInteger(row.holdout.trades)||row.holdout.trades<0||![row.holdout.netPnl,row.stress.netPnl].every(finite))return '資料不足';
 if(row.holdout.trades<20)return '樣本不足';
 if(row.holdout.netPnl<=0)return '後段未盈利';
 if(row.stress.netPnl<=0)return '成本壓力未通過';
 return '待跨期及前向驗證';
}
function validMetrics(m){
 if(!m||!Number.isSafeInteger(m.trades)||m.trades<0||![m.netPnl,m.netReturnPct,m.closedDrawdownPct].every(finite)||m.closedDrawdownPct<0)return false;
 if(!close(m.netReturnPct,m.netPnl/1000*100))return false;
 if(m.trades===0)return m.netPnl===0&&m.netReturnPct===0&&m.avgPnl===null&&m.winRate===null&&m.profitFactor===null&&m.closedDrawdownPct===0;
 return finite(m.avgPnl)&&close(m.avgPnl,m.netPnl/m.trades)&&finite(m.winRate)&&m.winRate>=0&&m.winRate<=100&&
   (m.profitFactor===null||(finite(m.profitFactor)&&m.profitFactor>=0));
}
// Shared presentation validation. Historical evidence never authorizes entry.
export function comparisonEvidence(comparison,symbol,now=Date.now()){
 const missing=reason=>({valid:false,reason,rows:[]});
 if(!comparison)return missing('尚無同幣種、同策略的獲利證據；先比較近 90 天。');
 if(comparison.status==='LOADING')return missing('正在讀取完整歷史並計算成本後績效，完成前不顯示推估結果。');
 if(comparison.status==='ERROR')return missing(comparison.error||'比較未完成，請稍後重試');
 const r=comparison.result,updated=Date.parse(comparison.updatedAt);
 if(comparison.status!=='LIVE'||r?.symbol!==symbol)return missing('沒有符合這檔幣種的比較結果，請重新比較。');
 if(r.version!=='TP01-S1'||r.families?.version!=='families-v1'||!Array.isArray(r.families.rows)||
   r.families.rows.length!==4||KEYS.some(key=>r.families.rows.filter(row=>row?.key===key).length!==1)||
   ![r.start,r.split,r.end,updated,now].every(finite)||!(r.start<r.split&&r.split<r.end&&r.end<=updated&&updated<=now)||
   r.families.rows.some(row=>!['development','holdout','stress'].every(section=>validMetrics(row[section]))))
   return missing('比較區間、樣本或損益數據不一致；停止顯示績效，請重新比較。');
 return {valid:true,reason:'歷史研究，尚未證明目前訊號可獲利',rows:r.families.rows.filter(row=>row.key!=='pullback'),result:r,updatedAt:updated,historical:!!comparison.historical};
}
