// Research-only confirmation; no entry/exit generation and no change to execution gates.
export const TECH_VERSION='technical-confirmation-v1';
export const TECH_WINDOW=200;
export const TECH_VARIANTS=Object.freeze({fibonacci:'斐波那契回撤確認',keltner:'Keltner 通道確認',vegas:'Vegas 通道確認'});
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const ema=(a,n)=>{if(a.length<n)return null;let v=mean(a.slice(0,n));for(const x of a.slice(n))v+=(x-v)*2/(n+1);return v;};
export function technicalConfirmation(input,side){
 const rows=input.slice(-TECH_WINDOW);
 if(rows.length<60||rows.some((r,i)=>!Array.isArray(r)||[0,1,2,3,4,5,6].some(k=>r[k]===null||r[k]===''||!Number.isFinite(+r[k]))||+r[3]<=0||+r[2]<Math.max(+r[1],+r[4])||+r[3]>Math.min(+r[1],+r[4])||+r[5]<0||(i&&+r[0]!==+rows[i-1][6]+1)))return null;
 const closes=rows.map(r=>+r[4]),last=rows.at(-1),previous=rows.at(-2),price=closes.at(-1),e20=ema(closes,20);
 const tr=rows.slice(1).map((r,i)=>Math.max(r[2]-r[3],Math.abs(r[2]-rows[i][4]),Math.abs(r[3]-rows[i][4]))),atr=mean(tr.slice(-14));
 let gain=mean(closes.slice(1,15).map((x,i)=>Math.max(0,x-closes[i]))),loss=mean(closes.slice(1,15).map((x,i)=>Math.max(0,closes[i]-x)));
 for(let i=15;i<closes.length;i++){gain=(gain*13+Math.max(0,closes[i]-closes[i-1]))/14;loss=(loss*13+Math.max(0,closes[i-1]-closes[i]))/14;}
 const rsi=gain+loss===0?50:loss===0?100:100-100/(1+gain/loss),middle=mean(closes.slice(-20)),deviation=Math.sqrt(mean(closes.slice(-20).map(x=>(x-middle)**2)));
 const keltner={middle:e20,upper:e20+2*atr,lower:e20-2*atr},bollinger={middle,upper:middle+2*deviation,lower:middle-2*deviation};
 const e12=ema(closes,12),e144=ema(closes,144),e169=ema(closes,169);
 const vegas=rows.length===TECH_WINDOW?{ema12:e12,ema144:e144,ema169:e169,direction:price>Math.max(e144,e169)&&e12>Math.max(e144,e169)?'LONG':price<Math.min(e144,e169)&&e12<Math.min(e144,e169)?'SHORT':'MIXED'}:null;
 // Strict two-sided pivots become known only after two later CLOSED bars. Ambiguous outside-bar pivots are discarded.
 const pivots=[];for(let i=2;i<rows.length-2;i++){const neighbours=[rows[i-2],rows[i-1],rows[i+1],rows[i+2]],hi=neighbours.every(r=>+rows[i][2]>+r[2]),lo=neighbours.every(r=>+rows[i][3]<+r[3]);if(hi!==lo)pivots.push({kind:hi?'high':'low',price:+rows[i][hi?2:3],at:+rows[i][0],confirmedAt:+rows[i+2][6]});}
 let fib=null;
 if(['LONG','SHORT'].includes(side))for(let i=pivots.length-1;i>0&&!fib;i--){const b=pivots[i];if(b.kind!==(side==='LONG'?'high':'low'))continue;const a=pivots.slice(0,i).findLast(p=>p.kind!==b.kind);if(!a)continue;const sign=side==='LONG'?1:-1,range=sign*(b.price-a.price);if(range<=0)continue;const levels=Object.fromEntries([.382,.5,.618,.786].map(r=>[r,b.price-sign*range*r]));fib={side,start:a,end:b,levels,zoneLow:Math.min(levels[.382],levels[.618]),zoneHigh:Math.max(levels[.382],levels[.618]),invalidated:sign*(price-a.price)<=0};}
 const candle=+last[4]>+last[1]&&+previous[4]<+previous[1]&&+last[1]<=+previous[4]&&+last[4]>=+previous[1]?'看漲吞噬':+last[4]<+last[1]&&+previous[4]>+previous[1]&&+last[1]>=+previous[4]&&+last[4]<=+previous[1]?'看跌吞噬':+last[4]>+last[1]?'陽線':+last[4]<+last[1]?'陰線':'十字';
 return {version:TECH_VERSION,closedAt:+last[6],bars:rows.length,side,price,atr,rsi,keltner,bollinger,vegas,fibonacci:fib,candle,volumeRatio:mean(rows.slice(-21,-1).map(r=>+r[5]))>0?+last[5]/mean(rows.slice(-21,-1).map(r=>+r[5])):null};
}
export function technicalFilter(e,variant,side){
 if(!e||!['LONG','SHORT'].includes(side))return {ready:false,pass:false};
 if(variant==='vegas')return {ready:!!e.vegas,pass:!!e.vegas&&e.vegas.direction===side};
 if(variant==='keltner')return {ready:true,pass:side==='LONG'?e.price>e.keltner.upper:e.price<e.keltner.lower};
 if(variant==='fibonacci'){const f=e.fibonacci;return {ready:!!f&&f.side===side,pass:!!f&&f.side===side&&!f.invalidated&&e.price>=f.zoneLow&&e.price<=f.zoneHigh};}
 return {ready:false,pass:false};
}
