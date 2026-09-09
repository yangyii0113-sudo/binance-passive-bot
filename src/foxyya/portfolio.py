from __future__ import annotations
from copy import deepcopy
from .model import deterministic_id
from .risk import FEE, SLIPPAGE

def _unrealized(pos,mark):
    sign=1 if pos['side']=='LONG' else -1
    return sign*pos['qty']*(mark-pos['entry_fill'])

def replay_books(ledger,initial_nav):
    books={k:{'balance':float(initial_nav),'equity':float(initial_nav),'positions':{},'fees_usdt':0.0,
              'funding_usdt':0.0,'realized_pnl_usdt':0.0,'margin_usage_usdt':0.0} for k in ('5x','8x','10x')}
    for e in ledger.events():
        kind=e.get('kind')
        if kind=='PAPER_ENTRY':
            s=e['size']
            for bk,bmeta in e['books'].items():
                if bmeta['status']!='MODEL_PASS': continue
                b=books[bk]
                b['balance']-=s['entry_fee_usdt']; b['fees_usdt']+=s['entry_fee_usdt']
                pos={'position_id':e['position_id'],'intent_id':e['intent_id'],'symbol':e['symbol'],'side':e['side'],'family':e['family'],
                     'bucket':e['bucket'],'qty':s['qty'],'initial_qty':s['qty'],'entry_fill':s['entry_fill'],'stop':s['stop'],
                     'initial_stop':s['stop'],'step':s['step'],'planned_risk_usdt':s['planned_loss_usdt'],
                     'initial_planned_risk_usdt':s['planned_loss_usdt'],'margin_usdt':bmeta['margin_usdt'],
                     'initial_margin_usdt':bmeta['margin_usdt'],'mark':s['entry_fill'],'entry_ms':e['fill_ms'],'last_ms':e['observed_ms'],
                     'mfe_r':0.0,'mae_r':0.0,'initial_unit_r':abs(s['entry_fill']-s['stop']),'tp1_done':False}
                b['positions'][e['position_id']]=pos
        elif kind=='PAPER_MARK':
            for b in books.values():
                pos=b['positions'].get(e['position_id'])
                if not pos: continue
                mark=e['mark']; pos['mark']=mark; pos['last_ms']=e['observed_ms']
                unit=pos['initial_unit_r'] or 1e-12
                sign=1 if pos['side']=='LONG' else -1
                r=sign*(mark-pos['entry_fill'])/unit
                pos['mfe_r']=max(pos['mfe_r'],r); pos['mae_r']=max(pos['mae_r'],-r)
        elif kind=='PAPER_FUNDING':
            for b in books.values():
                pos=b['positions'].get(e['position_id'])
                if not pos: continue
                cash=e['cashflow_usdt']
                b['balance']+=cash; b['funding_usdt']+=cash; pos['last_ms']=e['observed_ms']
        elif kind=='PAPER_TRAILING_UPDATE':
            for b in books.values():
                pos=b['positions'].get(e['position_id'])
                if pos: pos['stop']=e['new_stop']; pos['last_ms']=e['observed_ms']
        elif kind in ('PAPER_PARTIAL_EXIT','PAPER_EXIT'):
            for b in books.values():
                pos=b['positions'].get(e['position_id'])
                if not pos: continue
                q=min(pos['qty'],e['qty'])
                sign=1 if pos['side']=='LONG' else -1
                gross=sign*q*(e['exit_fill']-pos['entry_fill']); fee=q*e['exit_fill']*FEE
                b['balance']+=gross-fee; b['realized_pnl_usdt']+=gross; b['fees_usdt']+=fee
                old=pos['qty']; remaining=max(0.0,old-q)
                if remaining<=1e-12 or kind=='PAPER_EXIT':
                    del b['positions'][e['position_id']]
                else:
                    ratio=remaining/old; pos['qty']=remaining; pos['planned_risk_usdt']*=ratio; pos['margin_usdt']*=ratio
                    pos['mark']=e['exit_fill']; pos['last_ms']=e['observed_ms']
                    if e.get('reason')=='TP1': pos['tp1_done']=True
    for b in books.values():
        b['margin_usage_usdt']=sum(p['margin_usdt'] for p in b['positions'].values())
        b['equity']=b['balance']+sum(_unrealized(p,p['mark']) for p in b['positions'].values())
    return {'books':books}

class PortfolioService:
    def __init__(self,ledger,risk_book,*,initial_nav):
        self.ledger=ledger; self.risk_book=risk_book; self.initial_nav=float(initial_nav)
    def _state(self): return replay_books(self.ledger,self.initial_nav)
    def _pos(self,position_id):
        st=self._state()['books']
        for bk in ('5x','8x','10x'):
            if position_id in st[bk]['positions']: return st[bk]['positions'][position_id]
        raise ValueError('position not open')
    def _check_time(self,pos,observed_ms):
        if observed_ms<pos['last_ms']: raise ValueError('out-of-order position event')
    def mark(self,position_id,observed_ms,mark):
        pos=self._pos(position_id); self._check_time(pos,observed_ms)
        if mark<=0: raise ValueError('invalid mark')
        return self.ledger.append({'event_id':deterministic_id('mark',position_id,observed_ms),'kind':'PAPER_MARK',
            'position_id':position_id,'observed_ms':int(observed_ms),'mark':float(mark)})
    def funding(self,event_key,position_id,observed_ms,rate,mark):
        eid=deterministic_id('funding',event_key,position_id)
        old=self.ledger.get(eid)
        if old:return old
        pos=self._pos(position_id); self._check_time(pos,observed_ms)
        sign=1 if pos['side']=='LONG' else -1
        cash=-sign*pos['qty']*float(mark)*float(rate)
        return self.ledger.append({'event_id':eid,'kind':'PAPER_FUNDING','position_id':position_id,'observed_ms':int(observed_ms),
            'rate':float(rate),'mark':float(mark),'cashflow_usdt':cash})
    def trailing_update(self,event_key,position_id,observed_ms,new_stop):
        eid=deterministic_id('trail',event_key,position_id)
        old=self.ledger.get(eid)
        if old:return old
        pos=self._pos(position_id); self._check_time(pos,observed_ms)
        new_stop=float(new_stop)
        if pos['side']=='LONG' and new_stop<=pos['stop']: raise ValueError('long trail must tighten')
        if pos['side']=='SHORT' and new_stop>=pos['stop']: raise ValueError('short trail must tighten')
        return self.ledger.append({'event_id':eid,'kind':'PAPER_TRAILING_UPDATE','position_id':position_id,'observed_ms':int(observed_ms),'new_stop':new_stop})
    def _exit(self,event_key,position_id,observed_ms,raw_price,fraction,reason,kind):
        eid=deterministic_id(kind,event_key,position_id)
        old=self.ledger.get(eid)
        if old:return old
        pos=self._pos(position_id); self._check_time(pos,observed_ms)
        if not (0<fraction<=1): raise ValueError('invalid exit fraction')
        sign=1 if pos['side']=='LONG' else -1
        exit_fill=float(raw_price)*(1-sign*SLIPPAGE)
        qty=pos['qty']*fraction
        event=self.ledger.append({'event_id':eid,'kind':kind,'position_id':position_id,'intent_id':pos['intent_id'],
            'observed_ms':int(observed_ms),'raw_price':float(raw_price),'exit_fill':exit_fill,'qty':qty,'fraction':fraction,'reason':reason})
        if kind=='PAPER_EXIT' or fraction>=1-1e-12: self.risk_book.release(pos['intent_id'])
        return event
    def partial_exit(self,event_key,position_id,observed_ms,raw_price,fraction,reason):
        if fraction>=1: raise ValueError('partial must be <1')
        return self._exit(event_key,position_id,observed_ms,raw_price,fraction,reason,'PAPER_PARTIAL_EXIT')
    def exit(self,event_key,position_id,observed_ms,raw_price,reason):
        return self._exit(event_key,position_id,observed_ms,raw_price,1.0,reason,'PAPER_EXIT')
    def shadow(self,event_key,position_id,observed_ms,model,outcome):
        return self.ledger.append({'event_id':deterministic_id('shadow',event_key,position_id,model),'kind':'SHADOW_OUTCOME',
            'position_id':position_id,'observed_ms':int(observed_ms),'model':model,'outcome':outcome,'nav_impact_usdt':0.0})
