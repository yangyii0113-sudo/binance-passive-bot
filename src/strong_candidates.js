// Shared research selection only. Strength scores do not estimate win rates.
export function rankStrongRows(rows=[],eligible=null) {
  const seen=new Set();
  return rows.flatMap(row=>{
    const symbol=String(row?.[1]||'').replace(/\s|\//g,'');
    const change=Number(row?.[3]),volume=Number(row?.[4]),strength=Number(row?.[5]);
    if(!/^[\p{L}\p{N}]+USDT$/u.test(symbol)||seen.has(symbol)||(eligible&&!eligible.has(symbol))||row?.[5]==null||
      ![change,volume,strength].every(Number.isFinite)||change<=0||change>=30||volume<10000000||strength<0||strength>100)return [];
    seen.add(symbol);return [{symbol,change,volume,strength}];
  }).sort((a,b)=>b.strength-a.strength||b.volume-a.volume||a.symbol.localeCompare(b.symbol)).slice(0,10).map((x,i)=>({...x,rank:i+1}));
}
