import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPilotCheckoutSessionStore,boundServerSessionFromStoredProof} from '../src/pilot_checkout_session_store.mjs';

const quote={id:'quote1',ownerId:'owner',merchantId:'A1B2C3D4E5F6G',
 version:2,status:'APPROVED',currency:'USD',approval:{
  decision:'APPROVED',actorId:'owner',quoteVersion:2,amountMinor:150}};
const principal={verified:true,actorId:'owner',merchantId:quote.merchantId};
const withFile=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pilot-session-'));
 let time=1770000000000;
 const make=()=>createPilotCheckoutSessionStore({filename:join(dir,'pilot.sqlite'),now:()=>time});
 try{await fn({make,advance:ms=>{time+=ms}})}
 finally{rmSync(dir,{recursive:true,force:true})}
};
test('strong opaque session token is persisted only as a hash; bound proof never serializes it',
 withFile(({make})=>{
  const store=make();
  try{
   const {token,expiresAtMs}=store.issue({quote,principal});
   assert.match(token,/^[A-Za-z0-9_-]{43}$/);
   assert.ok(expiresAtMs>0);
   const proof=store.verify({token,quote,principal});
   const bound=boundServerSessionFromStoredProof(proof,quote);
   assert.equal(bound.verified,true);
   assert.equal(bound.actorId,quote.ownerId);
   assert.equal(bound.merchantId,quote.merchantId);
   assert.ok(bound.checkoutSessionId.length>=32);
   assert.ok(!JSON.stringify(proof).includes(token));
   assert.ok(!JSON.stringify(bound).includes(token));
  }finally{store.close()}
 }));
test('plain verified:true and cloned/unbranded proofs are rejected',
 withFile(({make})=>{
  const s=make();
  try{
   const {token}=s.issue({quote,principal});
   const proof=s.verify({token,quote,principal});
   for(const candidate of [
    {verified:true,actorId:'owner',merchantId:quote.merchantId,checkoutSessionId:'a'.repeat(64)},
    {...proof},JSON.parse(JSON.stringify(proof)),null,undefined
   ])assert.throws(()=>boundServerSessionFromStoredProof(candidate,quote),
    {code:'PILOT_SESSION_NOT_VERIFIED'});
  }finally{s.close()}
 }));
test('wrong owner, seller and changed approval snapshot cannot reuse token',
 withFile(({make})=>{
  const s=make();
  try{
   const {token}=s.issue({quote,principal});
   for(const wrong of [
    {...principal,actorId:'attacker'},
    {...principal,merchantId:'Z'.repeat(13)},
    {...principal,verified:false}
   ])assert.throws(()=>s.verify({token,quote,principal:wrong}),
    {code:'PILOT_SESSION_NOT_VERIFIED'});
   const proof=s.verify({token,quote,principal});
   for(const changed of [
    {...quote,version:3},
    {...quote,approval:{...quote.approval,amountMinor:200}},
    {...quote,ownerId:'other'}
   ])assert.throws(()=>boundServerSessionFromStoredProof(proof,changed),
    {code:'PILOT_SESSION_NOT_VERIFIED'});
  }finally{s.close()}
 }));
test('expired proof fails even if already materialized before expiration',
 withFile(({make,advance})=>{
  const s=make();
  try{
   const {token}=s.issue({quote,principal});
   const proof=s.verify({token,quote,principal});
   advance(15*60*1000);
   assert.throws(()=>boundServerSessionFromStoredProof(proof,quote),
    {code:'PILOT_SESSION_NOT_VERIFIED'});
   assert.throws(()=>s.verify({token,quote,principal}),
    {code:'PILOT_SESSION_NOT_VERIFIED'});
  }finally{s.close()}
 }));
test('revoked proof cannot be reused even within same process',
 withFile(({make})=>{
  const s=make();
  try{
   const {token}=s.issue({quote,principal});
   const proof=s.verify({token,quote,principal});
   assert.equal(s.revoke({token,quote,principal}).revoked,true);
   assert.throws(()=>boundServerSessionFromStoredProof(proof,quote),
    {code:'PILOT_SESSION_NOT_VERIFIED'});
   assert.throws(()=>s.verify({token,quote,principal}),
    {code:'PILOT_SESSION_NOT_VERIFIED'});
  }finally{s.close()}
 }));
test('durable SQLite preserves token verification across restart and invalidates closed proof',
 withFile(({make})=>{
  const s=make();
  const {token}=s.issue({quote,principal});
  const proof=s.verify({token,quote,principal});
  s.close();
  assert.throws(()=>boundServerSessionFromStoredProof(proof,quote),
   {code:'PILOT_SESSION_NOT_VERIFIED'});
  const again=make();
  try{
   const verified=again.verify({token,quote,principal});
   assert.equal(boundServerSessionFromStoredProof(verified,quote).verified,true);
  }finally{again.close()}
 }));
test('duplicate session issue is blocked without replacing the original token',
 withFile(({make})=>{
  const s=make();
  try{
   const {token}=s.issue({quote,principal});
   assert.throws(()=>s.issue({quote,principal}),
    {code:'PILOT_SESSION_ALREADY_ISSUED'});
   assert.equal(s.verify({token,quote,principal}).kind,'PERSISTED_PILOT_SESSION_PROOF');
  }finally{s.close()}
 }));
test('file must be persistent and no blank/memory DB accepted',()=>{
 for(const filename of [undefined,'',':memory:','file::memory:?cache=shared']){
  assert.throws(()=>createPilotCheckoutSessionStore({filename}),
   {code:'DURABLE_PILOT_SESSION_FILE_REQUIRED'});
 }
});
test('unapproved or over-limit quote cannot issue or verify session',
 withFile(({make})=>{
  const s=make();
  try{
   for(const bad of [
    {...quote,status:'PROPOSED'},
    {...quote,approval:{...quote.approval,amountMinor:201}},
    {...quote,merchantId:'sandbox_merchant'}
   ])assert.throws(()=>s.issue({quote:bad,principal}));
   assert.throws(()=>s.verify({quote,principal,token:'x'.repeat(43)}),
    {code:'PILOT_SESSION_NOT_VERIFIED'});
  }finally{s.close()}
 }));
