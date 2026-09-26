import { createServer } from 'node:http';

export function researchHttp(engine,runner){
  return createServer((req,res)=>{
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
    if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'READ_ONLY'});}
    const path=req.url?.split('?')[0];
    if(!['/healthz','/readyz','/api/research/snapshot'].includes(path))return send(404,{error:'NOT_FOUND'});
    const health=engine.health(),scan=runner.scan;
    const ready=health.status==='LIVE'&&scan.status==='COMPLETE'&&Number.isFinite(scan.completedAt)&&health.checkedAt-scan.completedAt<3660000;
    const base={source:'independent-research-v1',canonical:false,paperOnly:true,realOrderLocked:true,noBackfill:true,health,scan,ready};
    if(path==='/healthz')return send(health.status==='BLOCKED'||health.status==='STOPPED'?503:200,base);
    if(path==='/readyz')return send(ready?200:503,base);
    if(health.status==='BLOCKED'||health.status==='STOPPED')return send(503,{...base,summary:null,rows:[]});
    try{return send(200,{...engine.store.snapshot(),...base});}
    catch{engine.fatal='紀錄讀取失敗，停止提供成效';runner.fault();return send(503,{...base,ready:false,summary:null,rows:[],error:'STORAGE_UNAVAILABLE'});}
  });
}
