#!/usr/bin/env node
/** Private localhost WORKNOVA innovation control plane. No external requests. */
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCommerceEngine} from '../src/worknova_agentic_commerce_mvp.mjs';
const html=readFileSync(new URL('../web/worknova_commerce_control_plane.html',import.meta.url),'utf8');
const csrf=randomBytes(32).toString('hex');
export async function startCommerceControlPlane({port=0}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('INVALID_PORT');
 const folder=mkdtempSync(join(tmpdir(),'worknova-commerce-'));
 const engine=createCommerceEngine({filename:join(folder,'synthetic.sqlite')});
 const server=createServer(async(req,res)=>{
   const fail=(code,message)=>{res.writeHead(code,{'cache-control':'no-store','content-type':'application/json','x-content-type-options':'nosniff'});res.end(JSON.stringify({error:message}));};
   const localPort=server.address()?.port;
   const origin=`http://127.0.0.1:${localPort}`;
   if(req.socket.remoteAddress!=='127.0.0.1'&&req.socket.remoteAddress!=='::ffff:127.0.0.1')return fail(403,'LOOPBACK_ONLY');
   if(req.headers.host!==`127.0.0.1:${localPort}`)return fail(403,'INVALID_HOST');
   const path=new URL(req.url,origin).pathname;
   if(req.method==='GET'&&path==='/'){
     res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
     return res.end(html);
   }
   if(req.method==='GET'&&path==='/api/state'){
     res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});
     return res.end(JSON.stringify({...engine.get(),csrfToken:csrf}));
   }
   if(req.method==='POST'&&path==='/api/action'){
     if(req.headers.origin!==origin||req.headers['x-csrf-token']!==csrf||req.headers['content-type']!=='application/json')return fail(403,'ORIGIN_OR_CSRF_REQUIRED');
     let body='';for await(const chunk of req){body+=chunk;if(body.length>1000)return fail(413,'TOO_LARGE');}
     let obj;try{obj=JSON.parse(body)}catch{return fail(400,'BAD_JSON')}
     if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).length!==1||typeof obj.action!=='string')return fail(400,'INVALID_PAYLOAD');
     const response=engine.step(obj.action);
     res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});
     return res.end(JSON.stringify(response));
   }
   return fail(404,'NOT_FOUND');
 });
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});}catch(e){engine.close();rmSync(folder,{recursive:true,force:true});throw e;}
 return {url:`http://127.0.0.1:${server.address().port}`,close:async()=>{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));engine.close();rmSync(folder,{recursive:true,force:true})}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const demo=await startCommerceControlPlane({port:Number(process.env.WORKNOVA_PORT||0)});
 console.log('WORKNOVA PRIVATE OFFLINE SIMULATION '+demo.url);
 const close=async()=>{await demo.close();process.exit(0)};
 process.on('SIGINT',close);process.on('SIGTERM',close);
}
