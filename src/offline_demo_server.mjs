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
import { createSubscriptionScenarioStore } from './subscription_demo_store.mjs';
import { createSubscriptionDemoApi } from './subscription_demo_api.mjs';
import { evaluateLocalIntegration } from './local_integration_readiness.mjs';
import { createDemoRateLimiter } from './demo_rate_limit.mjs';
import { createPaypalBuyerReturnBoundary } from './paypal_buyer_return_boundary.mjs';
import { createMarketplaceDemoApi } from './marketplace_match.mjs';
import { createMarketplaceRecommendationStore } from './marketplace_recommendation_store.mjs';
import { createLedgerMarketplaceSelectionStore, createMarketplaceSelectionApi } from './marketplace_selection_store.mjs';
import {createMarketplaceIdentityPolicy,createMarketplaceIdentityReadOnlyApi} from './marketplace_identity_policy.mjs';
import {createMarketplaceProtectedReadApi} from './marketplace_protected_read_api.mjs';
import {createLocalAccountAuth} from './local_account_auth.mjs';
import {createInnovationLab,createInnovationApi} from './innovation_lab.mjs';
import {createMarketplaceContractWorkflowApi} from './marketplace_contract_workflow_api.mjs';
import {QuoteApiError,reply} from './quote_api.mjs';
import { createNegotiationDemoApi } from './agent_negotiation_demo_api.mjs';
import { createLedgerAgentBudgetStore } from './agent_budget_store.mjs';
import { createAgentBudgetDemoApi } from './agent_budget_demo_api.mjs';
import { createGithubDeliveryDemoApi } from './github_delivery_demo_api.mjs';
import { createNegotiationRegistry } from './negotiation_registry.mjs';
import { inspectLocalEvidence } from './local_evidence_inspector.mjs';

const html = readFileSync(new URL('../web/offline_demo.html', import.meta.url), 'utf8');
const innovationHtml=readFileSync(new URL('../web/innovation_dashboard.html',import.meta.url),'utf8');
const onlyLoopback = address => address === '127.0.0.1' ||
  address === '::ffff:127.0.0.1';
export async function startOfflineDemo({ port = 0, testReviewSessions = false,
  enableSyntheticReviewer = false, enableSyntheticSeller = false,
  testSellerSessions = false, localLoginPasswords = null } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new TypeError('INVALID_LOCAL_PORT');
  if(localLoginPasswords!==null){
    const keys=enableSyntheticSeller?['buyer','reviewer','seller']:['buyer','reviewer'];
    if(!localLoginPasswords||typeof localLoginPasswords!=='object'||
       Array.isArray(localLoginPasswords)||
       Object.keys(localLoginPasswords).sort().join(',')!==keys.sort().join(',')||
       keys.some(k=>typeof localLoginPasswords[k]!=='string'||
         localLoginPasswords[k].length<12||localLoginPasswords[k].length>256)||
       new Set(keys.map(k=>localLoginPasswords[k])).size!==keys.length)
      throw new TypeError('INVALID_LOCAL_LOGIN_PASSWORDS');
  }
  const folder = mkdtempSync(join(tmpdir(), 'paypal-local-demo-'));
  const demoLedgerPath=join(folder,'demo.sqlite');
  const ledger = createSqliteLedger({ filename:demoLedgerPath,
    enforceLocalMemberWrites:true,allowLocalOwnerDelivery:!enableSyntheticSeller });
  const budgetStore=createLedgerAgentBudgetStore(ledger);
  const innovationLab=createInnovationLab({filename:join(folder,'innovation.sqlite')});
  const marketplaceStore=createMarketplaceRecommendationStore(join(folder,'recommendation_history.sqlite'));
  const selectionStore=createLedgerMarketplaceSelectionStore({recommendations:marketplaceStore,quotes:ledger});
  const subscriptionStore=createSubscriptionScenarioStore({
    filename:join(folder,'subscription_scenarios.sqlite')
  });
  const subscriptionId='synthetic-subscription';
  const quoteId = 'sample-project';
  const actorId = 'synthetic-owner';
  const reviewerId = 'synthetic-reviewer';
  const sellerId='synthetic-seller',sellerProfileId='synthetic-seller-profile';
  const reviewerToken = testReviewSessions || enableSyntheticReviewer || enableSyntheticSeller
    ? randomBytes(32).toString('hex') : null;
  const reviewerCookie = reviewerToken ? 'paypal_test_review=' + reviewerToken : null;
  const sellerToken=enableSyntheticSeller||testSellerSessions?randomBytes(32).toString('hex'):null;
  const sellerCookie=sellerToken?'paypal_test_seller='+sellerToken:null;
  const csrfToken = randomBytes(24).toString('base64url');
  await ledger.insertQuote({
    id: quoteId, ownerId: actorId, merchantId: 'synthetic-merchant',
    version: 1, aiSuggestedMinor: null,
  });
  // A reviewer browser must carry an unguessable server-issued loopback cookie.
  // Any malformed / forged reviewer cookie fails closed. Never accept role headers,
  // query parameters or request JSON as an identity signal.
  let localAuth=null;
  const resolveSession = async (request) => {
    if(localAuth)return localAuth.resolveRequest(request);
    const cookies=(request.headers.get('cookie')||'').split(';').map(x=>x.trim());
    const sellerMatches=cookies.filter(x=>x.startsWith('paypal_test_seller='));
    const matches=cookies.filter(x=>x.startsWith('paypal_test_review='));
    if(sellerMatches.length){
      if(sellerMatches.length!==1||matches.length||!sellerToken)return null;
      const supplied=sellerMatches[0].slice('paypal_test_seller='.length);
      if(!/^[a-f0-9]{64}$/.test(supplied))return null;
      if(!timingSafeEqual(Buffer.from(supplied),Buffer.from(sellerToken)))return null;
      return {verified:true,actorId:sellerId,merchantId:'synthetic-merchant',csrfToken};
    }
    if(matches.length>0){
      if(matches.length!==1 || !reviewerToken) return null;
      const supplied=matches[0].slice('paypal_test_review='.length);
      if(!/^[a-f0-9]{64}$/.test(supplied)) return null;
      if(!timingSafeEqual(Buffer.from(supplied),Buffer.from(reviewerToken)))return null;
      return {verified:true,actorId:reviewerId,merchantId:'synthetic-merchant',csrfToken};
    }
    return {verified:true,actorId,merchantId:'synthetic-merchant',csrfToken};
  };
  await ledger.provisionLocalMember({actorId,merchantId:'synthetic-merchant',role:'buyer'});
  await ledger.provisionLocalMember({actorId:reviewerId,merchantId:'synthetic-merchant',
    role:'reviewer'});
  if(sellerToken)await ledger.provisionLocalMember({actorId:sellerId,
    merchantId:'synthetic-merchant',role:'seller',sellerProfileId});
  if(localLoginPasswords) {
    const accounts=[
      {actorId,merchantId:'synthetic-merchant',password:localLoginPasswords.buyer},
      {actorId:reviewerId,merchantId:'synthetic-merchant',password:localLoginPasswords.reviewer},
      ...(enableSyntheticSeller?[{actorId:sellerId,merchantId:'synthetic-merchant',
        password:localLoginPasswords.seller}]:[])
    ];
    localAuth=createLocalAccountAuth({filename:join(folder,'auth.sqlite'),accounts});
  }
  // FIXED synthetic identity fixture, never from HTTP body or role headers.
  // No seller session or merchant ownership is established by this demo.
  const identityPolicy=createMarketplaceIdentityPolicy({
    resolveTrustedSession:resolveSession,
    resolveMembership:actor=>ledger.getLocalMember(actor)
  });
  const identityApi=createMarketplaceIdentityReadOnlyApi({policy:identityPolicy});
  const protectedReadApi=createMarketplaceProtectedReadApi({policy:identityPolicy,ledger});
  const workflowApi=createMarketplaceContractWorkflowApi({
    ledger,policy:identityPolicy,resolveSession
  });
  const assignSellerApi=async request=>{
    try{
      if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405,{allow:'POST'});
      if(!sellerToken)throw new QuoteApiError('SYNTHETIC_SELLER_DISABLED',404);
      const session=await resolveSession(request);
      if(!session||session.actorId!==actorId)throw new QuoteApiError('OWNER_ONLY',403);
      const url=new URL(request.url);
      if(request.headers.get('origin')!==url.origin||
        request.headers.get('x-csrf-token')!==session.csrfToken)
        throw new QuoteApiError('CSRF_OR_ORIGIN_REQUIRED',403);
      const proof=await identityPolicy.issueProof(request);
      const scope=await ledger.getContractAuthorityResource('demo-contract');
      if(!scope||scope.ownerId!==actorId)throw new QuoteApiError('CONTRACT_NOT_FOUND',404);
      const grant=await identityPolicy.authorize(proof,{action:'contract.read',resource:scope});
      if(grant.actorId!==session.actorId)throw new QuoteApiError('IDENTITY_MISMATCH',403);
      const assigned=await ledger.assignLocalContractSeller({
        contractId:'demo-contract',merchantId:'synthetic-merchant',sellerProfileId
      });
      return reply({assignment:assigned,paymentAuthorized:false});
    }catch(e){
      return reply({error:e instanceof QuoteApiError?e.code:'INTERNAL_ERROR'},
        e instanceof QuoteApiError?e.status:500);
    }
  };
  const api = createQuoteApi({
    repository: ledger,
    draftProvider: createOfflineMockDraftProvider(),
    // This is intentionally a fixed synthetic demo session bound to 127.0.0.1.
    // Real deployment MUST replace with a verified identity/CSRF cookie provider.
    resolveSession,
    identityPolicy,
    assertSelectionBeforeApprove: async ({id,actorId,merchantId,expectedVersion}) =>
      selectionStore.assertCurrent({quoteId:id,ownerId:actorId,merchantId,expectedQuoteVersion:expectedVersion}),
  });
  const contractApi = createContractApi({repository:ledger,resolveSession,
    identityPolicy,allowLegacyOwnerDelivery:!enableSyntheticSeller});
  subscriptionStore.seed({subscriptionId,ownerId:actorId,merchantId:'synthetic-merchant'});
  const subscriptionApi=createSubscriptionDemoApi({
    subscriptionId,store:subscriptionStore,resolveSession,offlineOnly:true
  });
  const checkRate = createDemoRateLimiter();
  const buyerReturn=createPaypalBuyerReturnBoundary();
  const marketplaceApi=createMarketplaceDemoApi({resolveSession,store:marketplaceStore,
    identityPolicy});
  const selectionApi=createMarketplaceSelectionApi({resolveSession,store:selectionStore,
    identityPolicy});
  const negotiationRegistry=createNegotiationRegistry();
  const negotiationApi=createNegotiationDemoApi({resolveSession,repository:ledger,registry:negotiationRegistry,
    identityPolicy});
  const budgetApi=createAgentBudgetDemoApi({resolveSession,quotes:ledger,budgets:budgetStore,registry:negotiationRegistry,
    identityPolicy});
  const githubDeliveryApi=createGithubDeliveryDemoApi({resolveSession});
  const innovationApi=createInnovationApi({store:innovationLab,resolveSession,identityPolicy});
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
      // Reject a burst before allocating JSON buffers, calling session handlers,
      // or touching SQLite. This protects only this single loopback process.
      const rate = checkRate(req.method);
      if (!rate.allowed) {
        res.writeHead(429, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
          'x-content-type-options': 'nosniff',
          'retry-after': String(rate.retryAfterSeconds),
        });
        res.end(JSON.stringify({error: 'LOCAL_RATE_LIMITED'}));
        return;
      }
      const path = new URL(req.url, 'http://127.0.0.1:' + listenPort).pathname;
      if (req.method === 'POST' && path === '/demo/synthetic-role') {
        req.resume();
        const requestOrigin='http://127.0.0.1:'+listenPort;
        const bodyLength=req.headers['content-length'];
        if (localAuth || !(enableSyntheticReviewer || enableSyntheticSeller) || !reviewerToken) {
          res.writeHead(404,{'cache-control':'no-store'});res.end('NOT_FOUND');return;
        }
        if (req.headers.origin!==requestOrigin ||
            req.headers['x-csrf-token']!==csrfToken ||
            req.headers['content-type']!=='application/json' ||
            req.headers['transfer-encoding'] ||
            (bodyLength!==undefined && bodyLength!=='0')) {
          res.writeHead(403,{'cache-control':'no-store'});res.end('FORBIDDEN');return;
        }
        const session=await resolveSession(new Request(requestOrigin+'/demo/synthetic-role',{
          method:'GET',headers:req.headers
        }));
        if(!session || session.verified!==true ||
            ![actorId,reviewerId,...(enableSyntheticSeller?[sellerId]:[])].includes(session.actorId) ||
            session.merchantId!=='synthetic-merchant') {
          res.writeHead(401,{'cache-control':'no-store'});res.end('UNAUTHORIZED');return;
        }
        if(enableSyntheticSeller){
          const toSeller=session.actorId===actorId;
          const toReviewer=session.actorId===sellerId;
          const setCookie=[
            toSeller?sellerCookie+'; HttpOnly; Path=/; SameSite=Strict':
              'paypal_test_seller=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0',
            toReviewer?reviewerCookie+'; HttpOnly; Path=/; SameSite=Strict':
              'paypal_test_review=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'
          ];
          res.writeHead(200,{'cache-control':'no-store',
            'content-type':'application/json; charset=utf-8',
            'set-cookie':setCookie,'x-content-type-options':'nosniff'});
          res.end(JSON.stringify({role:toSeller?'seller':toReviewer?'reviewer':'owner'}));
          return;
        }
        const toReviewer=session.actorId===actorId;
        const setCookie=toReviewer
          ? reviewerCookie+'; HttpOnly; Path=/; SameSite=Strict'
          : 'paypal_test_review=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0';
        res.writeHead(200,{'cache-control':'no-store',
          'content-type':'application/json; charset=utf-8',
          'set-cookie':setCookie,'x-content-type-options':'nosniff'});
        res.end(JSON.stringify({role:toReviewer?'reviewer':'owner'}));
        return;
      }
      // Sandbox buyer return and cancellation are informational GET landings.
      // No approved checkout, account session or PayPal API is available in
      // the offline demo; ignore all token/PayerID/status query data.
      if (path === '/checkout/paypal/return' ||
          path === '/checkout/paypal/cancel') {
        const response=await buyerReturn.handle(new Request(
          'http://127.0.0.1:'+listenPort+req.url,{
            method:req.method,headers:new Headers(req.headers)
          }));
        res.writeHead(response.status,Object.fromEntries(response.headers));
        res.end(await response.text());
        return;
      }
      if (req.method === 'GET' && path === '/demo/innovation') {
        res.writeHead(200,{
          'content-type':'text/html; charset=utf-8','cache-control':'no-store',
          'x-content-type-options':'nosniff',
          'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        });res.end(innovationHtml);return;
      }
      if (req.method==='GET'&&path==='/demo/innovation.js'){
        res.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
          'cache-control':'no-store','x-content-type-options':'nosniff'});
        res.end(readFileSync(new URL('../web/innovation_dashboard.js',import.meta.url)));return;
      }
      if (req.method === 'GET' && (path === '/' || path === '/demo')) {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        });
        res.end(html);
        return;
      }
      if (req.method === 'GET' && (path === '/demo/client.js' || path === '/demo/contract.js' || path === '/demo/subscription.js' || path === '/demo/integration.js' || path === '/demo/marketplace.js' || path === '/demo/agent-budget.js' || path === '/demo/github-delivery.js' || path === '/demo/evidence.js')) {
        const js = readFileSync(new URL(
          path === '/demo/client.js' ? '../web/demo_client.js' :
          path === '/demo/contract.js' ? '../web/contract_client.js' :
          path === '/demo/subscription.js' ? '../web/subscription_client.js' :
          path === '/demo/marketplace.js' ? '../web/marketplace_client.js' :
          path === '/demo/agent-budget.js' ? '../web/agent_budget_client.js' :
          path === '/demo/github-delivery.js' ? '../web/github_delivery_client.js' :
          path === '/demo/evidence.js' ? '../web/evidence_client.js' :
          '../web/integration_client.js', import.meta.url));
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
        const role=reqSession.actorId===reviewerId?'reviewer':reqSession.actorId===sellerId?'seller':'owner';
        res.end(JSON.stringify({ csrfToken:reqSession.csrfToken, quoteId, mode: 'OFFLINE_MOCK',
          role,contractId:'demo-contract',milestoneId:'demo-milestone',reviewerId,
          subscriptionId,syntheticReviewerEnabled:enableSyntheticReviewer||enableSyntheticSeller,
          syntheticSellerEnabled:enableSyntheticSeller }));
        return;
      }
      // Owner-scoped read-only evidence; no PayPal API, mutation or provider authority.
      if (path === '/api/demo/evidence') {
        if (req.method !== 'GET') {
          res.writeHead(405,{'cache-control':'no-store',
            'content-type':'application/json','allow':'GET'});
          res.end(JSON.stringify({error:'METHOD_NOT_ALLOWED'}));
          return;
        }
        const session=await resolveSession(new Request(
          'http://127.0.0.1:'+listenPort+'/api/demo/evidence',{headers:req.headers}));
        if (!session || session.verified!==true ||
            session.actorId!==actorId || session.merchantId!=='synthetic-merchant') {
          res.writeHead(404,{'cache-control':'no-store',
            'content-type':'application/json','x-content-type-options':'nosniff'});
          res.end(JSON.stringify({error:'EVIDENCE_NOT_FOUND'}));
          return;
        }
        let evidence;
        try {
          evidence=inspectLocalEvidence({
            filename:demoLedgerPath,actorId:session.actorId,merchantId:session.merchantId
          });
        } catch {
          res.writeHead(503,{'cache-control':'no-store',
            'content-type':'application/json','x-content-type-options':'nosniff'});
          res.end(JSON.stringify({error:'EVIDENCE_UNAVAILABLE'}));
          return;
        }
        res.writeHead(200,{'cache-control':'no-store',
          'content-type':'application/json','x-content-type-options':'nosniff'});
        res.end(JSON.stringify(evidence));
        return;
      }
      // Read-only same-origin integration projection. Never route to PayPal.
      if (path === '/api/demo/integration') {
        if (req.method !== 'GET') {
          res.writeHead(405,{'cache-control':'no-store',
            'content-type':'application/json','allow':'GET'});
          res.end(JSON.stringify({error:'METHOD_NOT_ALLOWED'}));
          return;
        }
        const session=await resolveSession(
          new Request('http://127.0.0.1:'+listenPort+'/api/demo/integration',
            {headers:req.headers}));
        if(!session || session.verified!==true ||
          session.actorId!==actorId ||
          session.merchantId!=='synthetic-merchant') {
          res.writeHead(404,{'cache-control':'no-store','content-type':'application/json'});
          res.end(JSON.stringify({error:'INTEGRATION_NOT_FOUND'}));
          return;
        }
        const quote=await ledger.get(quoteId);
        let contract=null;
        try {contract=await ledger.getContract({contractId:'demo-contract',
          actorId:session.actorId,merchantId:session.merchantId});}
        catch(e){if(e?.code!=='CONTRACT_NOT_FOUND')throw e;}
        const subscription=subscriptionStore.get({
          subscriptionId,actorId:session.actorId,merchantId:session.merchantId});
        const result=evaluateLocalIntegration({quote,contract,subscription});
        res.writeHead(200,{'cache-control':'no-store',
          'content-type':'application/json','x-content-type-options':'nosniff'});
        res.end(JSON.stringify(result));
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
      const handler=path.startsWith('/api/demo/auth/') ?
        (localAuth?localAuth.handleApi:()=>reply({error:'NOT_FOUND'},404)) :
        path.startsWith('/api/demo/innovation/') ? innovationApi :
        path==='/api/demo/workflow/assign-seller' ? assignSellerApi :
        path.startsWith('/api/demo/workflow/contracts/') ? workflowApi :
        path.startsWith('/api/demo/protected/') ? protectedReadApi :
        path==='/api/demo/identity' ? identityApi :
        path==='/api/demo/github-delivery' ? githubDeliveryApi :
        path.startsWith('/api/demo/budget/') ? budgetApi :
        path==='/api/demo/negotiate' ? negotiationApi :
        path==='/api/demo/marketplace/selection' ? selectionApi :
        path==='/api/demo/marketplace'||path==='/api/demo/marketplace/next'||
         path==='/api/demo/marketplace/history' ? marketplaceApi :
        path==='/api/contracts'||path.startsWith('/api/contracts/')
        ? contractApi : path==='/api/demo/subscription'||
          path.startsWith('/api/demo/subscription/')
          ? subscriptionApi : api;
      const reply=await handler(new Request(url,options));
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
    localAuth?.close();
    innovationLab.close();
    subscriptionStore.close();
    budgetStore.close();
    selectionStore.close();
    marketplaceStore.close();
    ledger.close();
    rmSync(folder,{recursive:true,force:true});
    throw e;
  }
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    // Accessible only to a local test harness opting into testReviewSessions.
    ...(testReviewSessions && !localAuth ? {testReviewerCookie:reviewerCookie}:{}),
    ...(testSellerSessions && !localAuth ? {testSellerCookie:sellerCookie}:{}),
    async close() {
      await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
      localAuth?.close();
      innovationLab.close();
      subscriptionStore.close();
      budgetStore.close();
      selectionStore.close();
      marketplaceStore.close();
      ledger.close();
      rmSync(folder,{recursive:true,force:true});
    },
  };
}
