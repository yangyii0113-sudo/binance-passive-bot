from __future__ import annotations
import hashlib, json, sqlite3, threading
from pathlib import Path

def canonical(obj):
    return json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)

class EventLedger:
    def __init__(self,path):
        self.lock=threading.RLock()
        self.db=sqlite3.connect(str(path),isolation_level=None,check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE NOT NULL,payload TEXT NOT NULL,previous_hash TEXT NOT NULL,event_hash TEXT NOT NULL)')
        self.db.execute("CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'append only');END")
        self.db.execute("CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'append only');END")
    def close(self): self.db.close()
    def get(self,event_id):
        row=self.db.execute('SELECT payload FROM events WHERE event_id=?',(event_id,)).fetchone()
        return json.loads(row[0]) if row else None
    def append(self,event):
        if not isinstance(event,dict) or not event.get('event_id') or not event.get('kind'):
            raise ValueError('event_id and kind required')
        raw=canonical(event)
        with self.lock:
            old=self.get(event['event_id'])
            if old is not None:
                if canonical(old)!=raw: raise ValueError('conflicting event_id reuse')
                return old
            self.db.execute('BEGIN IMMEDIATE')
            try:
                self.verify()
                row=self.db.execute('SELECT event_hash FROM events ORDER BY seq DESC LIMIT 1').fetchone()
                prev=row[0] if row else '0'*64
                digest=hashlib.sha256((prev+raw).encode()).hexdigest()
                self.db.execute('INSERT INTO events(event_id,payload,previous_hash,event_hash) VALUES(?,?,?,?)',(event['event_id'],raw,prev,digest))
                self.db.execute('COMMIT')
            except Exception:
                self.db.execute('ROLLBACK'); raise
        return event
    def events(self):
        return [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM events ORDER BY seq')]
    def verify(self):
        prev='0'*64
        for raw,p,h in self.db.execute('SELECT payload,previous_hash,event_hash FROM events ORDER BY seq'):
            if p!=prev or hashlib.sha256((prev+raw).encode()).hexdigest()!=h:
                raise ValueError('LEDGER_HASH_MISMATCH')
            prev=h
        return True
