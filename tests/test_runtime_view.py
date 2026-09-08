import importlib.util
import json
import sys
import tempfile
import threading
import unittest
import base64
import io
import zipfile
from pathlib import Path
from types import SimpleNamespace
from urllib.request import urlopen
from http.server import ThreadingHTTPServer

ROOT=Path(__file__).resolve().parents[1]
_backend_tmp=tempfile.TemporaryDirectory()
packed=b''.join(p.read_bytes() for p in sorted((ROOT/'backend_parts2').glob('part*')))
zipfile.ZipFile(io.BytesIO(base64.b64decode(packed,validate=True))).extractall(_backend_tmp.name)
BACKEND=Path(_backend_tmp.name)/'foxyya_runtime_backend'
sys.path[:0]=[str(ROOT),str(BACKEND),str(BACKEND/'src')]
spec=importlib.util.spec_from_file_location('platform_service',ROOT/'service.py')
service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)
from foxyya.ledger import EventLedger
from foxyya.execution import ExecutionEngine,HOUR
from foxyya.risk import RiskBook
from foxyya.portfolio import PortfolioService,replay_books

class RuntimeViewTests(unittest.TestCase):
 def test_http_snapshot_is_readonly_and_replays_complete_ledger(self):
  with tempfile.TemporaryDirectory() as td:
   ledger=EventLedger(Path(td)/'paper.sqlite');risk=RiskBook(1000)
   engine=ExecutionEngine(ledger,risk,nav=1000)
   decision=SimpleNamespace(qualified=True,signal_id='signal-test',symbol='BTCUSDT',side='LONG',family='A',decision_close_ms=HOUR-1,stop=98)
   intent=engine.create_intent(decision,decision_persist_ms=HOUR+1,reference_price=100,step=.001,bucket='BTC_BETA')
   engine.revalidate_intent(intent['intent_id'],observed_ms=2*HOUR-1000,mark=100,atr_extension=1,data_latest_ms=2*HOUR-1000)
   entry=engine.fill_due_intent(intent['intent_id'],2*HOUR,100,observed_ms=2*HOUR+1)
   portfolio=PortfolioService(ledger,risk,initial_nav=1000);pid=entry['position_id']
   portfolio.mark(pid,2*HOUR+2,104)
   portfolio.funding('fund',pid,2*HOUR+3,.0001,104)
   portfolio.partial_exit('tp',pid,2*HOUR+4,104,.5,'TP1')
   portfolio.exit('exit',pid,2*HOUR+5,101,'TRAIL')
   before=ledger.events();expected=replay_books(ledger,1000)
   server=ThreadingHTTPServer(('127.0.0.1',0),service.make_handler(service.RuntimeState('test'),ledger))
   threading.Thread(target=server.serve_forever,daemon=True).start()
   try:
    with urlopen(f'http://127.0.0.1:{server.server_port}/api/runtime/snapshot') as response:data=json.load(response)
    self.assertEqual(data['schema'],'foxyya-runtime-snapshot/1')
    self.assertTrue(data['complete']);self.assertEqual(data['ledger_events'],len(before))
    self.assertEqual(data['books'],expected['books'])
    self.assertEqual(data['pending'],[])
    self.assertEqual(len(data['trades']),1)
    t=data['trades'][0];self.assertTrue(t['closed'])
    self.assertAlmostEqual(t['net_pnl_usdt'],expected['books']['5x']['balance']-1000)
    self.assertAlmostEqual(t['realized_r'],t['net_pnl_usdt']/entry['size']['planned_loss_usdt'])
    self.assertGreater(t['mfe_r'],0)
    self.assertEqual(ledger.events(),before)
   finally:server.shutdown();server.server_close();ledger.close()

if __name__=='__main__':unittest.main()
