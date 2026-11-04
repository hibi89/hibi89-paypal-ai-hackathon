import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const load=p=>readFileSync(new URL(p,root),'utf8');
const ledger=JSON.parse(load('data/paypal_daily_progress.json'));
const day=ledger.days.find(d=>d.day_id===ledger.active_day_id);
const docs=[
  'CHAT_BOOTSTRAP.md',
  'AGENTS.md',
  'STATUS.md',
  'HANDOFF.md',
  'docs/roles/lead/LEAD_ACTIVE_WORK.md',
  'docs/roles/lead/TO_HACKATHON_LEAD.md',
];
const phrase="페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈";

test('exact single sentence appears in entrypoints and handoff',()=>{
  assert.ok(load('README.md').includes(phrase));
  assert.ok(load('CHAT_BOOTSTRAP.md').includes(phrase));
  assert.ok(load('HANDOFF.md').includes(phrase));
  assert.ok(load('AGENTS.md').includes(phrase));
});
test('active checklist metadata agrees across every handoff file',()=>{
  assert.ok(day,'active day must exist in ledger');
  const mark='<!-- resume: day_id='+day.day_id+'; percent='+day.percent_complete+
    '; est_h='+day.estimated_remaining_hours+'; safe_h='+day.safe_remaining_hours+' -->';
  for(const path of docs){
    const body=load(path);
    assert.ok(body.includes(mark),path+' does not match current progress ledger: '+mark);
    assert.ok(body.includes('lead/paypal')||body.includes('CHAT_BOOTSTRAP'),path);
  }
});
test('active current acceptance weights add to 100 and no fake actual times',()=>{
  assert.equal(day.checklist.reduce((sum,c)=>sum+c.weight_pct,0),100);
  assert.equal(day.percent_complete,day.checklist.filter(c=>c.state==='VERIFIED')
    .reduce((sum,c)=>sum+c.weight_pct,0));
  assert.equal(day.actual_elapsed_hours,null,'never invent worked time');
  assert.ok(day.estimated_remaining_hours>=0);
  assert.ok(day.safe_remaining_hours>=day.estimated_remaining_hours);
});
test('stale archived worker instructions cannot be executable start path',()=>{
  for(const path of ['CHAT_BOOTSTRAP.md','AGENTS.md','docs/roles/lead/LEAD_ACTIVE_WORK.md']){
    const body=load(path);
    assert.ok(!body.includes('NOW NEXT: Day2'),path);
    assert.ok(!body.includes('CURRENT NEXT 6일차'),path);
  }
});
test('bootstrap contract and active work include cross-session mandatory sync',()=>{
  assert.ok(load('CHAT_BOOTSTRAP.md').includes('RESUME_SYNC_CONTRACT.md'));
  assert.ok(load('HANDOFF.md').includes('RESUME_SYNC_CONTRACT.md'));
  assert.ok(load('docs/roles/lead/LEAD_ACTIVE_WORK.md').includes('RESUME_SYNC_CONTRACT.md'));
  assert.ok(load('docs/RESUME_SYNC_CONTRACT.md').includes('expected_sha'));
});
