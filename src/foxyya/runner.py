from __future__ import annotations
from .execution import ExecutionEngine,HOUR
from .risk import RiskBook
from .scanner import scan_snapshot
from .features import atr
from .portfolio import replay_books, PortfolioService

class ForwardRunner:
    def __init__(self,ledger,*,initial_nav):
        self.ledger=ledger; self.initial_nav=float(initial_nav)
        self.risk_book=RiskBook(self._current_nav())
        self._rebuild_reservations()
        self.execution=ExecutionEngine(ledger,self.risk_book,nav=self._current_nav())
    def _current_nav(self):
        try:
            state=replay_books(self.ledger,self.initial_nav)
            return min(state['books'][k]['equity'] for k in ('5x','8x','10x'))
        except Exception:return self.initial_nav
    def _rebuild_reservations(self):
        active={}
        for e in self.ledger.events():
            if e.get('kind')=='INTENT_CREATED': active[e['intent_id']]=e
            elif e.get('kind')=='INTENT_CANCELLED': active.pop(e.get('intent_id'),None)
            elif e.get('kind')=='PAPER_EXIT': active.pop(e.get('intent_id'),None)
        for i,e in active.items():
            self.risk_book.reserve(i,e['symbol'],e['bucket'],e['reserved_risk_fraction'])
    def scan(self,snapshot,*,now_ms): return scan_snapshot(snapshot,now_ms=now_ms,ledger=self.ledger,execution_engine=self.execution)
    def pending(self):
        created={}; terminal=set()
        for e in self.ledger.events():
            if e.get('kind')=='INTENT_CREATED': created[e['intent_id']]=e
            elif e.get('kind') in ('INTENT_CANCELLED','PAPER_ENTRY'): terminal.add(e.get('intent_id'))
        return [e for i,e in created.items() if i not in terminal]
    def revalidate(self,snapshot,*,now_ms):
        out=[]
        marks=snapshot.get('marks',{})
        for intent in self.pending():
            if not (intent['decision_persist_ms']<now_ms<intent['scheduled_open_ms']): continue
            sym=intent['symbol']; mark=float(marks.get(sym,intent['reference_price']))
            bars=snapshot.get('klines',{}).get(sym,{}).get('1h',[])
            a=atr(bars,14); last_range=(float(bars[-1]['high'])-float(bars[-1]['low'])) if bars else 0
            extension=last_range/a if a else 1.0
            out.append(self.execution.revalidate_intent(intent['intent_id'],observed_ms=int(now_ms),mark=mark,
                                                        atr_extension=extension,data_latest_ms=int(now_ms)))
        return out
    def execute_open(self,snapshot,*,open_ms,observed_ms):
        out=[]; opens=snapshot.get('hour_open_prices',{})
        for intent in self.pending():
            if intent['scheduled_open_ms']!=open_ms: continue
            if intent['symbol'] not in opens: continue
            out.append(self.execution.fill_due_intent(intent['intent_id'],open_ms,float(opens[intent['symbol']]),observed_ms=int(observed_ms)))
        return out

    def scan_if_new_close(self,snapshot,*,now_ms):
        cutoffs=[]
        for d in snapshot.get('klines',{}).values():
            if d.get('1h'): cutoffs.append(int(d['1h'][-1]['close_ms']))
        cutoff=max(cutoffs) if cutoffs else None
        previous=None
        for e in reversed(self.ledger.events()):
            if e.get('kind')=='SCAN_SUMMARY': previous=e.get('decision_cutoff_ms'); break
        if cutoff is None or cutoff==previous:return None
        return self.scan(snapshot,now_ms=now_ms)

    def apply_funding(self,snapshot,*,now_ms):
        service=PortfolioService(self.ledger,self.risk_book,initial_nav=self.initial_nav)
        state=replay_books(self.ledger,self.initial_nav)['books']['5x']
        out=[]
        by_symbol={}
        for pid,pos in state['positions'].items(): by_symbol.setdefault(pos['symbol'],[]).append((pid,pos))
        for symbol,records in snapshot.get('realized_funding',{}).items():
            for rec in records:
                try:
                    ft=int(rec['fundingTime']); rate=float(rec['fundingRate']); mark=float(rec.get('markPrice') or snapshot.get('marks',{}).get(symbol))
                except Exception:
                    continue
                if ft>now_ms: continue
                for pid,pos in by_symbol.get(symbol,[]):
                    if ft<pos['entry_ms']: continue
                    out.append(service.funding(f'{symbol}:{ft}',pid,now_ms,rate,mark))
        return out

    def manage_positions(self,snapshot,*,now_ms):
        service=PortfolioService(self.ledger,self.risk_book,initial_nav=self.initial_nav)
        state=replay_books(self.ledger,self.initial_nav)['books']['5x']
        events=[]
        marks=snapshot.get('marks',{})
        for pid,pos in list(state['positions'].items()):
            if pid not in replay_books(self.ledger,self.initial_nav)['books']['5x']['positions']: continue
            mark=float(marks.get(pos['symbol'],pos['mark']))
            # Protective stop has priority.
            stop_hit=(pos['side']=='LONG' and mark<=pos['stop']) or (pos['side']=='SHORT' and mark>=pos['stop'])
            if stop_hit:
                events.append(service.exit(f'stop:{now_ms}',pid,now_ms,mark,'STRUCTURE_STOP')); continue
            if now_ms-pos['entry_ms']>=5*24*HOUR:
                events.append(service.exit(f'maxhold:{now_ms}',pid,now_ms,mark,'MAX_HOLD_5D')); continue
            events.append(service.mark(pid,now_ms,mark))
            cur=replay_books(self.ledger,self.initial_nav)['books']['5x']['positions'].get(pid)
            if not cur: continue
            sign=1 if cur['side']=='LONG' else -1
            favorable=sign*(mark-cur['entry_fill'])/max(cur['initial_unit_r'],1e-12)
            if not cur.get('tp1_done') and favorable>=1.5:
                events.append(service.partial_exit(f'tp1:{now_ms}',pid,now_ms,mark,.5,'TP1'))
                cur=replay_books(self.ledger,self.initial_nav)['books']['5x']['positions'].get(pid)
            if cur and cur.get('tp1_done'):
                bars=snapshot.get('klines',{}).get(cur['symbol'],{}).get('1h',[])
                a=atr(bars,14)
                if a>0:
                    proposed=mark-1.5*a if cur['side']=='LONG' else mark+1.5*a
                    tightens=(cur['side']=='LONG' and proposed>cur['stop']) or (cur['side']=='SHORT' and proposed<cur['stop'])
                    if tightens:
                        events.append(service.trailing_update(f'atr15:{now_ms}',pid,now_ms,proposed))
            if favorable>=2.5:
                exists=any(e.get('kind')=='SHADOW_OUTCOME' and e.get('position_id')==pid and e.get('model')=='2.5R_RUNNER' for e in self.ledger.events())
                if not exists: events.append(service.shadow(f'2.5r:{now_ms}',pid,now_ms,'2.5R_RUNNER',{'reached':True,'r':favorable}))
        return events

    def diagnostics(self,now_ms):
        events=self.ledger.events(); day=24*HOUR; two=48*HOUR
        def scans_since(window):return [e for e in events if e.get('kind')=='SCAN_SUMMARY' and now_ms-e.get('time_ms',now_ms)>-1 and now_ms-e.get('time_ms',now_ms)<=window]
        def fills_since(window):return [e for e in events if e.get('kind')=='PAPER_ENTRY' and now_ms-e.get('fill_ms',now_ms)>-1 and now_ms-e.get('fill_ms',now_ms)<=window]
        q24=sum(e.get('funnel',{}).get('qualified',0) for e in scans_since(day)); f24=len(fills_since(day))
        q48=sum(e.get('funnel',{}).get('qualified',0) for e in scans_since(two)); f48=len(fills_since(two))
        return {'qualified_24h':q24,'filled_24h':f24,'zero_fill_24h':'WARNING' if q24>0 and f24==0 else 'OK',
                'zero_fill_48h':'CRITICAL_REVIEW' if q48>0 and f48==0 else 'OK',
                'qualified_to_filled_24h':(f24/q24 if q24 else None)}
