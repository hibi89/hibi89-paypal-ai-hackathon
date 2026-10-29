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
