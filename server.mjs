import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {initialize,transaction,pool} from './postgres-env.mjs';
import {GET,POST} from './build/api.mjs';
if(!process.env.ADMIN_KEY||process.env.ADMIN_KEY.length<16)throw Error('ADMIN_KEY must contain at least 16 characters');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
await initialize();
const origin=process.env.RENDER_EXTERNAL_URL||process.env.SITE_ORIGIN||'http://127.0.0.1:5175';
const root=fileURLToPath(new URL('./build/',import.meta.url));
const html='<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>之江银泰 · 彩绘叫号</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>';
const server=http.createServer(async(req,res)=>{try{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 const path=new URL(req.url,origin).pathname;
 if(path==='/healthz'){await pool.query('SELECT 1');res.setHeader('Content-Type','application/json');return res.end('{"ok":true}')}
 if(path==='/api/queue'){
  if(!['GET','POST'].includes(req.method)){res.writeHead(405);return res.end()}
  let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384){res.writeHead(413);return res.end()}}
  const input=new Request(new URL(path,origin),{method:req.method,headers:req.headers,...(req.method==='POST'?{body}:{})});
  const output=await transaction(()=>req.method==='POST'?POST(input):GET(input));
  res.writeHead(output.status,Object.fromEntries(output.headers));return res.end(Buffer.from(await output.arrayBuffer()));
 }
 if(path==='/'||path==='/admin'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
 const asset={'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['app.css','text/css; charset=utf-8']}[path];
 if(asset){res.setHeader('Content-Type',asset[1]);return res.end(await readFile(root+asset[0]))}
 res.writeHead(404);res.end('Not found');
 }catch(e){console.error('Request failed:',e.code||e.name);if(!res.headersSent)res.writeHead(503);res.end('Service unavailable')}});
server.listen(Number(process.env.PORT||5175),'0.0.0.0',()=>console.log('Queue server ready'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await pool.end();process.exit()}));
