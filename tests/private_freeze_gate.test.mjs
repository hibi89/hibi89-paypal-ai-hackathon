import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPrivateFreeze,checkPrivateFreeze} from '../scripts/check_private_freeze.mjs';

const sha='a'.repeat(40);
const base=()=>({
  checkout:{commitSha:sha,branch:'work/paypal-final-qa-20261030'},
  clean:true,
  judge:{
    status:'JUDGE_OFFLINE_REPRODUCED_NOT_SUBMITTED',
    source:{commitSha:sha,trackedFilesClean:true},
    reproducibleA:{
      status:'ACTUAL_LOOPBACK_HTTP_VERIFIED_SYNTHETIC_ONLY',
      categories:[{vertical:'ai_work'},{vertical:'general_services'}],
      paymentEndpointStatus:503,quoteMutations:0
    },
    reproducibleQuoteBoundPlans:{
      status:'TWO_APPROVED_QUOTE_PLANS_REPRODUCED_SYNTHETIC_ONLY',
      source:'TWO_ISOLATED_REAL_LOOPBACK_SQLITE_SESSIONS',
      totalPureFakeDomainStages:18,
      realGeminiCalls:0,realPayPalCalls:0,actualPaymentPosts:0,
      ownerPrivateReceiptRead:false,providerPaymentVerified:false,
      publicDeploymentVerified:false,
      categories:[
        {vertical:'ai_work',approvedAmount:'15.00'},
        {vertical:'general_services',approvedAmount:'29.00'}
      ].map(row=>({
        ...row,quoteVersion:2,fakeDomainStages:9,
        amountSource:'LOCAL_SQLITE_HUMAN_APPROVAL_FIXTURE',
        planSource:'EXISTING_PURE_PAYPAL_ORDER_CAPTURE_RECONCILIATION_FUNCTIONS',
        prematureCaptureBlocked:true,foreignAmountBlocked:true,
        actualProviderCalls:0,paymentPosts:0,localPaymentPosts:0,
        realProviderCalls:0,paymentEndpointStatus:503,
        buyerApprovalReal:false,paymentReal:false
      }))
    },
    reproducibleB:{status:'VERIFIED_WITH_FAKE_INJECTED_TRANSPORT',
      fakeGetReconciliation:true},
    historicalC:{status:'OWNER_REPORTED_NOT_INDEPENDENTLY_ATTESTED'},
    publicationD:{status:'NOT_SUBMITTED'},
    safety:{scope:'LOCALHOST_AND_INJECTED_FAKE_TRANSPORTS_ONLY',
      realGeminiCalls:0,realPayPalCalls:0,paymentPosts:0,publicUploads:0,
      submissionEligible:false}
  },
  candidate:{
    localCheckout:{commitSha:sha},
    videoSourceMatch:'MATCHED_CLEAN_SOURCE',
    privateVideo:{sourceCommitSha:sha,sourceTrackedClean:true},
    privateVideoDuration:{status:'ENCODED_MEDIA_UNDER_THREE_MINUTES',seconds:153.96},
    technicalVideoReady:true,ownerReviewReady:true,
    authorizedToPublish:false,devpostReceipt:'NOT_SUBMITTED',
    publicSourceRelease:'NOT_APPROVED'
  }
});

test('all private source and media evidence can pass but NEVER auto-grants public release',()=>{
 const status=assessPrivateFreeze(base());
 assert.equal(status.sourceVerified,true);
 assert.equal(status.localJudgeTechnicalEvidenceVerified,true);
 assert.equal(status.privateSyntheticVideoTechnicallyVerified,true);
 assert.equal(status.publishingAuthorized,false);
 assert.equal(status.submissionEligible,false);
 assert.equal(status.externalRealProviderEvidenceIndependentlyVerified,false);
 assert.ok(status.blockers.includes('DEVPOST_RECEIPT_REQUIRED'));
 assert.ok(status.blockers.includes('OWNER_EDITORIAL_AND_PRIVACY_APPROVAL_REQUIRED'));
 assert.ok(status.blockers.includes('PUBLIC_REPO_LICENSE_AND_RELEASE_APPROVAL_REQUIRED'));
});

test('stale, modified or unverified checkout cannot be marked source locked',()=>{
 for(const override of [
   {clean:false},
   {checkout:{commitSha:'bad'}},
   {judge:{...base().judge,source:{commitSha:'b'.repeat(40),trackedFilesClean:true}}},
   {candidate:{...base().candidate,localCheckout:{commitSha:'b'.repeat(40)}}},
   {candidate:{...base().candidate,privateVideoDuration:{
     status:'ENCODED_MEDIA_TOO_LONG',seconds:180}}},
   {candidate:{...base().candidate,technicalVideoReady:false}},
   {candidate:{...base().candidate,videoSourceMatch:'VIDEO_SOURCE_UNVERIFIED'}}
 ]){
  const result=assessPrivateFreeze({...base(),...override});
  assert.equal(result.submissionEligible,false);
  assert.ok(!result.sourceVerified||!result.localJudgeTechnicalEvidenceVerified||
    !result.privateSyntheticVideoTechnicallyVerified);
 }
});

test('a malicious or fabricated live-provider claim invalidates local judge evidence',()=>{
 for(const override of [
   {safety:{...base().judge.safety,realPayPalCalls:1}},
   {safety:{...base().judge.safety,publicUploads:1}},
   {historicalC:{status:'INDEPENDENTLY_PROVEN_FROM_CI'}},
   {publicationD:{status:'SUBMITTED'}},
   {reproducibleB:{status:'REAL_PAYPAL',fakeGetReconciliation:true}}
 ]){
  const value=base();
  value.judge={...value.judge,...override};
  assert.equal(assessPrivateFreeze(value).localJudgeTechnicalEvidenceVerified,false);
 }
});

test('missing reports never cause undefined or omitted freeze gate fields',()=>{
  const state=assessPrivateFreeze({checkout:{commitSha:sha},clean:true});
  assert.equal(state.sourceVerified,true);
  assert.equal(state.localJudgeTechnicalEvidenceVerified,false);
  assert.equal(state.privateSyntheticVideoTechnicallyVerified,false);
  assert.equal(state.publishingAuthorized,false);
  assert.equal(state.submissionEligible,false);
  assert.ok(JSON.stringify(state).includes('"privateSyntheticVideoTechnicallyVerified":false'));
});

test('without local private footage freeze preflight remains non-public and fail-closed',()=>{
 const state=checkPrivateFreeze({write:false});
 assert.equal(state.status,'PRIVATE_RELEASE_BLOCKED_NOT_SUBMITTED');
 assert.equal(state.publishingAuthorized,false);
 assert.equal(state.submissionEligible,false);
 assert.equal(state.externalProviderRequests,0);
 assert.equal(state.paymentPosts,0);
 assert.ok(state.blockers.includes('PUBLIC_YOUTUBE_URL_REQUIRED'));
});

test('private freeze requires real localhost quote-bound proof for each category',()=>{
  const good=base();
  assert.equal(assessPrivateFreeze(good).localJudgeTechnicalEvidenceVerified,true);
  const proof=good.judge.reproducibleQuoteBoundPlans;
  const copy=()=>({...proof,categories:proof.categories.map(row=>({...row}))});
  const invalid=[
    undefined,
    {...copy(),status:'FAKE_PAID'},
    {...copy(),source:'OWNER_REPORTED_REMOTE_PROVIDER'},
    {...copy(),categories:[proof.categories[0]]},
    {...copy(),totalPureFakeDomainStages:9},
    {...copy(),actualPaymentPosts:1},
    {...copy(),realPayPalCalls:1},
    {...copy(),providerPaymentVerified:true},
    {...copy(),categories:proof.categories.slice().reverse()},
    {...copy(),categories:copy().categories.map((row,i)=>
      i===0?{...row,approvedAmount:'29.00'}:row)},
    {...copy(),categories:copy().categories.map((row,i)=>
      i===1?{...row,quoteVersion:3}:row)},
    {...copy(),categories:copy().categories.map((row,i)=>
      i===1?{...row,foreignAmountBlocked:false}:row)},
    {...copy(),categories:copy().categories.map((row,i)=>
      i===1?{...row,localPaymentPosts:1}:row)},
    {...copy(),categories:copy().categories.map((row,i)=>
      i===1?{...row,paymentReal:true}:row)}
  ];
  for(const candidate of invalid){
    const fixture=base();
    fixture.judge.reproducibleQuoteBoundPlans=candidate;
    const verdict=assessPrivateFreeze(fixture);
    assert.equal(verdict.localJudgeTechnicalEvidenceVerified,false);
    assert.equal(verdict.submissionEligible,false);
  }
});
