// Intentionally exits 2 while actual remote evidence is missing.
// Read-only: no Wrangler, Cloudflare, PayPal or AI API calls; no secrets.
import { readFileSync } from 'node:fs';
import { assessHostingPreflight, AUDITED_SOURCES } from '../src/hosting_preflight.mjs';
const sources = Object.fromEntries(AUDITED_SOURCES.map(path=>{
  try { return [path,readFileSync(new URL('../'+path,import.meta.url),'utf8')]; }
  catch { return [path,null]; }
}));
const result=assessHostingPreflight(sources);
console.log(JSON.stringify(result,null,2));
process.exitCode = result.blocked ? 2 : 0;
