import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createAgentBudgetStore} from '../src/agent_budget_store.mjs';
test('budget persists and prevents double reservation and overspend',()=>{
 const dir=mkdtempSync(join(tmpdir(),'agent-budget-'));const file=join(dir,'budget.sqlite');
 let store=createAgentBudgetStore(file);
 try{
  assert.equal(store.configure('owner','merchant',30000).ok,true);
  assert.equal(store.reserve({owner:'owner',merchant:'merchant',quote:'q1',version:1,amount:27500}).ok,true);
  assert.equal(store.reserve({owner:'owner',merchant:'merchant',quote:'q1',version:1,amount:27500}).reason,'ALREADY_RESERVED');
  assert.equal(store.reserve({owner:'owner',merchant:'merchant',quote:'q2',version:1,amount:5000}).reason,'BUDGET_EXCEEDED');
  store.close();store=createAgentBudgetStore(file);
  assert.equal(store.status('owner','merchant').reservedMinor,27500);
  assert.equal(store.configure('owner','merchant',20000).reason,'BELOW_RESERVED');
 }finally{store.close();rmSync(dir,{recursive:true,force:true})}
});
