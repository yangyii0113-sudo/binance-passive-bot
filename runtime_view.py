"""Read-only projections for the full UI. Never invokes the execution engine."""
from collections import Counter
from foxyya.portfolio import replay_books
from foxyya.risk import FEE


class EventSnapshot:
    def __init__(self, events):
        self._events = events

    def events(self):
        return self._events


def event_time(e):
    return next((e[k] for k in ('observed_ms', 'time_ms', 'persisted_ms',
                               'decision_persist_ms', 'fill_ms') if isinstance(e.get(k), (int, float))), None)


def project_runtime(events, initial_nav, now_ms):
    """Use one immutable ledger read for all balances, positions and diagnostics."""
    books = replay_books(EventSnapshot(events), initial_nav)['books']
    scans = [e for e in events if e['kind'] == 'SCAN_SUMMARY']
    latest = scans[-1] if scans else None
    contexts = {e.get('decision_cutoff_ms'): e.get('regime', 'UNKNOWN') for e in scans}
    intents, active, revalidations, trades = {}, {}, {}, {}
    terminal = set()
    lifecycle = []
    excluded = {'UNIVERSE_CLASSIFIED', 'CANDIDATE_RANKED', 'SIGNAL_WATCH',
                'SIGNAL_ARMED', 'SIGNAL_REJECTED', 'PAPER_MARK', 'INTENT_REVALIDATED'}
    for e in events:
        kind = e['kind']
        if kind not in excluded:
            lifecycle.append(e)
        iid, pid = e.get('intent_id'), e.get('position_id')
        if kind == 'INTENT_CREATED':
            intents[iid] = e
            active[iid] = e
        elif kind == 'INTENT_REVALIDATED':
            revalidations[iid] = e
        elif kind in ('INTENT_CANCELLED', 'PAPER_ENTRY'):
            terminal.add(iid)
        if kind in ('INTENT_CANCELLED', 'PAPER_EXIT'):
            active.pop(iid, None)
        if kind == 'PAPER_ENTRY':
            size = e['size']
            if pid in trades:
                raise ValueError('DUPLICATE_POSITION_ENTRY')
            trades[pid] = {
                'position_id': pid, 'intent_id': iid, 'symbol': e['symbol'],
                'side': e['side'], 'family': e['family'],
                'regime': contexts.get(intents.get(iid, {}).get('decision_close_ms'), 'UNKNOWN'),
                'books': [k for k, v in e['books'].items() if v['status'] == 'MODEL_PASS'],
                'entry_ms': e['fill_ms'], 'entry_fill': size['entry_fill'],
                'initial_qty': size['qty'], 'remaining_qty': size['qty'],
                'initial_stop': size['stop'], 'stop': size['stop'],
                'planned_risk_usdt': size['planned_loss_usdt'],
                'gross_pnl_usdt': 0.0, 'fees_usdt': size['entry_fee_usdt'],
                'funding_usdt': 0.0, 'net_pnl_usdt': -size['entry_fee_usdt'],
                'mfe_r': 0.0, 'mae_r': 0.0, 'mark_samples': 0,
                'closed': False, 'exit_ms': None, 'realized_r': None,
            }
        t = trades.get(pid)
        if not t or t['closed']:
            continue
        if kind == 'PAPER_MARK':
            unit = abs(t['entry_fill'] - t['initial_stop'])
            r = (1 if t['side'] == 'LONG' else -1) * (e['mark'] - t['entry_fill']) / (unit or 1e-12)
            t['mfe_r'] = max(t['mfe_r'], r)
            t['mae_r'] = max(t['mae_r'], -r)
            t['mark_samples'] += 1
        elif kind == 'PAPER_FUNDING':
            t['funding_usdt'] += e['cashflow_usdt']
        elif kind == 'PAPER_TRAILING_UPDATE':
            t['stop'] = e['new_stop']
        elif kind in ('PAPER_PARTIAL_EXIT', 'PAPER_EXIT'):
            qty = min(t['remaining_qty'], e['qty'])
            sign = 1 if t['side'] == 'LONG' else -1
            t['gross_pnl_usdt'] += sign * qty * (e['exit_fill'] - t['entry_fill'])
            t['fees_usdt'] += qty * e['exit_fill'] * FEE
            t['remaining_qty'] = max(0, t['remaining_qty'] - qty)
            t['closed'] = kind == 'PAPER_EXIT' or t['remaining_qty'] <= 1e-12
            if t['closed']:
                t['exit_ms'] = e['observed_ms']
                t['exit_reason'] = e.get('reason')
        t['net_pnl_usdt'] = t['gross_pnl_usdt'] - t['fees_usdt'] + t['funding_usdt']
        if t['closed']:
            t['realized_r'] = t['net_pnl_usdt'] / t['planned_risk_usdt'] if t['planned_risk_usdt'] > 0 else None

    pending = [{**e, 'latest_revalidation': revalidations.get(iid),
                'regime': contexts.get(e.get('decision_close_ms'), 'UNKNOWN'),
                'overdue': e['scheduled_open_ms'] < now_ms - 300_000}
               for iid, e in intents.items() if iid not in terminal]
    recent = [e for e in events if event_time(e) is not None and 0 <= now_ms - event_time(e) <= 86_400_000]
    counts = Counter(e['kind'] for e in recent)
    qualified = sum(e.get('funnel', {}).get('qualified', 0) for e in recent if e['kind'] == 'SCAN_SUMMARY')
    fills = counts['PAPER_ENTRY']
    candidates = []
    if latest:
        matches = {(e['symbol'], e['side']): e for e in events
                   if e.get('scan_id') == latest['scan_id'] and e['kind'] in ('SIGNAL_ARMED', 'SIGNAL_REJECTED')}
        for e in events:
            if e.get('scan_id') == latest['scan_id'] and e['kind'] == 'CANDIDATE_RANKED':
                detail = matches.get((e['symbol'], e['side']), {})
                candidates.append({**e, 'status': detail.get('kind', 'SIGNAL_WATCH').replace('SIGNAL_', ''),
                                   'reason': detail.get('reason'), 'family': detail.get('family')})
    return {
        'schema': 'foxyya-runtime-snapshot/1', 'status': 'PAPER_ONLY', 'real_orders': False,
        'complete': True, 'served_at': now_ms, 'ledger_events': len(events),
        'initial_nav_usdt': initial_nav, 'books': books,
        'latest_scan': latest, 'candidates': candidates, 'pending': pending,
        'trades': sorted(trades.values(), key=lambda t: t['exit_ms'] or now_ms),
        'events': lifecycle[-500:], 'events_complete': len(lifecycle) <= 500,
        'event_scope': 'recent lifecycle events; portfolio and trade summaries use complete ledger',
        'reserved_risk_fraction': sum(e.get('reserved_risk_fraction', 0) for e in active.values()),
        'diagnostics': {'qualified_24h': qualified, 'filled_24h': fills,
                        'qualified_to_filled_24h': fills / qualified if qualified else None,
                        'execution_anomalies_24h': counts['EXECUTION_ANOMALY'],
                        'risk_limits_24h': counts['RISK_LIMIT_EVENT'],
                        'overdue_pending': sum(p['overdue'] for p in pending)},
    }
