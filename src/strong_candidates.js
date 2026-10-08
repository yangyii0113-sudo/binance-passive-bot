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

// Reserve up to four early watch slots. A ticker screen is not accumulation evidence.
export function rankResearchRows(rows=[],eligible=null){
 const momentum=rankStrongRows(rows,eligible),seen=new Set();
 const early=rows.flatMap(row=>{
  const symbol=String(row?.[1]||'').replace(/\s|\//g,'');
  const change=Number(row?.[3]),volume=Number(row?.[4]),strength=Number(row?.[5]);
  if(!/^[\p{L}\p{N}]+USDT$/u.test(symbol)||seen.has(symbol)||(eligible&&!eligible.has(symbol))||row?.[3]==null||row?.[4]==null||row?.[5]==null||![change,volume,strength].every(Number.isFinite)||change<=-5||change>0||volume<10000000||strength<0||strength>100)return [];
  seen.add(symbol);return [{symbol,change,volume,strength,watchOnly:true}];
 }).sort((a,b)=>b.volume-a.volume||a.symbol.localeCompare(b.symbol)).slice(0,4);
 const declines=rows.flatMap(row=>{
  const symbol=String(row?.[1]||'').replace(/\s|\//g,'');
  const change=Number(row?.[3]),volume=Number(row?.[4]),strength=Number(row?.[5]);
  if(!/^[\p{L}\p{N}]+USDT$/u.test(symbol)||(eligible&&!eligible.has(symbol))||row?.[3]==null||row?.[4]==null||row?.[5]==null||![change,volume,strength].every(Number.isFinite)||change<=-30||change>-5||volume<10000000||strength<0||strength>100)return [];
  return [{symbol,change,volume,strength,pool:'declining'}];
 }).sort((a,b)=>b.strength-a.strength||b.volume-a.volume||a.symbol.localeCompare(b.symbol));
 const down=[...new Map(declines.map(r=>[r.symbol,r])).values()];
 const reserve=down.slice(0,3);
 const selected=[...new Map([...momentum.slice(0,10-early.length-reserve.length),...reserve,...early].map(r=>[r.symbol,r])).values()];
 for(const row of [...momentum,...down])if(selected.length<10&&!selected.some(r=>r.symbol===row.symbol))selected.push(row);
 return selected.map((row,i)=>({...row,rank:i+1}));
}

// Downside research list: ticker weakness is not an instruction to short.
export function rankWeakRows(rows=[],eligible=null){
 const seen=new Set();return rows.flatMap(row=>{
  const symbol=String(row?.[1]||'').replace(/\s|\//g,''),change=Number(row?.[3]),volume=Number(row?.[4]);
  if(!/^[\p{L}\p{N}]+USDT$/u.test(symbol)||seen.has(symbol)||(eligible&&!eligible.has(symbol))||row?.[3]==null||row?.[4]==null||![change,volume].every(Number.isFinite)||change>=0||change<=-30||volume<10000000)return [];
  seen.add(symbol);return [{symbol,change,volume,pool:'declining'}];
 }).sort((a,b)=>a.change-b.change||b.volume-a.volume||a.symbol.localeCompare(b.symbol)).slice(0,5).map((x,i)=>({...x,rank:i+1}));
}
