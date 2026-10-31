// Private, ephemeral OFFLINE synthetic integration proof. No HTTP server or provider transport.
// Do not accept user data, credentials, real customer records, or production SQLite paths.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createInnovationLab} from '../src/innovation_lab.mjs';
import {createMarketplaceIdentityPolicy} from '../src/marketplace_identity_policy.mjs';
import {createCrossPartReviewBridge} from '../src/cross_part_review_bridge.mjs';
import {createCrossPartReviewReadApi} from '../src/cross_part_review_read_api.mjs';

export async function runPrivateSyntheticCrossPartProof(){
 const folder=mkdtempSync(join(tmpdir(),'ppl-private-review-'));
 const merchant='synthetic_review_merchant';
 const actor='synthetic_review_buyer';
 const quoteId='synthetic_review_quote';
 const selectedMinor=29900;
 let ledger,lab,bridge;
 try{
  ledger=createSqliteLedger({filename:join(folder,'part1.sqlite')});
  lab=createInnovationLab({filename:join(folder,'part2.sqlite')});
  await ledger.provisionLocalMember({actorId:actor,merchantId:merchant,role:'buyer'});
  await ledger.insertQuote({id:quoteId,ownerId:actor,merchantId:merchant});
  await ledger.approve({id:quoteId,actorId:actor,expectedVersion:1,
   amountMinor:selectedMinor});
  const consent=lab.delegate({actor,merchant,
   key:'review_consent_'+randomBytes(8).toString('hex'),
   category:'services',maxMinor:30000,expiresInMinutes:30});
  const a2a=await lab.a2a({actor,merchant,
   key:'review_a2a_'+randomBytes(8).toString('hex'),consentId:consent.consentId});
  assert.equal(a2a.status,'SYNTHETIC_AGREEMENT');
  const sessionHandle=Object.freeze(Object.create(null));
  const handles=new WeakMap([[sessionHandle,{verified:true,
   actorId:actor,merchantId:merchant}]]);
  const identityPolicy=createMarketplaceIdentityPolicy({
   resolveTrustedSession:async handle=>handles.get(handle),
   resolveMembership:async member=>ledger.getLocalMember(member)
  });
  const options={filename:join(folder,'review.sqlite'),
   ledger,innovationStore:lab,identityPolicy,
   // A synthetic host authorization callback; NOT a real customer's consent.
   authorizeLink:async context=>
    context.action==='LINK_SYNTHETIC_A2A_TO_APPROVED_QUOTE' &&
    context.paymentAuthorized===false && context.providerCalls===0,
  };
  bridge=createCrossPartReviewBridge(options);
  const linked=await bridge.link({hostHandle:sessionHandle,
   quoteId,consentId:consent.consentId});
  assert.equal(linked.amountMinor,selectedMinor);
  assert.equal(linked.paymentAuthorized,false);
  assert.equal(linked.realProviderEvidence,false);
  bridge.close();
  bridge=createCrossPartReviewBridge(options);
  const restored=await bridge.inspect({hostHandle:sessionHandle,quoteId});
  assert.deepEqual(restored,linked);

  const handler=createCrossPartReviewReadApi({bridge});
  const url='http://127.0.0.1:8765/api/private/cross-part/review?quoteId='+quoteId;
  const trustedRequest=new Request(url);
  handles.set(trustedRequest,{verified:true,actorId:actor,merchantId:merchant});
  const response=await handler(trustedRequest);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();
  assert.equal(body.review.reviewFingerprint,linked.reviewFingerprint);
  assert.equal(body.review.paymentAuthorized,false);
  assert.equal(body.readOnly,true);
  assert.equal(body.providerCalls,0);
  const forgedResponse=await handler(new Request(url));
  assert.equal(forgedResponse.status,404);
  const originalMember=await ledger.getLocalMember(actor);
  await ledger.setLocalMemberActive({actorId:actor,
   expectedRevision:originalMember.revision,active:false});
  const revokedResponse=await handler(trustedRequest);
  assert.equal(revokedResponse.status,404);
  return Object.freeze({
   status:'CROSS_PART_PRIVATE_SYNTHETIC_SQLITE_E2E_PASS',
   mode:'OFFLINE_SYNTHETIC_ONLY',part1ApprovedQuote:true,
   part2SyntheticA2A:true,sqlitePersistenceAfterRestart:true,
   verifiedBuyerReadOnly:true,forgedRequestDenied:true,
   revokedMembershipDenied:true,reviewFingerprint:linked.reviewFingerprint,
   amountMinor:selectedMinor,currency:'USD',paymentAuthorized:false,
   paypalOrderCreated:false,paypalCapturePerformed:false,
   realProviderEvidence:false,providerCalls:0,
   publicHttpServerStarted:false,publicationAuthorized:false
  });
 }finally{
  bridge?.close();
  lab?.close();
  ledger?.close();
  rmSync(folder,{recursive:true,force:true});
 }
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==2){
  process.stderr.write('OFFLINE_SYNTHETIC_ONLY_NO_ARGUMENTS\n');
  process.exitCode=2;
 }else{
  runPrivateSyntheticCrossPartProof().then(
   value=>process.stdout.write(JSON.stringify(value)+'\n'),
   error=>{
    process.stderr.write('PRIVATE_CROSS_PART_PROOF_FAILED: '+String(error?.code||error?.message||'UNKNOWN')+'\n');
    process.exitCode=1;
   }
  );
 }
}
