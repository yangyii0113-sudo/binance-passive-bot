import { agentPlanStatus } from './agent_trade_plan.js';
import { pullbackReadiness } from './entry_readiness.js';
import { FAMILY_NAMES } from './strategy_families.js';

export const AUTO_CHECK_MS=30000;
// Foreground scheduling and notices only. Uses the existing scanner and forward ledger.
export function createAdviceMonitor({scan,clock=Date.now,available=()=>true,onChange=()=>{},interval=setInterval,cancelInterval=clearInterval}={}) {
  let enabled=true,paused=true,running=false,nextAt=0,lastAt=null,error=null,epoch=0,timer,startedAt=clock();
  let alerts=[],symbols=[];
  const seen=new Set();
  const view=()=>({enabled,paused,running,nextAt,lastAt,error,symbols:[...symbols],alerts:alerts.map(a=>({...a}))});
  const notify=()=>onChange(view());
  function add(id,symbol,kind,label,at=clock(),meta={}) {
    if(seen.has(id))return;
    seen.add(id);if(seen.size>2000)seen.delete(seen.values().next().value);
    alerts=[{id,symbol,kind,label,at,...meta},...alerts].slice(0,20);
  }
  function observe(record) {
    if(!enabled||!available())return;
    const now=clock(),gate=agentPlanStatus(record,now),p=pullbackReadiness(record,now),a=record?.row?.analysis;
    if(!['plan','wait','conflict'].includes(gate.key)||record.row.symbol!==record.symbol)return;
    const id=`${record.symbol}:${a.closedAt}`;
    if(p.complete)add(`${id}:pullback`,record.symbol,'pullback',p.label);
    for(const plan of gate.plans)add(`${id}:${plan.key}:plan`,record.symbol,'plan',`${FAMILY_NAMES[plan.key]}：計畫成立 · 等待觸發`,now,{family:plan.key,signalAt:a.closedAt});
    const invalid=a.strategies.filter(p=>p.status!=='SETUP'&&/已觸及失效止損|目標已越過進場點|本根已觸及進場門檻/.test(p.reason||''));
    for(const plan of invalid)add(`${id}:${plan.key}:invalid`,record.symbol,'invalid',`${FAMILY_NAMES[plan.key]}：已失效或已錯過，不追價`);
    notify();
  }
  function forward(view) {
    if(!enabled||!available()||!view.enabled||view.error||view.dataError)return;
    for(const row of view.book?.rows||[]) {
      if(!row.plan||row.createdAt<startedAt)continue;
      for(const e of row.events||[]) {
        if(e.at<startedAt||e.at>clock()||!['TRIGGERED','GAP','EXPIRED','CANCELLED'].includes(e.type))continue;
        const label=e.type==='TRIGGERED'?'已觸發 · 僅模擬':e.type==='GAP'?'追蹤中斷 · 不再判定':e.type==='EXPIRED'?'計畫到期 · 停止等待':'計畫取消 · 不追價';
        add(`${row.id}:${e.type}:${e.at}`,row.symbol,e.type==='TRIGGERED'?'triggered':'invalid',`${FAMILY_NAMES[row.plan.key]}：${label}`,e.at);
      }
    }
    notify();
  }
  function pause() {epoch++;paused=true;nextAt=0;notify();}
  async function tick() {
    if(!enabled||!available()){if(!paused)pause();return;}
    if(running)return;
    const now=clock();
    if(!paused&&now<nextAt&&now>=lastAt)return;
    paused=false;running=true;error=null;
    const token=epoch;notify();
    const current=()=>enabled&&available()&&token===epoch;
    try {
      const records=await scan(current);
      if(!current())return;
      symbols=records.map(r=>r.symbol);lastAt=clock();
      for(const record of records)observe(record);
    }catch(e){if(current())error=String(e?.message||e);}
    finally {
      running=false;
      if(current())nextAt=Math.min(clock()+AUTO_CHECK_MS,(Math.floor(clock()/3600000)+1)*3600000+1500);
      notify();
    }
  }
  function start(){if(!timer)timer=interval(()=>{void tick();},1000);void tick();}
  function setEnabled(value){enabled=!!value;pause();if(enabled)void tick();}
  function stop(){enabled=false;pause();cancelInterval(timer);timer=null;}
  return {view,start,tick,pause,setEnabled,stop,observe,forward};
}
