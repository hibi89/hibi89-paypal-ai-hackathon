import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../web/offline_demo.html',import.meta.url),'utf8');

test('judge demo keeps the primary marketplace to payment and delivery journey contiguous',()=>{
  const core=['marketplace-panel','quote-panel','draft-panel','approval-panel','payment-panel','contract-panel'];
  const positions=core.map(id=>html.indexOf('id="'+id+'"'));
  assert.ok(positions.every(p=>p>=0),'all primary workflow panels must exist');
  assert.ok(positions.every((p,i)=>i===0||p>positions[i-1]),'primary flow must follow visual order');
  assert.ok(html.indexOf('id="agent-budget-panel"')>positions.at(-1),'optional negotiation must follow contract');
  assert.ok(html.indexOf('id="github-delivery-panel"')>positions.at(-1),'optional GitHub evaluation must follow contract');
});

test('optional tools retain existing IDs and explicit synthetic-only provenance',()=>{
  for(const id of ['agent-negotiation-form','agent-budget-form','agent-budget-reserve',
    'github-delivery-form','github-delivery-result','historical-provider-evidence']){
    assert.equal(html.split('id="'+id+'"').length,2,'one accessible instance of '+id);
  }
  assert.match(html,/Offline demonstration — NOT REAL AI OR PAYPAL/);
  assert.match(html,/Payment is DISABLED/);
  assert.match(html,/#marketplace-brief\\{[^}]*min-height:96px;height:auto\\}/);
  assert.match(html,/OWNER-REPORTED · NOT INDEPENDENTLY REPRODUCED/);
});
