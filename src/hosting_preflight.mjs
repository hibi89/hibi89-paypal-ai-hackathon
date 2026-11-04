// D15 static read-only inventory. NOT a production deploy check or a credential verifier.
// No network calls or runtime decisions about payment eligibility.
export const AUDITED_SOURCES = Object.freeze([
  'src/offline_demo_server.mjs',
  'src/sqlite_ledger.mjs',
  'src/subscription_demo_store.mjs',
  'src/demo_rate_limit.mjs',
  'src/quote_draft.mjs',
  'src/quote_api.mjs',
]);
const make = (code, path, detail) => Object.freeze({code,path,detail});

export function assessHostingPreflight(sources = {}) {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources))
    throw new TypeError('INVALID_SOURCE_MAP');
  const blockers = [];
  const read = (path) => {
    if (typeof sources[path] !== 'string' || sources[path].length === 0) {
      blockers.push(make('SOURCE_NOT_VERIFIED',path,'Required source text unavailable'));
      return '';
    }
    return sources[path];
  };
  const server=read('src/offline_demo_server.mjs');
  const ledger=read('src/sqlite_ledger.mjs');
  const subs=read('src/subscription_demo_store.mjs');
  const rate=read('src/demo_rate_limit.mjs');
  const ai=read('src/quote_draft.mjs');
  const quote=read('src/quote_api.mjs');

  if (/server\.listen\s*\(/.test(server) || /127\.0\.0\.1/.test(server))
    blockers.push(make('LOOPBACK_NODE_HTTP','src/offline_demo_server.mjs',
      'Node server.listen and explicit loopback binding: not a public Worker entrypoint'));
  if (/synthetic-owner|OFFLINE_MOCK|synthetic-reviewer/.test(server))
    blockers.push(make('SYNTHETIC_IDENTITY','src/offline_demo_server.mjs',
      'Fixed synthetic identity does not authenticate real reviewers'));
  if (/DatabaseSync/.test(ledger) || /BEGIN IMMEDIATE/.test(ledger))
    blockers.push(make('DISK_SQLITE_LEDGER','src/sqlite_ledger.mjs',
      'On-disk Node SQLite and synchronous transaction; D1 binding adapter unimplemented'));
  if (/DatabaseSync/.test(subs) || /OFFLINE_SCENARIO/.test(subs))
    blockers.push(make('DEMO_SUBSCRIPTION_ONLY','src/subscription_demo_store.mjs',
      'Disk-backed synthetic subscription is not a PayPal subscription'));
  if (/const buckets\s*=/.test(rate))
    blockers.push(make('PROCESS_LOCAL_LIMIT','src/demo_rate_limit.mjs',
      'In-memory rate budget is not shared across Worker isolates'));
  if (/OFFLINE_MOCK/.test(ai))
    blockers.push(make('MOCK_AI_ONLY','src/quote_draft.mjs',
      'Deterministic suggestion is not an external AI call'));
  if (/PAYMENT_GATE_NOT_READY/.test(quote))
    blockers.push(make('PAYMENT_POST_DISABLED','src/quote_api.mjs',
      'HTTP orders endpoint intentionally returns 503, no Sandbox capture'));

  // Source inspection alone cannot certify third-party account, security, live URL
  // or permission. These gates always remain open until separately documented.
  blockers.push(make('AUTHORIZATION_REQUIRED',null,
    'Owner approval for external accounts, hosting, credential transfer and publicity not evidenced'));
  blockers.push(make('REMOTE_PROOF_REQUIRED',null,
    'No production URL/HTTP, browser, D1 persistence, real PayPal or real AI proof supplied'));
  const unique = Array.from(new Map(blockers.map(b=>[b.code,b])).values());
  return Object.freeze({
    status:'DEPLOYMENT_BLOCKED',
    mode:'STATIC_SOURCE_REVIEW_ONLY',
    blocked:true,
    mayDeploy:false,
    blockers:Object.freeze(unique),
    external:{account:'NOT_TESTED',freeTier:'NOT_TESTED',credentials:'NOT_CONFIGURED',
      auth:'NOT_CONFIGURED',D1:'NOT_TESTED',productionUrl:'NOT_TESTED',
      realPayPal:'NOT_TESTED',realAI:'NOT_TESTED'},
  });
}
