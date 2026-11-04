import test from 'node:test';import assert from 'node:assert/strict';
import {assessGithubDelivery} from '../src/github_delivery_review.mjs';
const base={repository:'fictional/demo',commitSha:'a'.repeat(40),prNumber:1,reviewApproved:true,checks:[{name:'build',conclusion:'success'}],requiredChecks:['build']};
test('duplicate conflicting check conclusions are rejected',()=>assert.throws(()=>assessGithubDelivery({...base,checks:[...base.checks,{name:'build',conclusion:'failure'}]}),/DUPLICATE_OR_INVALID_CHECK/));
test('duplicate required check names are rejected',()=>assert.throws(()=>assessGithubDelivery({...base,requiredChecks:['build','build']}),/DUPLICATE_OR_INVALID_CHECK/));
test('blank check names are rejected',()=>assert.throws(()=>assessGithubDelivery({...base,checks:[{name:'',conclusion:'success'}]}),/DUPLICATE_OR_INVALID_CHECK/));
test('one valid check cannot authorize actual payout',()=>{const x=assessGithubDelivery(base);assert.equal(x.decision,'READY_FOR_HUMAN_SETTLEMENT_REVIEW');assert.equal(x.payoutAuthorized,false);assert.equal(x.paymentAuthorized,false)});
