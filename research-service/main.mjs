import { ResearchStore } from './store.mjs';
import { ResearchEngine } from './engine.mjs';
import { ResearchRunner } from './runner.mjs';
import { researchHttp } from './http.mjs';

const directory=process.env.RESEARCH_DATA_DIR;
if(!directory)throw new Error('Set RESEARCH_DATA_DIR to a NEW dedicated persistent directory; canonical ledger paths are not accepted');
const port=Number(process.env.RESEARCH_PORT||8091),host=process.env.RESEARCH_HOST||'127.0.0.1';
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid RESEARCH_PORT');
const maxBytes=Number(process.env.RESEARCH_MAX_BYTES||256*1024*1024);
const store=new ResearchStore(directory,{maxBytes});
let engine,runner,server;
try{engine=new ResearchEngine(store);runner=new ResearchRunner(engine);server=researchHttp(engine,runner);}
catch(error){store.close();throw error;}
let closing=false;
const stop=()=>{
  if(closing)return;closing=true;
  try{runner.stop();}catch{process.exitCode=1;}
  server.close(()=>{store.close();});server.closeAllConnections();
};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
server.on('error',()=>{stop();process.exitCode=1;});
server.listen(port,host,()=>{
  console.log(JSON.stringify({event:'research_service_started',source:'independent-research-v1',host,port,paperOnly:true,realOrderLocked:true,noBackfill:true,canonical:false}));
  runner.start();
});
