// Heuristic guard for text tracked by Git; NOT a replacement for GitHub secret scanning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const names = execFileSync('git', ['ls-files', '-z'], {encoding:'utf8'})
  .split('\0').filter(Boolean);
const checks = [
  ['private key header', new RegExp('-----BEGIN ' + '(?:RSA |EC |OPENSSH )?' + 'PRIVATE KEY-----')],
  ['classic GitHub token', new RegExp('gh' + 'p_[A-Za-z0-9]{36}')],
  ['fine-grained GitHub token', new RegExp('github_' + 'pat_[A-Za-z0-9_]{22,}')],
  ['PayPal-style secret literal', new RegExp('(?:client_secret|paypal_client_secret)\\s*[:=]\\s*["\\\'][A-Za-z0-9_-]{25,}["\\\']','i')],
  ['OpenAI-style API key', new RegExp('sk-' + '[A-Za-z0-9_-]{28,}')],
];
test('publicly tracked text has no recognizable embedded secret signatures', () => {
  assert.ok(names.length > 20, 'must enumerate actual Git-tracked repository files');
  const matches = [];
  for (const name of names) {
    const text = readFileSync(name, 'utf8');
    for (const [label, pattern] of checks) {
      if (pattern.test(text)) matches.push(name + ': ' + label);
    }
  }
  assert.deepEqual(matches, [], 'potential secrets detected; never log their values');
});
