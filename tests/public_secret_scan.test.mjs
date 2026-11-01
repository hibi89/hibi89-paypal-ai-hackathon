// Heuristic secret guard for Git-tracked source OR an unpacked GitHub source ZIP.
// It is NOT a replacement for GitHub secret scanning or live credential audits.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
// These are never present in a GitHub source archive; they are generated locally.
const generatedDirs=new Set(['.git','node_modules','output','.browser-venv',
 '.video-venv','__pycache__']);

function enumeratePublicSource(root){
 if(existsSync(join(root,'.git'))){
  // A real checkout must use the Git index and fail if Git is broken.
  // Never silently downgrade the guard when a checkout cannot be inspected.
  const names=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'})
   .split('\0').filter(Boolean);
  assert.ok(names.length>0,'GIT_SOURCE_INDEX_EMPTY');
  return names;
 }
 // Official GitHub ZIP files have no .git directory. Scan all included source
 // rather than claiming a missing Git index makes the archive unsafe.
 const names=[];
 const visit=(dir)=>{
  for(const entry of readdirSync(join(root,dir),{withFileTypes:true})){
   const rel=join(dir,entry.name);
   if(entry.isSymbolicLink())throw new Error('UNEXPECTED_SOURCE_SYMLINK');
   if(entry.isDirectory()){
    if(dir||!generatedDirs.has(entry.name))visit(rel);
   }else if(entry.isFile()){
    names.push(rel.split(sep).join('/'));
   }else{
    throw new Error('UNKNOWN_SOURCE_ENTRY');
   }
  }
 };
 visit('');
 assert.ok(names.length>0,'SOURCE_ARCHIVE_EMPTY');
 return names.sort();
}

const checks = [
 ['private key header', new RegExp('-----BEGIN ' + '(?:RSA |EC |OPENSSH )?' + 'PRIVATE KEY-----')],
 ['classic GitHub token', new RegExp('gh' + 'p_[A-Za-z0-9]{36}')],
 ['fine-grained GitHub token', new RegExp('github_' + 'pat_[A-Za-z0-9_]{22,}')],
 ['PayPal-style secret literal', new RegExp('(?:client_secret|paypal_client_secret)\\s*[:=]\\s*["\\\'][A-Za-z0-9_-]{25,}["\\\']','i')],
 ['OpenAI-style API key', new RegExp('sk-' + '[A-Za-z0-9_-]{28,}')],
];

test('public source has no recognizable embedded secret signatures (Git or ZIP)',()=>{
 const names=enumeratePublicSource(sourceRoot);
 assert.ok(names.length>20,'must enumerate all publicly shipped repository source');
 const matches=[];
 for(const name of names){
  const content=readFileSync(join(sourceRoot,name),'utf8');
  for(const [label,pattern] of checks){
   if(pattern.test(content))matches.push(name+': '+label);
  }
 }
 assert.deepEqual(matches,[],'potential secrets detected; never log their values');
});

test('GitHub ZIP without .git scans nested included files, not generated output',()=>{
 const root=mkdtempSync(join(tmpdir(),'paypal-public-archive-test-'));
 try{
  mkdirSync(join(root,'src'));
  mkdirSync(join(root,'output'));
  mkdirSync(join(root,'src','output'));
  writeFileSync(join(root,'README.md'),'readme');
  writeFileSync(join(root,'src','nested.mjs'),'source');
  writeFileSync(join(root,'output','generated.txt'),'generated');
  writeFileSync(join(root,'src','output','included.txt'),'included');
  assert.deepEqual(enumeratePublicSource(root),['README.md','src/nested.mjs','src/output/included.txt']);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('ZIP source enumerator fails closed on symbolic links',()=>{
 const root=mkdtempSync(join(tmpdir(),'paypal-public-archive-symlink-'));
 try{
  writeFileSync(join(root,'README.md'),'readme');
  mkdirSync(join(root,'linked-target'));
  writeFileSync(join(root,'linked-target','note.txt'),'note');
  symlinkSync(join(root,'linked-target'),join(root,'source-alias'),
   process.platform==='win32'?'junction':'dir');
  assert.throws(()=>enumeratePublicSource(root),/UNEXPECTED_SOURCE_SYMLINK/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
