import pg from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
pg.types.setTypeParser(20,Number);
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
const scope=new AsyncLocalStorage();
export async function initialize(){await pool.query(`CREATE TABLE IF NOT EXISTS tickets(id SERIAL PRIMARY KEY,device TEXT UNIQUE,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'waiting',created BIGINT NOT NULL,called BIGINT,started BIGINT,finished BIGINT,code TEXT UNIQUE)`)}
export async function transaction(fn){const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(11012026)');const result=await scope.run(client,fn);await client.query('COMMIT');return result}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
class Statement{
 constructor(sql,params=[]){let i=0;this.sql=sql.replace(/\?/g,()=>'$'+(++i));this.params=params}
 bind(...params){const s=Object.create(Statement.prototype);s.sql=this.sql;s.params=params;return s}
 query(){const client=scope.getStore();if(!client)throw Error('Database operation outside transaction');return client.query(this.sql,this.params)}
 async first(){return (await this.query()).rows[0]||null}
 async all(){return {results:(await this.query()).rows}}
 async run(){return this.query()}
}
export const env={DB:{prepare:sql=>new Statement(sql),async batch(statements){const r=[];for(const s of statements)r.push(await s.run());return r}},ADMIN_KEY:process.env.ADMIN_KEY,QUEUE_DEMO:process.env.QUEUE_DEMO||'false'};
