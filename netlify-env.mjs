import {getDatabase} from '@netlify/database';
import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage();
function normalized(row){if(!row)return null;for(const name of ['id','called','created','started','finished'])if(row[name]!=null)row[name]=Number(row[name]);return row}
export async function transaction(fn){const client=await getDatabase().pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(11012026)');const result=await scope.run(client,fn);await client.query('COMMIT');return result}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
class Statement{
 constructor(sql,params=[]){let i=0;this.sql=sql.replace(/\?/g,()=>'$'+(++i));this.params=params}
 bind(...params){const s=Object.create(Statement.prototype);s.sql=this.sql;s.params=params;return s}
 query(){const client=scope.getStore();if(!client)throw Error('Database operation outside transaction');return client.query(this.sql,this.params)}
 async first(){return normalized((await this.query()).rows[0])}
 async all(){return {results:(await this.query()).rows.map(normalized)}}
 async run(){return this.query()}
}
export const env={DB:{prepare:sql=>new Statement(sql),async batch(statements){const r=[];for(const s of statements)r.push(await s.run());return r}},get ADMIN_KEY(){return process.env.ADMIN_KEY},QUEUE_DEMO:'false'};
