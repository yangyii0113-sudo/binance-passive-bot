// Research assumptions, not the user's actual fee tier. Funding remains separate.
export const EXIT_COSTS = Object.freeze({fee:0.0005,slippage:0.0002});
export function refineTargets(plan, hourly, atr, costs=EXIT_COSTS) {
  const {entry,stop,side}=plan, sign=side==='LONG'?1:side==='SHORT'?-1:0;
  if(!sign||![entry,stop,atr,costs.fee,costs.slippage].every(v=>typeof v==='number'&&Number.isFinite(v))||entry<=0||stop<=0||atr<=0||costs.fee<0||costs.slippage<0||sign*(entry-stop)<=0) throw new Error('止盈分析輸入無效');
  const risk=Math.abs(entry-stop), levels=[];
  // Only pivots with two CLOSED bars on both sides; use at most 120 closed hours.
  const bars=hourly.slice(-120);
  for(let i=2;i<bars.length-2;i++) {
    const level=Number(bars[i][sign===1?2:3]);
    if(!Number.isFinite(level))throw new Error('結構價格無效');
    const neighbours=[i-2,i-1,i+1,i+2];
    if(sign*(level-entry)>0 && neighbours.every(j=>sign*(level-Number(bars[j][sign===1?2:3]))>0))levels.push(level);
  }
  levels.sort((a,b)=>sign*(a-b));
  const structure=levels[0]??null;
  const room=structure===null?Infinity:sign*(structure-entry)-.1*atr;
  const tp1=entry+sign*Math.min(risk,room),tp2=entry+sign*Math.min(2*risk,room);
  const cost=costs.fee+costs.slippage;
  const loss=risk+cost*(entry+stop);
  const netReward=sign*((tp1+tp2)/2-entry)-cost*(entry+(tp1+tp2)/2);
  const netRewardRisk=netReward/loss;
  const accepted=room>=risk&&netRewardRisk>=1&&tp1>0&&tp2>0;
  return {...plan,tp1,tp2,targetAnalysis:{version:'TP01-S1',accepted,structure,atr,netRewardRisk,netReward,risk:loss,fee:costs.fee,slippage:costs.slippage,
    tp1R:sign*(tp1-entry)/risk,tp2R:sign*(tp2-entry)/risk,
    reason:room<risk?'最近支撐／壓力不足 1R 空間，略過':netRewardRisk<1?'扣除假設成本後，分批淨風報比低於 1，略過':'結構空間與假設成本檢查通過；仍待績效驗證',
    basis:structure===null?'近 120 根無已確認阻擋結構，採 1R／2R 上限':'已確認前高／前低，提前 0.1 ATR 出場'}};
}
