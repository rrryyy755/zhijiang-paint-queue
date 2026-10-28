import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
for(const d of ['public','netlify/functions','netlify/database/migrations'])await mkdir(d,{recursive:true});
const source=existsSync('app.js')?'':'build/';
await copyFile(source+'app.js','public/app.js');
await copyFile(source+'app.css','public/style.css');
await writeFile('public/index.html','<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>之江银泰 · 周末彩绘叫号</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
let api=await readFile(source+'api.mjs','utf8');
api=api.replace('"../postgres-env.mjs"','"../../netlify-env.mjs"').replace("'../postgres-env.mjs'","'../../netlify-env.mjs'");
// Merge the shared route into a single deployable function; no extra HTTP endpoints.
api+='\nimport {transaction} from "../../netlify-env.mjs";\nexport default async function handler(request){if(!["GET","POST"].includes(request.method))return new Response("Method not allowed",{status:405});if(request.method==="POST"&&(!process.env.ADMIN_KEY||process.env.ADMIN_KEY.length<16))return Response.json({error:"请先配置至少16位的工作人员管理密码"},{status:503});try{return await transaction(()=>request.method==="POST"?POST(request):GET(request))}catch(e){console.error("Queue database request failed",e.code||e.name);return Response.json({error:"队列暂时无法连接，请稍后刷新"},{status:503,headers:{"Cache-Control":"no-store"}})}}\nexport const config={path:"/api/queue"};\n';
await writeFile('netlify/functions/queue.mjs',api);
await writeFile('netlify/database/migrations/202610280001_create_tickets.sql',await readFile('queue-schema.sql','utf8'));
console.log('Built customer page, staff page, queue function and database migration');
