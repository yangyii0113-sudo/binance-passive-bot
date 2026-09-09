from __future__ import annotations
from .model import deterministic_id
from .risk import size_position, leverage_books, RISK_FRACTIONS

HOUR=3_600_000
STALE_MS=5*60_000
OPEN_RECEIPT_MS=5*60_000
GAP_LIMIT_R=.25
MAX_ATR_EXTENSION=1.80

class ExecutionEngine:
    def __init__(self,ledger,risk_book,*,nav):
        self.ledger=ledger; self.risk_book=risk_book; self.nav=float(nav)

    @staticmethod
    def next_future_hour(decision_ms):
        return (int(decision_ms)//HOUR+1)*HOUR

    def _intent_event(self,intent_id): return self.ledger.get(intent_id)
    def _events_for(self,intent_id): return [e for e in self.ledger.events() if e.get('intent_id')==intent_id]
    def _terminal(self,intent_id):
        for e in reversed(self._events_for(intent_id)):
            if e['kind'] in ('INTENT_CANCELLED','PAPER_ENTRY'): return e
        return None
    def _latest_revalidation(self,intent_id):
        for e in reversed(self._events_for(intent_id)):
            if e['kind']=='INTENT_REVALIDATED': return e
        return None

    def create_intent(self,decision,*,decision_persist_ms,reference_price,step,bucket):
        if not getattr(decision,'qualified',False) or not getattr(decision,'signal_id',None): raise ValueError('qualified signal required')
        for e in self.ledger.events():
            if e.get('signal_id')==decision.signal_id and e.get('kind')=='INTENT_CREATED':
                return e
            if e.get('signal_id')==decision.signal_id and e.get('kind')=='INTENT_CANCELLED':
                return e
        if int(decision_persist_ms)<=int(decision.decision_close_ms): raise ValueError('decision must persist after close')
        scheduled=self.next_future_hour(decision_persist_ms)
        intent_id=deterministic_id('intent',decision.signal_id,scheduled)
        existing=self.ledger.get(intent_id)
        if existing:return existing
        # ensure signal qualification itself is persisted before intent.
        self.ledger.append({'event_id':decision.signal_id,'kind':'SIGNAL_QUALIFIED','signal_id':decision.signal_id,
                            'symbol':decision.symbol,'side':decision.side,'family':decision.family,
                            'decision_close_ms':int(decision.decision_close_ms),'persisted_ms':int(decision_persist_ms),
                            'stop':float(decision.stop),'action':getattr(decision,'action','ENTRY'),'quality':getattr(decision,'quality','NORMAL')})
        fraction=RISK_FRACTIONS[decision.family]
        if decision.family=='D' and getattr(decision,'quality','NORMAL')=='HIGH':fraction=.005
        if decision.family=='C' and getattr(decision,'quality','NORMAL')=='HIGH':fraction=.0025
        if not self.risk_book.reserve(intent_id,decision.symbol,bucket,fraction):
            self.ledger.append({'event_id':deterministic_id('risk_event',intent_id),'kind':'RISK_LIMIT_EVENT','intent_id':intent_id,
                                'signal_id':decision.signal_id,'symbol':decision.symbol,'time_ms':int(decision_persist_ms),
                                'reason':'CORRELATION_OR_PORTFOLIO_RISK','requested_risk_fraction':fraction,
                                'portfolio_reserved_fraction':self.risk_book.total_fraction,'bucket':bucket})
            event={'event_id':deterministic_id('cancel',intent_id,'risk'),'kind':'INTENT_CANCELLED','intent_id':intent_id,
                   'signal_id':decision.signal_id,'symbol':decision.symbol,'reason':'CORRELATION_OR_PORTFOLIO_RISK','time_ms':int(decision_persist_ms)}
            return self.ledger.append(event)
        event={'event_id':intent_id,'kind':'INTENT_CREATED','intent_id':intent_id,'signal_id':decision.signal_id,
               'symbol':decision.symbol,'side':decision.side,'family':decision.family,'action':getattr(decision,'action','ENTRY'),
               'quality':getattr(decision,'quality','NORMAL'),'decision_close_ms':int(decision.decision_close_ms),
               'decision_persist_ms':int(decision_persist_ms),'scheduled_open_ms':scheduled,
               'reference_price':float(reference_price),'stop':float(decision.stop),'step':float(step),'bucket':bucket,
               'reserved_risk_fraction':fraction,'status':'PENDING_INTENT'}
        try:return self.ledger.append(event)
        except Exception:
            self.risk_book.release(intent_id); raise

    def _cancel(self,intent,reason,time_ms):
        intent_id=intent['intent_id']
        old=self._terminal(intent_id)
        if old:return old
        if reason in {'NO_PREOPEN_REVALIDATION','STALE_OPEN_EVIDENCE','INVALID_REVALIDATION_TIME'}:
            self.ledger.append({'event_id':deterministic_id('execution_anomaly',intent_id,reason),'kind':'EXECUTION_ANOMALY',
                                'intent_id':intent_id,'signal_id':intent['signal_id'],'symbol':intent['symbol'],
                                'reason':reason,'time_ms':int(time_ms),'materiality':'EXECUTION_LAYER'})
        self.risk_book.release(intent_id)
        return self.ledger.append({'event_id':deterministic_id('cancel',intent_id,reason),'kind':'INTENT_CANCELLED',
            'intent_id':intent_id,'signal_id':intent['signal_id'],'symbol':intent['symbol'],'reason':reason,'time_ms':int(time_ms)})

    def revalidate_intent(self,intent_id,*,observed_ms,mark,atr_extension,data_latest_ms):
        intent=self._intent_event(intent_id)
        if not intent or intent.get('kind')!='INTENT_CREATED': raise ValueError('unknown intent')
        terminal=self._terminal(intent_id)
        if terminal:return terminal
        if not (intent['decision_persist_ms']<observed_ms<intent['scheduled_open_ms']):
            return self._cancel(intent,'INVALID_REVALIDATION_TIME',observed_ms)
        if data_latest_ms>observed_ms or observed_ms-data_latest_ms>STALE_MS:
            return self._cancel(intent,'DATA_STALE',observed_ms)
        if intent['side']=='LONG' and mark<=intent['stop'] or intent['side']=='SHORT' and mark>=intent['stop']:
            return self._cancel(intent,'STRUCTURE_INVALID',observed_ms)
        if atr_extension>MAX_ATR_EXTENSION:
            return self._cancel(intent,'VOLATILITY_EXPANSION',observed_ms)
        return self.ledger.append({'event_id':deterministic_id('revalidate',intent_id,int(observed_ms)),'kind':'INTENT_REVALIDATED',
            'intent_id':intent_id,'signal_id':intent['signal_id'],'symbol':intent['symbol'],'observed_ms':int(observed_ms),
            'mark':float(mark),'atr_extension':float(atr_extension),'data_latest_ms':int(data_latest_ms),'valid':True})

    def fill_due_intent(self,intent_id,open_ms,raw_open,*,observed_ms):
        intent=self._intent_event(intent_id)
        if not intent or intent.get('kind')!='INTENT_CREATED': raise ValueError('unknown intent')
        terminal=self._terminal(intent_id)
        if terminal:return terminal
        if int(open_ms)!=intent['scheduled_open_ms']:
            raise ValueError('fill timestamp must equal precommitted future open')
        if open_ms<=intent['decision_persist_ms']: raise ValueError('backfill forbidden')
        if observed_ms<open_ms or observed_ms-open_ms>OPEN_RECEIPT_MS:
            return self._cancel(intent,'STALE_OPEN_EVIDENCE',observed_ms)
        rv=self._latest_revalidation(intent_id)
        if not rv or rv['observed_ms']>=open_ms:
            return self._cancel(intent,'NO_PREOPEN_REVALIDATION',observed_ms)
        if intent['side']=='LONG' and raw_open<=intent['stop'] or intent['side']=='SHORT' and raw_open>=intent['stop']:
            return self._cancel(intent,'STRUCTURE_INVALID_AT_OPEN',observed_ms)
        rdist=abs(intent['reference_price']-intent['stop'])
        adverse=(raw_open-intent['reference_price']) if intent['side']=='LONG' else (intent['reference_price']-raw_open)
        if rdist<=0: return self._cancel(intent,'INVALID_R_DISTANCE',observed_ms)
        if max(0,adverse)/rdist>GAP_LIMIT_R:
            return self._cancel(intent,'GAP_RISK',observed_ms)
        size=size_position(self.nav,intent['family'],intent['side'],float(raw_open),intent['stop'],intent['step'],quality=intent['quality'])
        books=leverage_books(size)
        if not any(b['status']=='MODEL_PASS' for b in books.values()):
            return self._cancel(intent,'LEVERAGE_BUFFER_CONFLICT',observed_ms)
        event_id=deterministic_id('paper_entry',intent_id,open_ms)
        return self.ledger.append({'event_id':event_id,'kind':'PAPER_ENTRY','intent_id':intent_id,'signal_id':intent['signal_id'],
            'position_id':deterministic_id('position',intent_id),'symbol':intent['symbol'],'side':intent['side'],'family':intent['family'],
            'bucket':intent['bucket'],'fill_ms':int(open_ms),'observed_ms':int(observed_ms),'raw_open':float(raw_open),
            'size':size,'books':books,'status':'OPEN','real_orders':False})
