import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);

test('approved root MIT license contains the complete attribution and required grant', () => {
  const file = readFileSync(new URL('LICENSE', root), 'utf8');
  assert.match(file, /^MIT License\n\nCopyright \(c\) 2026 hibi89\n/);
  assert.match(file, /Permission is hereby granted, free of charge/);
  assert.match(file, /to use, copy, modify, merge, publish, distribute, sublicense, and\/or sell/);
  assert.match(file, /The above copyright notice and this permission notice shall be included/);
  assert.match(file, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND/);
  assert.match(file, /SOFTWARE\.\n?$/);
  assert.doesNotMatch(file, /\[(?:year|fullname)\]/);
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.license, 'MIT');
});
