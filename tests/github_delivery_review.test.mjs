import test from 'node:test';import assert from 'node:assert/strict';
import {assessGithubDelivery} from '../src/github_delivery_review.mjs';
const base={repository:'sample/project',commitSha:'a'.repeat(40),prNumber:1,requiredChecks:['build'],checks:[{name:'build',conclusion:'success'}]};
test('passing checks and human review only permit manual settlement review',()=>{const x=assessGithubDelivery({...base,reviewApproved:true});assert.equal(x.decision,'READY_FOR_HUMAN_SETTLEMENT_REVIEW');assert.equal(x.payoutAuthorized,false)});
test('missing or failed required checks hold',()=>{assert.equal(assessGithubDelivery({...base,checks:[],reviewApproved:true}).decision,'HOLD');assert.equal(assessGithubDelivery({...base,checks:[{name:'build',conclusion:'failure'}],reviewApproved:true}).decision,'HOLD')});
test('review missing holds',()=>assert.equal(assessGithubDelivery(base).decision,'HOLD'));
test('malformed provenance rejected',()=>assert.throws(()=>assessGithubDelivery({...base,commitSha:'bad'}),TypeError));
