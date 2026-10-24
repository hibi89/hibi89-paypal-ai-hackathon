// Offline demonstration ONLY. Synthetic persona on local loopback; not an auth service.
// Never bind public interfaces or use real user/customer data in this server.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteLedger } from './sqlite_ledger.mjs';
import { createQuoteApi } from './quote_api.mjs';
import { createContractApi } from './contract_api.mjs';
import { createOfflineMockDraftProvider } from './quote_draft.mjs';

const html = readFileSync(new URL('../web/offline_demo.html', import.meta.url), 'utf8');
const onlyLoopback = address => address === '127.0.0.1' ||
  address === '::ffff:127.0.0.1';
export async function startOfflineDemo({ port = 0, testReviewSessions = false } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new TypeError('INVALID_LOCAL_PORT');
  const folder = mkdtempSync(join(tmpdir(), 'paypal-local-demo-'));
  const ledger = createSqliteLedger({ filename: join(folder, 'demo.sqlite') });
  const quoteId = 'sample-project';
  const actorId = 'synthetic-owner';
  const reviewerId = 'synthetic-reviewer';
  const reviewerToken = testReviewSessions ? randomBytes(32).toString('hex') : null;
  const reviewerCookie = reviewerToken ? 'paypal_test_review=' + reviewerToken : null;
  const csrfToken = randomBytes(24).toString('base64url');
  await ledger.insertQuote({
    id: quoteId, ownerId: actorId, merchantId: 'synthetic-merchant',
    version: 1, aiSuggestedMinor: null,
  });
  // A reviewer test browser must carry an unguessable server-issued loopback cookie.
  // Any malformed / forged reviewer cookie fails closed. Never accept role headers,
  // query parameters or request JSON as an identity signal.
  const resolveSession = async (request) => {
    const cookies=(request.headers.get('cookie')||'').split(';').map(x=>x.trim());
    const matches=cookies.filter(x=>x.startsWith('paypal_test_review='));
    if(matches.length>0){
      if(matches.length!==1 || !reviewerToken) return null;
      const supplied=matches[0].slice('paypal_test_review='.length);
      if(!/^[a-f0-9]{64}$/.test(supplied)) return null;
      if(!timingSafeEqual(Buffer.from(supplied),Buffer.from(reviewerToken)))return null;
      return {verified:true,actorId:reviewerId,merchantId:'synthetic-merchant',csrfToken};
    }
    return {verified:true,actorId,merchantId:'synthetic-merchant',csrfToken};
  };
  const api = createQuoteApi({
    repository: ledger,
    draftProvider: createOfflineMockDraftProvider(),
    // This is intentionally a fixed synthetic demo session bound to 127.0.0.1.
    // Real deployment MUST replace with a verified identity/CSRF cookie provider.
    resolveSession,
  });
  const contractApi = createContractApi({repository:ledger,resolveSession});
  let server;
  server = createServer(async (req, res) => {
    try {
      const listenPort = server.address().port;
      if (!onlyLoopback(req.socket.remoteAddress) ||
          req.headers.host !== '127.0.0.1:' + listenPort) {
        res.writeHead(403, { 'cache-control': 'no-store' });
        res.end('FORBIDDEN');
        return;
      }
      const path = new URL(req.url, 'http://127.0.0.1:' + listenPort).pathname;
      if (req.method === 'GET' && (path === '/' || path === '/demo')) {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        });
        res.end(html);
        return;
      }
      if (req.method === 'GET' && (path === '/demo/client.js' || path === '/demo/contract.js')) {
        const js = readFileSync(new URL(path === '/demo/client.js' ?
          '../web/demo_client.js' : '../web/contract_client.js', import.meta.url));
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
        });
        res.end(js);
        return;
      }
      if (req.method === 'GET' && path === '/demo/session') {
        const reqSession=await resolveSession(new Request('http://127.0.0.1:'+listenPort+'/demo/session',{headers:req.headers}));
        if(!reqSession){res.writeHead(401,{'cache-control':'no-store'});res.end('UNAUTHORIZED');return;}
        res.writeHead(200, { 'content-type': 'application/json',
          'cache-control': 'no-store' });
        const role=reqSession.actorId===reviewerId?'reviewer':'owner';
        res.end(JSON.stringify({ csrfToken, quoteId, mode: 'OFFLINE_MOCK',
          role,contractId:'demo-contract',milestoneId:'demo-milestone',reviewerId }));
        return;
      }
      if (!path.startsWith('/api/')) {
        res.writeHead(404, { 'cache-control': 'no-store' });
        res.end('NOT_FOUND');
        return;
      }
      // Bounded incoming stream; do not trust Content-Length supplied by caller.
      let bytes=0, chunks=[];
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        for await (const part of req) {
          bytes += part.length;
          if (bytes > 4096) {
            res.writeHead(413, { 'cache-control': 'no-store' });
            res.end(JSON.stringify({error:'BODY_TOO_LARGE'}));
            return;
          }
          chunks.push(part);
        }
      }
      const url = 'http://127.0.0.1:' + listenPort + req.url;
      const options={method:req.method,headers:new Headers(req.headers)};
      if (req.method !== 'GET' && req.method !== 'HEAD')
        options.body=Buffer.concat(chunks);
      const reply=await (path==='/api/contracts'||path.startsWith('/api/contracts/')
        ? contractApi : api)(new Request(url,options));
      res.writeHead(reply.status, Object.fromEntries(reply.headers));
      res.end(await reply.text());
    } catch {
      res.writeHead(500, { 'cache-control': 'no-store' });
      res.end('INTERNAL_ERROR');
    }
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(port,'127.0.0.1',resolve);
    });
  } catch(e) {
    ledger.close();
    rmSync(folder,{recursive:true,force:true});
    throw e;
  }
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    // Accessible only to a local test harness opting into testReviewSessions.
    ...(testReviewSessions ? {testReviewerCookie:reviewerCookie}:{}),
    async close() {
      await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
      ledger.close();
      rmSync(folder,{recursive:true,force:true});
    },
  };
}
