import {getDatabase} from '@netlify/database';
import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage();
const openingTime=Date.parse('2026-11-01T13:00:00+08:00');
export function isTestTime(now=Date.now(),setting=process.env.QUEUE_DEMO){return setting!=='false'&&now<openingTime}
function demoMode(){return scope.getStore()?.demo??isTestTime()}
function normalized(row){if(!row)return null;for(const name of ['id','called','created','started','finished'])if(row[name]!=null)row[name]=Number(row[name]);return row}
let testTableReady=false;
export async function transaction(fn){
 const client=await getDatabase().pool.connect();
 const demo=isTestTime();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(11012026)');
  if(demo&&!testTableReady)await client.query("CREATE TABLE IF NOT EXISTS tickets_test(id SERIAL PRIMARY KEY,device TEXT UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('basic','complex')),status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','called','serving','done','missed')),created BIGINT NOT NULL,called BIGINT,started BIGINT,finished BIGINT,code TEXT UNIQUE)");
  const result=await scope.run({client,demo},fn);
  const commit=await client.query('COMMIT');
  if(demo&&commit.command==='COMMIT')testTableReady=true;
  return result;
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
class Statement{
 constructor(sql,params=[]){let i=0;this.sql=sql.replace(/\?/g,()=>'$'+(++i));this.params=params}
 bind(...params){const s=Object.create(Statement.prototype);s.sql=this.sql;s.params=params;return s}
 query(){const context=scope.getStore();if(!context)throw Error('Database operation outside transaction');const sql=context.demo?this.sql.replace(/\btickets\b/g,'tickets_test'):this.sql;return context.client.query(sql,this.params)}
 async first(){return normalized((await this.query()).rows[0])}
 async all(){return {results:(await this.query()).rows.map(normalized)}}
 async run(){return this.query()}
}
export const env={DB:{prepare:sql=>new Statement(sql),async batch(statements){const r=[];for(const s of statements)r.push(await s.run());return r}},get ADMIN_KEY(){return process.env.ADMIN_KEY},get QUEUE_DEMO(){return demoMode()?'true':'false'}};
