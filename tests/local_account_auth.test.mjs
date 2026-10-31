import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalAccountAuth} from '../src/local_account_auth.mjs';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

const passwords={buyer:'Buyer-Only-Password_2026',reviewer:'Reviewer-Only-Password_2026',
  seller:'Seller-Only-Password_2026'};
const accounts=[{actorId:'synthetic-owner',merchantId:'synthetic-merchant',
  password:passwords.buyer}];

test('credential verifier and hashed session survive DB reopen, expire and revoke',()=>{
  const dir=mkdtempSync(join(tmpdir(),'local-auth-'));
  const file=join(dir,'auth.sqlite');
  let stamp=500_000,auth;
  try{
    auth=createLocalAccountAuth({filename:file,accounts,now:()=>stamp,ttlMs:60_000});
    assert.throws(()=>auth.login('synthetic-owner','WRONG-PASSWORD!'),e=>e.code==='INVALID_CREDENTIALS');
    assert.throws(()=>auth.login('missing-account','Valid-Not-Existing-Password'),e=>e.code==='INVALID_CREDENTIALS');
    const {token}=auth.login('synthetic-owner',passwords.buyer);
    const request=new Request('http://127.0.0.1:3000/',{headers:{cookie:'paypal_local_session='+token}});
    assert.equal(auth.resolveRequest(request).actorId,'synthetic-owner');
    assert.equal(auth.resolveRequest(new Request('http://127.0.0.1:3000/')),null);
    const duplicateCookie=new Request('http://127.0.0.1:3000/',{headers:{
      cookie:'paypal_local_session='+token+'; paypal_local_session='+token}});
    assert.equal(auth.resolveRequest(duplicateCookie),null);
    auth.close();
    auth=createLocalAccountAuth({filename:file,accounts,now:()=>stamp,ttlMs:60_000});
    assert.equal(auth.resolveRequest(request).verified,true);
    auth.logout(request);
    assert.equal(auth.resolveRequest(request),null);
    const second=auth.login('synthetic-owner',passwords.buyer);
    stamp+=60_000;
    assert.equal(auth.resolveRequest(new Request('http://127.0.0.1:3000/',{
      headers:{cookie:'paypal_local_session='+second.token}})),null);
    assert.throws(()=>createLocalAccountAuth({filename:file,
      accounts:[{...accounts[0],password:'Changed-Account-Password'}]}),
      /LOCAL_AUTH_ACCOUNT_CONFIGURATION_CHANGED/);
  }finally{auth?.close();rmSync(dir,{recursive:true,force:true});}
});

test('opt-in local real-password login gates legacy demo APIs without synthetic fallback',async()=>{
  const app=await startOfflineDemo({enableSyntheticSeller:true,localLoginPasswords:passwords});
  const origin=app.url;
  const get=async (path,cookie)=>fetch(origin+path,{headers:cookie?{cookie}:{}});
  const post=async(path,body,extra={})=>fetch(origin+path,{method:'POST',
    headers:{origin,'content-type':'application/json',...extra},
    body:JSON.stringify(body)});
  try{
    assert.equal((await get('/api/demo/identity')).status,401);
    assert.equal((await get('/demo/session')).status,401);
    assert.equal((await get('/api/demo/auth/session')).status,401);
    assert.equal((await post('/api/demo/auth/login',
      {actorId:'synthetic-owner',password:'Invalid-Password_2026'})).status,401);
    assert.equal((await fetch(origin+'/api/demo/auth/login',{method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({actorId:'synthetic-owner',password:passwords.buyer})})).status,403);
    const buyer=await post('/api/demo/auth/login',{
      actorId:'synthetic-owner',password:passwords.buyer
    });
    assert.equal(buyer.status,200);
    const buyerCookie=buyer.headers.get('set-cookie').split(';')[0];
    assert.match(buyer.headers.get('set-cookie'),/HttpOnly; Path=\/; SameSite=Strict/);
    assert.doesNotMatch(await buyer.text(),/Buyer-Only-Password|paypal_local_session=/);
    const identity=await (await get('/api/demo/identity',buyerCookie)).json();
    assert.equal(identity.identity.role,'buyer');
    assert.equal(identity.identity.paymentAuthorized,false);
    const buyerSession=await (await get('/api/demo/auth/session',buyerCookie)).json();
    assert.equal(typeof buyerSession.csrfToken,'string');
    assert.equal((await get('/api/quotes/sample-project',buyerCookie)).status,200);
    const seller=await post('/api/demo/auth/login',{
      actorId:'synthetic-seller',password:passwords.seller
    });
    assert.equal(seller.status,200);
    const sellerCookie=seller.headers.get('set-cookie').split(';')[0];
    const sellerIdentity=await(await get('/api/demo/identity',sellerCookie)).json();
    assert.equal(sellerIdentity.identity.role,'seller');
    assert.equal((await get('/api/demo/protected/quotes/sample-project',sellerCookie)).status,403);
    const forged=await get('/api/demo/identity','paypal_local_session='+'x'.repeat(43));
    assert.equal(forged.status,401);
    const roleSwitch=await fetch(origin+'/demo/synthetic-role',{method:'POST',
      headers:{origin,'x-csrf-token':buyerSession.csrfToken,'cookie':buyerCookie,
        'content-type':'application/json'},body:''});
    assert.equal(roleSwitch.status,404);
    const wrongLogout=await fetch(origin+'/api/demo/auth/logout',{method:'POST',
      headers:{origin,cookie:buyerCookie}});
    assert.equal(wrongLogout.status,403);
    const logout=await fetch(origin+'/api/demo/auth/logout',{method:'POST',
      headers:{origin,cookie:buyerCookie,'x-csrf-token':buyerSession.csrfToken}});
    assert.equal(logout.status,200);
    assert.equal((await get('/api/demo/identity',buyerCookie)).status,401);
    assert.equal((await get('/api/demo/identity',sellerCookie)).status,200);
  }finally{await app.close();}
});
