import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSqliteLedger} from '../src/sqlite_ledger.mjs';
import {createLedgerAgentBudgetStore,createAgentBudgetStore} from '../src/agent_budget_store.mjs';

const owner='buyer',tenant='tenantA',minor=1500;
async function fixture(fn){
 const folder=mkdtempSync(join(tmpdir(),'paypal-unified-budget-'));
 const file=join(folder,'ledger.sqlite'),legacy=join(folder,'legacy-budget.sqlite');
 let ledger=createSqliteLedger({filename:file,enforceLocalMemberWrites:true});
 try{
  await ledger.insertQuote({id:'q1',ownerId:owner,merchantId:tenant});
  await ledger.insertQuote({id:'q2',ownerId:owner,merchantId:tenant});
  await ledger.provisionLocalMember({actorId:owner,merchantId:tenant,role:'buyer'});
  await ledger.provisionLocalMember({actorId:'reviewer',merchantId:tenant,role:'reviewer'});
  const budgets=createLedgerAgentBudgetStore(ledger);
  await fn({ledger,budgets,file,legacy,reopen:()=>{ledger.close();ledger=createSqliteLedger({
    filename:file,enforceLocalMemberWrites:true});return ledger;}});
 }finally{ledger.close();rmSync(folder,{recursive:true,force:true});}
}
const rev=async(ledger,actorId=owner)=>(await ledger.getLocalMember(actorId)).revision;
const reserve=(budgets,quote='q1',version=1,amount=minor,revision=1)=>
 budgets.reserve({owner,merchant:tenant,quote,version,amount,
  expectedMembershipRevision:revision});
const configure=(budgets,cap=3000,revision=1)=>
 budgets.configure(owner,tenant,cap,revision);
test('one SQLite budget persists and replays exact quote once across two ledger connections',()=>fixture(async({ledger,budgets,file})=>{
 assert.equal(configure(budgets).ok,true);
 await ledger.approve({id:'q1',actorId:owner,expectedVersion:1,amountMinor:minor});
 assert.equal(reserve(budgets).ok,true);
 assert.deepEqual(reserve(budgets),{ok:true,reason:'ALREADY_RESERVED'});
 assert.equal(budgets.status(owner,tenant).reservedMinor,minor);
 const second=createSqliteLedger({filename:file,enforceLocalMemberWrites:true});
 try{
  const b=createLedgerAgentBudgetStore(second);
  assert.equal(b.status(owner,tenant).reservedMinor,minor);
  assert.deepEqual(reserve(b),{ok:true,reason:'ALREADY_RESERVED'});
  assert.equal(b.history(owner,tenant).length,1);
  assert.equal(b.existing(owner,tenant,'q1',1),minor);
  assert.equal(configure(b,1000).reason,'BELOW_RESERVED');
  assert.equal(b.status(owner,tenant).limitMinor,3000);
  assert.equal(b.history(owner,'tenantB').length,0);
 }finally{second.close();}
 assert.equal((await ledger.listAttempts('q1')).length,0);
}));
test('quote status, version, approved amount and tenant are validated INSIDE budget transaction',()=>fixture(async({ledger,budgets})=>{
 assert.equal(configure(budgets,5000).ok,true);
 assert.throws(()=>reserve(budgets),{code:'BUDGET_QUOTE_CHANGED'});
 assert.throws(()=>budgets.reserve({owner,merchant:tenant,quote:'nonexistent',
    version:1,amount:minor,expectedMembershipRevision:1}),{code:'QUOTE_NOT_FOUND'});
 await ledger.approve({id:'q1',actorId:owner,expectedVersion:1,amountMinor:minor});
 assert.throws(()=>reserve(budgets,'q1',1,minor+100),{code:'BUDGET_QUOTE_CHANGED'});
 assert.throws(()=>reserve(budgets,'q1',2,minor),{code:'BUDGET_QUOTE_CHANGED'});
 assert.throws(()=>budgets.reserve({owner,merchant:'tenantB',quote:'q1',version:1,
   amount:minor,expectedMembershipRevision:1}),{code:'LOCAL_WRITE_ROLE_REVOKED'});
 assert.equal(budgets.status(owner,tenant).reservedMinor,0);
 assert.equal(reserve(budgets).ok,true);
 assert.equal(budgets.status(owner,tenant).reservedMinor,minor);
}));
test('revoke/re-activate buyer invalidates old budget grant even when active again',()=>fixture(async({ledger,budgets})=>{
 await ledger.approve({id:'q1',actorId:owner,expectedVersion:1,amountMinor:minor});
 assert.equal(configure(budgets).ok,true);
 await ledger.setLocalMemberActive({actorId:owner,expectedRevision:1,active:false});
 assert.throws(()=>reserve(budgets),{code:'LOCAL_WRITE_ROLE_REVOKED'});
 await ledger.setLocalMemberActive({actorId:owner,expectedRevision:2,active:true});
 assert.throws(()=>reserve(budgets),{code:'LOCAL_WRITE_ROLE_VERSION_CHANGED'});
 assert.throws(()=>configure(budgets,4000),{code:'LOCAL_WRITE_ROLE_VERSION_CHANGED'});
 assert.equal(budgets.status(owner,tenant).reservedMinor,0);
 assert.equal(reserve(budgets,'q1',1,minor,3).ok,true);
 assert.equal(configure(budgets,4000,3).ok,true);
}));
test('overspend and double reservation are impossible under same SQLite lock',()=>fixture(async({ledger,budgets})=>{
 assert.equal(configure(budgets,2000).ok,true);
 await ledger.approve({id:'q1',actorId:owner,expectedVersion:1,amountMinor:minor});
 await ledger.approve({id:'q2',actorId:owner,expectedVersion:1,amountMinor:minor});
 assert.equal(reserve(budgets,'q1').ok,true);
 assert.equal(reserve(budgets,'q2').reason,'BUDGET_EXCEEDED');
 assert.equal(reserve(budgets,'q1').reason,'ALREADY_RESERVED');
 assert.equal(budgets.history(owner,tenant).length,1);
 assert.equal(budgets.status(owner,tenant).reservedMinor,minor);
}));
test('budget cannot be authorized from unversioned or seller/reviewer grants',()=>fixture(async({ledger,budgets})=>{
 await ledger.approve({id:'q1',actorId:owner,expectedVersion:1,amountMinor:minor});
 assert.throws(()=>budgets.configure(owner,tenant,3000,undefined),
   {code:'TRUSTED_MEMBERSHIP_REVISION_REQUIRED'});
 assert.throws(()=>budgets.reserve({owner,merchant:tenant,quote:'q1',
   version:1,amount:minor,expectedMembershipRevision:undefined}),
   {code:'TRUSTED_MEMBERSHIP_REVISION_REQUIRED'});
 assert.throws(()=>budgets.configure('reviewer',tenant,3000,1),
   {code:'LOCAL_WRITE_ROLE_REVOKED'});
 assert.equal(budgets.status(owner,tenant).configured,false);
}));
test('existing separate-file store remains available and is NOT silently migrated',()=>fixture(async({file,legacy})=>{
 const old=createAgentBudgetStore(legacy);
 try{
  assert.equal(old.configure('old','tenantX',1000).ok,true);
 }finally{old.close();}
 const original=createAgentBudgetStore(legacy);
 try{assert.equal(original.status('old','tenantX').limitMinor,1000);}
 finally{original.close();}
 const fresh=createSqliteLedger({filename:file,enforceLocalMemberWrites:true});
 try{assert.equal(createLedgerAgentBudgetStore(fresh).status(owner,tenant).configured,false);}
 finally{fresh.close();}
}));
