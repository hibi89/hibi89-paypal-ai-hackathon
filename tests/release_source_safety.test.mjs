import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evaluateTrackedSource,inspectReleaseSource} from '../scripts/release_source_safety.mjs';
const withTmp=(fn)=>()=>{
 const root=mkdtempSync(join(tmpdir(),'worknova-release-safety-'));
 try{return fn(root)}finally{rmSync(root,{recursive:true,force:true})}
};
test('ordinary public code and MIT license pass without a provider request',withTmp(root=>{
 writeFileSync(join(root,'LICENSE'),'MIT License\n');
 writeFileSync(join(root,'app.mjs'),"export const apiKey = process.env.GEMINI_API_KEY;\n");
 const result=evaluateTrackedSource(root,['LICENSE','app.mjs']);
 assert.equal(result.status,'RELEASE_SOURCE_SCAN_PASS');
 assert.equal(result.filesScanned,2);
 assert.equal(result.providerRequests,0);
 assert.equal(result.ownerReleaseAuthorized,false);
}));
test('private database and media filenames fail closed',withTmp(root=>{
 for(const p of ['checkout.sqlite','film.mp4','.env','backup.zip'])writeFileSync(join(root,p),'fixture');
 const z=evaluateTrackedSource(root,['checkout.sqlite','film.mp4','.env','backup.zip']);
 assert.equal(z.status,'RELEASE_SOURCE_SCAN_BLOCKED');
 assert.equal(z.findings.length,4);
 assert.ok(z.findings.every(f=>f.code==='RESTRICTED_FILE_NAME'));
}));
test('secret-shaped real token is classified without leaking its value',withTmp(root=>{
 const key='AIza'+('A'.repeat(35));
 writeFileSync(join(root,'accidental.js'),'const value = '+JSON.stringify(key));
 const result=evaluateTrackedSource(root,['accidental.js']);
 assert.equal(result.status,'RELEASE_SOURCE_SCAN_BLOCKED');
 assert.ok(result.findings.some(x=>x.code==='GOOGLE_API_KEY'));
 assert.equal(JSON.stringify(result).includes(key),false);
}));
test('literal API secrets fail and fixtures are not accidentally reported',withTmp(root=>{
 writeFileSync(join(root,'bad.txt'),"GEMINI_API_KEY = '"+'Z'.repeat(40)+"'");
 writeFileSync(join(root,'fake.txt'),"GEMINI_API_KEY = 'SENTINEL_NOT_REAL_API_KEY_123456789'");
 const a=evaluateTrackedSource(root,['bad.txt']);
 const b=evaluateTrackedSource(root,['fake.txt']);
 assert.ok(a.findings.some(x=>x.code==='HARD_CODED_API_SECRET_LITERAL'));
 assert.equal(b.status,'RELEASE_SOURCE_SCAN_PASS');
}));
test('relative path traversal and symlink are rejected without reading outside root',withTmp(root=>{
 writeFileSync(join(root,'safe.txt'),'hello');
 const z=evaluateTrackedSource(root,['../file','safe.txt']);
 assert.equal(z.status,'RELEASE_SOURCE_SCAN_BLOCKED');
 assert.equal(z.filesScanned,1);
 assert.ok(z.findings.some(f=>f.code==='UNSAFE_TRACKED_PATH'));
}));
test('missing Git index returns blocked instead of invented success',withTmp(root=>{
 const z=inspectReleaseSource(root);
 assert.equal(z.status,'RELEASE_SOURCE_SCAN_BLOCKED');
 assert.equal(z.providerRequests,0);
}));
test('empty manifest and binary source cannot be considered verified',withTmp(root=>{
 assert.equal(evaluateTrackedSource(root,[]).status,'RELEASE_SOURCE_SCAN_BLOCKED');
 writeFileSync(join(root,'blob.dat'),Buffer.from([1,0,2]));
 const z=evaluateTrackedSource(root,['blob.dat']);
 assert.ok(z.findings.some(x=>x.code==='BINARY_TRACKED_FILE'));
}));
test('same tracked path counted once, with no raw findings text',withTmp(root=>{
 writeFileSync(join(root,'README.md'),'public description');
 const z=evaluateTrackedSource(root,['README.md','README.md']);
 assert.equal(z.status,'RELEASE_SOURCE_SCAN_PASS');
 assert.equal(z.filesScanned,1);
 assert.equal(z.trackedPaths,2);
}));
