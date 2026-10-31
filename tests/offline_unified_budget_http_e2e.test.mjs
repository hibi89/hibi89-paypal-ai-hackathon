import test from 'node:test';
import assert from 'node:assert/strict';
import {startOfflineDemo} from '../src/offline_demo_server.mjs';

async function fixture(run){
 const server=await startOfflineDemo({testReviewSessions:true,testSellerSessions:true,
   enableSyntheticSeller:true});
 try{
  const session=await (await fetch(server.url+'/demo/session')).json();
  assert.equal(session.mode,'OFFLINE_MOCK');
  const send=async(path,{method='GET',body,cookie,csrf=session.csrfToken,origin=server.url}={})=>{
   const response=await fetch(server.url+path,{
    method,headers:{
      ...(cookie?{cookie}:{}),
      ...(method==='POST'?{
        'content-type':'application/json',
        origin,'x-csrf-token':csrf
      }:{}),
    },...(method==='POST'?{body:JSON.stringify(body??{})}:{})
   });
   const data=await response.json();
   return {status:response.status,data};
  };
  await run({server,session,send,quote:'/api/quotes/'+session.quoteId,
    budget:'/api/demo/budget/'});
 }finally{await server.close();}
}
const draft=async(send,quote)=>{
 const result=await send(quote+'/draft',{method:'POST',
   body:{expectedVersion:1,scope:'Build an offline fictional service for a test buyer'}});
 assert.equal(result.status,200,JSON.stringify(result));
 return result.data.quote.version;
};
const proposal=async(send,id,version)=>{
 const result=await send('/api/demo/negotiate',{method:'POST',
   body:{quoteId:id,expectedVersion:version,buyerMaxMinor:30000,
     sellerMinMinor:20000,openingMinor:28000}});
 assert.equal(result.status,200,JSON.stringify(result));
 assert.equal(result.data.status,'PROPOSED');
 assert.equal(result.data.paymentAuthorized,false);
 return result.data;
};
const reserve=(send,payload,over={})=>send('/api/demo/budget/reserve',
  {method:'POST',body:payload,...over});

test('full loopback budget journey: configure → proposal → human approval → reserve → replay, no payment',()=>fixture(async({server,session,send,quote,budget})=>{
 const before=await send(budget+'status');
 assert.equal(before.status,200);
 assert.deepEqual({limit:before.data.limitMinor,reserved:before.data.reservedMinor},
   {limit:null,reserved:0});
 const hist=await send(budget+'history');
 assert.deepEqual(hist.data.reservations,[]);
 assert.equal((await send(budget+'configure',{method:'POST',
   body:{limitMinor:35000}})).status,403);
 assert.equal((await send(budget+'configure',{method:'POST',
   body:{limitMinor:35000,confirmBudget:true},csrf:'forged'})).status,403);
 assert.equal((await send(budget+'configure',{method:'POST',
   body:{limitMinor:35000,confirmBudget:true},
   cookie:server.testReviewerCookie})).status,403);
 assert.equal((await send(budget+'configure',{method:'POST',
   body:{limitMinor:35000,confirmBudget:true},
   cookie:server.testSellerCookie})).status,403);
 const configured=await send(budget+'configure',{method:'POST',
   body:{limitMinor:35000,confirmBudget:true}});
 assert.equal(configured.status,200,JSON.stringify(configured));
 assert.equal(configured.data.paymentAuthorized,false);
 const version=await draft(send,quote);
 const neg=await proposal(send,session.quoteId,version);
 const payload={quoteId:session.quoteId,expectedVersion:version,
   negotiation:neg,explicitApproval:true};
 const unapproved=await reserve(send,payload);
 assert.equal(unapproved.status,409,JSON.stringify(unapproved));
 assert.equal(unapproved.data.reason,'HUMAN_APPROVAL_REQUIRED');
 assert.equal((await send(budget+'status')).data.reservedMinor,0);
 const approved=await send(quote+'/approve',{method:'POST',
   body:{expectedVersion:version,confirmed:true,amountMinor:neg.agreedMinor}});
 assert.equal(approved.status,200,JSON.stringify(approved));
 assert.equal(approved.data.quote.status,'APPROVED');
 assert.equal(approved.data.quote.approval.amountMinor,neg.agreedMinor);
 const forgedProposal=await reserve(send,{...payload,negotiation:{
   ...neg,agreedMinor:neg.agreedMinor+100}});
 assert.equal(forgedProposal.status,409);
 assert.equal(forgedProposal.data.error,'NEGOTIATION_NOT_ISSUED');
 assert.equal((await reserve(send,payload,{csrf:'forged'})).status,403);
 assert.equal((await reserve(send,payload,{cookie:server.testReviewerCookie})).status,403);
 assert.equal((await reserve(send,payload,{cookie:server.testSellerCookie})).status,403);
 assert.equal((await send(budget+'reserve')).status,405);
 assert.equal((await send(budget+'status')).data.reservedMinor,0);
 const done=await reserve(send,payload);
 assert.equal(done.status,200,JSON.stringify(done));
 assert.equal(done.data.ok,true);
 assert.equal(done.data.paymentAuthorized,false);
 assert.equal(done.data.providerCallMade,false);
 const replay=await reserve(send,payload);
 assert.equal(replay.status,200);
 assert.equal(replay.data.reason,'ALREADY_RESERVED');
 assert.equal(replay.data.paymentAuthorized,false);
 const below=await send(budget+'configure',{method:'POST',
   body:{limitMinor:neg.agreedMinor-100,confirmBudget:true}});
 assert.equal(below.status,409);
 assert.equal(below.data.reason,'BELOW_RESERVED');
 const status=await send(budget+'status');
 assert.equal(status.data.limitMinor,35000);
 assert.equal(status.data.reservedMinor,neg.agreedMinor);
 assert.deepEqual((await send(budget+'history')).data.reservations,[{
   quoteId:session.quoteId,quoteVersion:version,amountMinor:neg.agreedMinor
 }]);
 const quoted=await send(quote);
 assert.equal(quoted.data.quote.version,version);
 assert.equal(quoted.data.quote.status,'APPROVED');
 assert.equal((await send(budget+'history',{cookie:server.testReviewerCookie})).status,403);
 assert.equal((await send(budget+'history',{cookie:server.testSellerCookie})).status,403);
 const pay=await send('/api/demo/integration');
 assert.equal(pay.status,200);
 assert.equal((await send(budget+'status')).data.reservedMinor,neg.agreedMinor);
}));

test('loopback budget denies undersized cap, stale binding and missing human confirmation without side effects',()=>fixture(async({session,send,quote,budget})=>{
 const version=await draft(send,quote);
 const neg=await proposal(send,session.quoteId,version);
 const payload={quoteId:session.quoteId,expectedVersion:version,
   negotiation:neg,explicitApproval:true};
 const noBudget=await reserve(send,payload);
 assert.equal(noBudget.status,409);
 assert.equal(noBudget.data.reason,'BUDGET_NOT_CONFIGURED');
 assert.equal((await send(budget+'status')).data.reservedMinor,0);
 assert.equal((await send(budget+'configure',{method:'POST',body:{
   limitMinor:neg.agreedMinor-100,confirmBudget:true}})).status,200);
 const approved=await send(quote+'/approve',{method:'POST',body:{
   expectedVersion:version,confirmed:true,amountMinor:neg.agreedMinor}});
 assert.equal(approved.status,200);
 const denied=await reserve(send,payload);
 assert.equal(denied.status,409);
 assert.equal(denied.data.reason,'BUDGET_EXCEEDED');
 const notHuman=await reserve(send,{...payload,explicitApproval:false});
 assert.equal(notHuman.status,409);
 assert.equal(notHuman.data.reason,'HUMAN_APPROVAL_REQUIRED');
 assert.equal((await reserve(send,{...payload,expectedVersion:version+1})).status,409);
 assert.equal((await send(budget+'status')).data.reservedMinor,0);
 assert.deepEqual((await send(budget+'history')).data.reservations,[]);
 const raised=await send(budget+'configure',{method:'POST',body:{
   limitMinor:neg.agreedMinor,confirmBudget:true}});
 assert.equal(raised.status,200);
 const reserved=await reserve(send,payload);
 assert.equal(reserved.status,200);
 assert.equal(reserved.data.remainingMinor,0);
 const again=await reserve(send,payload);
 assert.equal(again.data.reason,'ALREADY_RESERVED');
 assert.equal((await send(budget+'status')).data.reservedMinor,neg.agreedMinor);
}));
