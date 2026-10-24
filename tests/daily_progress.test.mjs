import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ledger = JSON.parse(readFileSync(new URL('../data/paypal_daily_progress.json', import.meta.url), 'utf8'));
test('daily status ledger has a tracked active day', () => {
  assert.equal(ledger.schema_version, 1);
  assert.ok(ledger.days.length >= 1);
  assert.ok(ledger.days.some(d => d.day_id === ledger.active_day_id));
});
test('each day contains exactly 100% of acceptance criteria and evidence-backed progress', () => {
  for (const d of ledger.days) {
    assert.match(d.day_id, /^PPL-D\d+$/);
    assert.equal(new Set(d.checklist.map(c => c.id)).size, d.checklist.length);
    assert.ok(d.checklist.length >= 3 && d.checklist.length <= 8);
    assert.equal(d.checklist.reduce((a,c) => a + c.weight_pct, 0), 100);
    for (const c of d.checklist) {
      assert.ok(Number.isInteger(c.weight_pct) && c.weight_pct > 0);
      assert.ok(['VERIFIED','PENDING','FAILED','BLOCKED'].includes(c.state));
      if(c.state === 'VERIFIED') assert.ok(typeof c.evidence === 'string' && c.evidence.length >= 12);
    }
    assert.equal(d.percent_complete, d.checklist.filter(c=>c.state==='VERIFIED').reduce((a,c)=>a+c.weight_pct,0));
    assert.ok(d.percent_complete >= 0 && d.percent_complete <= 100);
  }
});
test('time estimates are separate from measured elapsed and cannot be negative', () => {
  for (const d of ledger.days) {
    assert.ok(d.estimated_total_hours > 0 && d.safe_total_hours >= d.estimated_total_hours);
    for (const key of ['estimated_remaining_hours','safe_remaining_hours','actual_elapsed_hours'])
      assert.ok(d[key] === null || Number.isFinite(d[key]) && d[key] >= 0);
    if (d.percent_complete === 100) { assert.equal(d.estimated_remaining_hours, 0); assert.equal(d.safe_remaining_hours, 0); }
    if (d.status === 'NOT_STARTED') { assert.equal(d.percent_complete, 0); assert.equal(d.estimated_remaining_hours,d.estimated_total_hours); assert.equal(d.safe_remaining_hours,d.safe_total_hours); }
  }
});
test('day2 SQLite criteria are all verified, and next day remains blocked at zero', () => {
  const d2 = ledger.days.find(d => d.day_id === 'PPL-D02');
  const d3 = ledger.days.find(d => d.day_id === 'PPL-D03');
  assert.ok(d2 && d3);
  assert.equal(d2.percent_complete,100);
  assert.ok(d2.checklist.every(c => c.state === 'VERIFIED'));
  assert.equal(d2.estimated_remaining_hours,0);
  assert.equal(d3.percent_complete,0);
  assert.equal(d3.estimated_remaining_hours,3);
  assert.equal(d3.safe_remaining_hours,8);
  assert.equal(ledger.active_day_id,ledger.days.at(-1).day_id);
});
test('accelerated mock days preserve unmet AI and actual provider criteria',()=>{
  const d4=ledger.days.find(d=>d.day_id==='PPL-D04');
  const d5=ledger.days.find(d=>d.day_id==='PPL-D05');
  assert.equal(d4.percent_complete,80);
  assert.equal(d4.estimated_remaining_hours,2);
  assert.equal(d4.safe_remaining_hours,4);
  assert.equal(d4.checklist.find(c=>c.id==='REAL_FREE_AI_PROVIDER').state,'BLOCKED');
  assert.equal(d5.percent_complete,100);
  assert.equal(d5.estimated_remaining_hours,0);
  assert.equal(d5.safe_remaining_hours,0);
  assert.equal(d5.checklist.find(c=>c.id==='END_TO_END_LEDGER_RECONCILIATION').state,'VERIFIED');
});
test('day5 completion does not disguise the blocked external gate or next-day work',()=>{
  const d3=ledger.days.find(d=>d.day_id==='PPL-D03');
  const d6=ledger.days.find(d=>d.day_id==='PPL-D06');
  assert.equal(d3.percent_complete,0);
  assert.ok(d3.checklist.some(x=>x.state==='BLOCKED'));
  assert.equal(d6.percent_complete,100);
  assert.equal(d6.estimated_remaining_hours,0);
  assert.equal(d6.safe_remaining_hours,0);
  assert.equal(ledger.active_day_id,ledger.days.at(-1).day_id);
});
test('Chromium D06 and contract D07 completed offline; server API D08 remains READY',()=>{
  const d6=ledger.days.find(d=>d.day_id==='PPL-D06');
  const d7=ledger.days.find(d=>d.day_id==='PPL-D07');
  assert.equal(d6.percent_complete,100);
  assert.ok(d6.checklist.every(x=>x.state==='VERIFIED'));
  assert.equal(d7.percent_complete,100);
  assert.ok(d7.checklist.every(x=>x.state==='VERIFIED'));
  assert.equal(d7.estimated_remaining_hours,0);
  assert.equal(d7.safe_remaining_hours,0);
  const d8=ledger.days.find(d=>d.day_id==='PPL-D08');
  assert.ok(d8);
  assert.equal(d8.status,'NOT_STARTED');
  assert.equal(d8.percent_complete,0);
  assert.equal(d8.estimated_remaining_hours,4);
  assert.equal(d8.safe_remaining_hours,8);
  assert.equal(ledger.active_day_id,d8.day_id);
});
