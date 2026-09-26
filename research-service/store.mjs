import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, lstatSync, statSync, statfsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { emptyForwardBook, activeForward, forwardSummary } from '../src/advice_forward.js';
import { validateForwardBook } from '../src/advice_forward_store.js';

const APP_ID=0x46585231, ZERO='0'.repeat(64);
const hash=value=>createHash('sha256').update(value).digest('hex');
const validateRows=rows=>validateForwardBook({...emptyForwardBook(),rows});
export class ResearchStore {
  constructor(directory,{maxBytes=256*1024*1024,beforeWrite=()=>{}}={}) {
    if(!isAbsolute(directory)||!Number.isSafeInteger(maxBytes)||maxBytes<1024*1024)throw new Error('RESEARCH_DATA_DIR must be absolute; invalid capacity');
    this.directory=directory;this.maxBytes=maxBytes;this.beforeWrite=beforeWrite;this.failed=false;
    mkdirSync(directory,{recursive:true,mode:0o700});
    this.path=join(directory,'research-v1.sqlite');
    const lockPath=join(directory,'research-v1.writer.sqlite');
    for(const p of [this.path,lockPath])if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw new Error('Research files must not be symbolic links');
    try {
      // Dedicated lock database: held for the entire process lifetime, released by OS on crash.
      this.lock=new DatabaseSync(lockPath);this.lock.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE');
      const populated=existsSync(this.path)&&statSync(this.path).size>0;
      this.db=new DatabaseSync(this.path);
      const app=this.db.prepare('PRAGMA application_id').get().application_id;
      if(populated&&app!==APP_ID)throw new Error('Not an independent FOXYYA research database');
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=0;');
      if(!populated)this.db.exec(`BEGIN IMMEDIATE;
        PRAGMA application_id=${APP_ID};
        CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK(id=1), seq INTEGER NOT NULL, head TEXT NOT NULL);
        INSERT INTO meta VALUES(1,0,'${ZERO}');
        CREATE TABLE journal (seq INTEGER PRIMARY KEY, payload TEXT NOT NULL, previous TEXT NOT NULL, digest TEXT NOT NULL);
        CREATE TABLE samples (id TEXT PRIMARY KEY, body TEXT NOT NULL);
        COMMIT;`);
      this.verify();
    } catch(error){this.close();throw error;}
  }
  verify() {
    if(this.db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('SQLite integrity check failed');
    let seq=0,head=ZERO;const expected=new Map();
    for(const item of this.db.prepare('SELECT * FROM journal ORDER BY seq').iterate()){
      if(item.seq!==++seq||item.previous!==head||item.digest!==hash(head+'\n'+item.payload))throw new Error('Research journal chain mismatch');
      const e=JSON.parse(item.payload);
      if(!Number.isSafeInteger(e.at)||e.at<=0||typeof e.kind!=='string'||!Array.isArray(e.rows))throw new Error('Invalid research event');
      validateRows(e.rows);
      for(const row of e.rows)expected.set(row.id,JSON.stringify(row));
      head=item.digest;
    }
    const meta=this.db.prepare('SELECT * FROM meta WHERE id=1').get();
    if(!meta||meta.seq!==seq||meta.head!==head)throw new Error('Research journal head mismatch');
    for(const row of this.db.prepare('SELECT * FROM samples').iterate()){
      if(expected.get(row.id)!==row.body)throw new Error('Research sample projection mismatch');
      expected.delete(row.id);
    }
    if(expected.size)throw new Error('Research sample projection incomplete');
    this.seq=seq;this.head=head;
  }
  has(id){return !!this.db.prepare('SELECT 1 FROM samples WHERE id=?').get(id);}
  rows(){return this.db.prepare('SELECT body FROM samples ORDER BY rowid').all().map(x=>JSON.parse(x.body));}
  activeBook(){return {...emptyForwardBook(),rows:this.rows().filter(activeForward)};}
  capacity() {
    const used=[this.path,this.path+'-wal'].reduce((n,p)=>n+(existsSync(p)?statSync(p).size:0),0);
    const disk=statfsSync(this.directory);
    if(used>=this.maxBytes||disk.bavail*disk.bsize<16*1024*1024)throw new Error('Research disk capacity reached; no automatic deletion');
  }
  commit(kind,data,rows=[],at=Date.now()) {
    if(this.failed)throw new Error('Research storage is latched closed');
    try {
      this.capacity();this.beforeWrite();validateRows(rows);
      if(!Number.isSafeInteger(at)||at<=0)throw new Error('Invalid event time');
      const payload=JSON.stringify({at,kind,data,rows}),digest=hash(this.head+'\n'+payload),seq=this.seq+1;
      this.db.exec('BEGIN IMMEDIATE');
      const meta=this.db.prepare('SELECT * FROM meta WHERE id=1').get();
      if(meta.seq!==this.seq||meta.head!==this.head)throw new Error('Research writer revision changed');
      this.db.prepare('INSERT INTO journal VALUES(?,?,?,?)').run(seq,payload,this.head,digest);
      const put=this.db.prepare('INSERT INTO samples VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body');
      const get=this.db.prepare('SELECT body FROM samples WHERE id=?');
      for(const row of rows){
        const old=get.get(row.id);
        if(old&&!activeForward(JSON.parse(old.body))&&old.body!==JSON.stringify(row))throw new Error('Terminal research samples are immutable');
        put.run(row.id,JSON.stringify(row));
      }
      this.db.prepare('UPDATE meta SET seq=?,head=? WHERE id=1').run(seq,digest);
      this.db.exec('COMMIT');this.seq=seq;this.head=digest;
    } catch(error){try{this.db.exec('ROLLBACK');}catch{}this.failed=true;throw error;}
  }
  snapshot(limit=100){
    const rows=this.rows();
    return {source:'independent-research-v1',canonical:false,paperOnly:true,realOrderLocked:true,noBackfill:true,
      journal:{sequence:this.seq,head:this.head},summary:forwardSummary(rows),rows:rows.slice(-limit),
      notice:'獨立研究樣本，非正式帳本、非投組投報率；未含資金費率與深度。'};
  }
  close(){try{this.db?.close();}finally{this.db=null;try{this.lock?.close();}finally{this.lock=null;}}}
}
