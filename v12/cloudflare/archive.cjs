'use strict';
const {validateHomeReadModel}=require('../staging/read_api.js');
const {createCycleLineage}=require('./lineage.cjs');
const MAX_BYTES=25*1024*1024;
function createArchive(db,{maxBytes=MAX_BYTES}={}){
 if(!db?.prepare)throw Error('D1_BINDING_REQUIRED');
 async function latestRow(){return db.prepare('SELECT * FROM cycles ORDER BY id DESC LIMIT 1').first()}
 async function latest(){const row=await latestRow();return row?JSON.parse(row.home):null}
 async function publish(home,records,now){
  validateHomeReadModel(home);if(home.asOf>now)throw Error('FUTURE_SNAPSHOT');
  createCycleLineage(records);
  const prev=await latestRow();if(prev&&home.asOf<=prev.id)throw Error('SNAPSHOT_TIME_REGRESSION');
  const payload=JSON.stringify(home),lineage=JSON.stringify(records);
  const bytes=new TextEncoder().encode(payload+lineage).length;
  if(new TextEncoder().encode(payload).length>900000||new TextEncoder().encode(lineage).length>900000)throw Error('CYCLE_TOO_LARGE');
  const state=await db.prepare('SELECT total_bytes FROM control WHERE id=1').first();
  if((state?.total_bytes||0)+bytes>maxBytes)throw Error('STORAGE_BUDGET_EXCEEDED');
  await db.batch([
   db.prepare('INSERT INTO cycles(id,home,records,bytes) VALUES(?,?,?,?)').bind(home.asOf,payload,lineage,bytes),
   db.prepare('UPDATE control SET total_bytes=total_bytes+?,last_error=NULL WHERE id=1').bind(bytes)
  ]);
  return home;
 }
 async function trace(ref){const row=await latestRow();return row?createCycleLineage(JSON.parse(row.records)).traceOutput(ref):null}
 return {latest,latestRow,publish,trace};
}
module.exports={createArchive};
