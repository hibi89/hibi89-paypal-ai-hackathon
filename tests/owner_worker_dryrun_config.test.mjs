import test from 'node:test';
import assert from 'node:assert/strict';
import {makePrivateWorkerDryRunConfig}
 from '../scripts/check_owner_worker_bundle_dryrun.mjs';
test('owner Worker bundle dry-run manifest is inert, with real entrypoint and zero deployment targets',()=>{
 const c=makePrivateWorkerDryRunConfig();
 assert.equal(c.main,'src/worker_private_identity_host.mjs');
 assert.equal(c.workers_dev,false);
 assert.equal(c.compatibility_date,'2026-10-01');
 assert.equal(c.upload_source_maps,false);
 for(const field of ['vars','env','route','routes','triggers','durable_objects','secrets','assets'])
  assert.equal(Object.hasOwn(c,field),false,field);
 assert.equal(c.d1_databases.length,1);
 assert.equal(c.d1_databases[0].binding,'DB');
 assert.equal(c.d1_databases[0].database_id,'00000000-0000-4000-8000-000000000001');
 assert.equal(c.d1_databases[0].migrations_dir,'migrations/d1');
 assert.equal(c.ratelimits.length,1);
 assert.equal(c.ratelimits[0].name,'PRIVATE_IDENTITY_RATE_LIMITER');
 assert.equal(c.ratelimits[0].namespace_id,'950513');
 assert.equal(c.ratelimits[0].simple.limit,20);
 assert.equal(c.ratelimits[0].simple.period,60);
 assert.ok(!JSON.stringify(c).includes('OWNER_APPROVED_'));
 assert.ok(!JSON.stringify(c).includes('PRIVATE_IDENTITY_CLIENT_SECRET'));
});
