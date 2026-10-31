// PPL-002 Day 1: offline Fetch API. NOT a deployed server, auth provider or PayPal client.
// Legacy Gemini PRICE experiments are opt-in only; contest AI matches skills instead.
import {createHash} from 'node:crypto';
import { approvedAmount, ContractError } from './payment_contract.mjs';

export class QuoteApiError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'QuoteApiError';
    this.code = code;
    this.status = status;
  }
}
const fail = (condition, code, status = 400) => {
  if (condition) throw new QuoteApiError(code, status);
};
const clone = value => structuredClone(value);
function validateQuote(q) {
  fail(!q || typeof q !== 'object' || Array.isArray(q) ||
    typeof q.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(q.id) ||
    typeof q.ownerId !== 'string' || !q.ownerId ||
    !Number.isSafeInteger(q.version) || q.version < 1 ||
    !['PROPOSED', 'APPROVED'].includes(q.status), 'INVALID_QUOTE');
  fail(q.currency !== 'USD', 'UNSUPPORTED_CURRENCY');
  if (q.status === 'APPROVED') {
    fail(!q.approval || q.approval.actorId !== q.ownerId, 'INVALID_APPROVAL');
    try { approvedAmount(q); }
    catch { throw new QuoteApiError('INVALID_APPROVAL'); }
  } else fail(q.approval !== null && q.approval !== undefined, 'INVALID_PROPOSAL');
  fail(q.rejection != null && (q.status !== 'PROPOSED' ||
    q.rejection.actorId !== q.ownerId || q.rejection.quoteVersion !== q.version ||
    typeof q.rejection.reason !== 'string' || q.rejection.reason.length < 3 ||
    q.rejection.reason.length > 500), 'INVALID_REJECTION');
}

// Single-process, ephemeral fixture. A database CAS/UNIQUE adapter is mandatory before payments.
export function createMemoryQuoteRepository(quotes = []) {
  const rows = new Map();
  for (const original of quotes) {
    validateQuote(original);
    fail(rows.has(original.id), 'DUPLICATE_QUOTE_ID');
    rows.set(original.id, clone(original));
  }
  return {
    async get(id) {
      const record = rows.get(id);
      return record ? clone(record) : null;
    },
    async approve({ id, actorId, expectedVersion, amountMinor }) {
      const current = rows.get(id);
      fail(!current || current.ownerId !== actorId, 'QUOTE_NOT_FOUND', 404);
      fail(current.version !== expectedVersion, 'STALE_QUOTE_VERSION', 409);
      fail(current.status !== 'PROPOSED', 'QUOTE_ALREADY_APPROVED', 409);
      fail(!!current.rejection, 'QUOTE_REJECTED', 409);
      const next = {
        ...current, status: 'APPROVED',
        approval: { decision: 'APPROVED', actorId, quoteVersion: current.version,
          amountMinor },
      };
      try { approvedAmount(next); }
      catch (error) {
        if (error instanceof ContractError) throw new QuoteApiError(error.code);
        throw error;
      }
      rows.set(id, clone(next));
      return clone(next);
    },
    async reject({ id, actorId, expectedVersion, reason }) {
      const current = rows.get(id);
      fail(!current || current.ownerId !== actorId, 'QUOTE_NOT_FOUND', 404);
      fail(current.version !== expectedVersion, 'STALE_QUOTE_VERSION', 409);
      fail(current.status !== 'PROPOSED' || current.rejection, 'QUOTE_NOT_REJECTABLE', 409);
      const next = {...current, rejection:{decision:'REJECTED',actorId,
        quoteVersion:current.version,reason}};
      validateQuote(next);
      rows.set(id, clone(next));
      return clone(next);
    },
  };
}
export function reply(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff', ...headers,
    },
  });
}
export async function parseSmallJson(request) {
  fail(!/^application\/json(?:\s*;|$)/i.test(
    request.headers.get('content-type') || ''), 'JSON_CONTENT_TYPE_REQUIRED', 415);
  const reader = request.body?.getReader();
  fail(!reader, 'JSON_BODY_REQUIRED');
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new QuoteApiError('BODY_TOO_LARGE', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    fail(!body || typeof body !== 'object' || Array.isArray(body),
      'JSON_OBJECT_REQUIRED');
    return body;
  } catch (error) {
    if (error instanceof QuoteApiError) throw error;
    throw new QuoteApiError('INVALID_JSON');
  }
}
function route(path) {
  const parts = path.split('/');
  if (![4, 5].includes(parts.length) ||
      parts[1] !== 'api' || parts[2] !== 'quotes' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(parts[3])) return null;
  const resource = parts[4] || 'quote';
  return ['quote', 'approve', 'reject', 'orders', 'payment', 'draft'].includes(resource)
    ? { id: parts[3], resource } : null;
}

// resolveSession is a TRUSTED server-side session verifier; never read actorId
// or csrfToken from arbitrary browser headers/body. No insecure fallback.
export function createQuoteApi({ repository, resolveSession, draftProvider,
  authorizeExternalAi, allowAiPricingExperiment=false,
  assertSelectionBeforeApprove, identityPolicy } = {}) {
  if (!repository || typeof repository.get !== 'function' ||
      typeof repository.approve !== 'function' ||
      typeof resolveSession !== 'function')
    throw new TypeError('TRUSTED_SESSION_AND_REPOSITORY_REQUIRED');
  if(identityPolicy!==undefined&&(
      typeof identityPolicy.issueProof!=='function'||
      typeof identityPolicy.authorize!=='function'||
      typeof repository.getQuoteAuthorityResource!=='function'))
    throw new TypeError('TRUSTED_QUOTE_ROLE_POLICY_REQUIRED');
  if(assertSelectionBeforeApprove!==undefined && typeof assertSelectionBeforeApprove!=='function')
    throw new TypeError('INVALID_SELECTION_APPROVAL_GUARD');
  if (draftProvider !== undefined &&
      (typeof draftProvider !== 'function' || typeof repository.revise !== 'function'))
    throw new TypeError('DRAFT_PROVIDER_AND_REVISION_REPOSITORY_REQUIRED');
  if(draftProvider?.requiresExternalConsent===true &&
     (typeof repository.claimAiDraft!=='function'||
      typeof repository.markAiDraftUnknown!=='function'))
    throw new TypeError('DURABLE_AI_RESERVATION_REPOSITORY_REQUIRED');
  // An AI-generated price is NOT part of the contest-submission skill matching.
  // Preserve the legacy experimental path, but reject unapproved activation.
  if(draftProvider?.requiresExternalConsent===true &&
     (allowAiPricingExperiment!==true||typeof authorizeExternalAi!=='function'))
    throw new TypeError('LEGACY_AI_PRICE_DRAFT_EXPLICIT_HOST_GATE_REQUIRED');
  return async function handleQuoteRequest(request) {
    try {
      if (!(request instanceof Request))
        throw new QuoteApiError('REQUEST_REQUIRED');
      const url = new URL(request.url);
      if (url.pathname === '/api/health' && request.method === 'GET')
        return reply({ status: 'OFFLINE_ONLY', payment: 'NOT_CONFIGURED' });
      const r = route(url.pathname);
      fail(!r, 'NOT_FOUND', 404);
      const allowed = ['quote', 'payment'].includes(r.resource) ? 'GET' : 'POST';
      if (request.method !== allowed)
        return reply({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: allowed });
      const session = await resolveSession(request);
      fail(!session || session.verified !== true ||
        typeof session.actorId !== 'string' || !session.actorId,
      'AUTHENTICATION_REQUIRED', 401);
      if (allowed === 'POST') {
        const origin = request.headers.get('origin');
        fail(origin !== null && origin !== url.origin, 'ORIGIN_MISMATCH', 403);
        fail(typeof session.csrfToken !== 'string' || !session.csrfToken ||
          session.csrfToken !== request.headers.get('x-csrf-token'), 'CSRF_REQUIRED', 403);
      }
      const quote = await repository.get(r.id);
      // 404 for foreign actors prevents quote-id enumeration.
      fail(!quote || quote.ownerId !== session.actorId, 'QUOTE_NOT_FOUND', 404);
      validateQuote(quote);
      let expectedMembershipRevision;
      if(identityPolicy){
        const grant=await identityPolicy.authorize(
          await identityPolicy.issueProof(request),{
            action:({approve:'quote.approve',reject:'quote.reject',
              draft:'quote.draft'}[r.resource]||'quote.read'),
            resource:await repository.getQuoteAuthorityResource(r.id)
          });
        fail(grant.actorId!==session.actorId||grant.merchantId!==session.merchantId,
          'TRUSTED_IDENTITY_MISMATCH',403);
        expectedMembershipRevision=grant.membershipRevision;
      }
      if (r.resource === 'quote') return reply({ quote });
      if (r.resource === 'payment')
        return reply({ error: 'PERSISTENT_PAYMENT_LEDGER_NOT_READY' }, 503);
      if (r.resource === 'orders') {
        fail(quote.status !== 'APPROVED', 'HUMAN_APPROVAL_REQUIRED', 409);
        try { approvedAmount(quote); }
        catch { throw new QuoteApiError('HUMAN_APPROVAL_REQUIRED', 409); }
        // Deliberately no outbound HTTP until DB uniqueness/idempotency is built.
        return reply({ error: 'PAYMENT_GATE_NOT_READY' }, 503);
      }
      if (r.resource === 'draft') {
        // Live AI access is not implied: provider supplies its own explicit origin label.
        fail(!draftProvider, 'DRAFT_PROVIDER_NOT_CONFIGURED', 503);
        const data = await parseSmallJson(request);
        fail(!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 1,
          'QUOTE_VERSION_REQUIRED');
        fail(typeof data.scope !== 'string' || data.scope.length < 8 ||
          data.scope.length > 500 || /[\u0000-\u0008\u000b-\u001f]/.test(data.scope),
        'INVALID_SCOPE');
        const externalAI = draftProvider.requiresExternalConsent === true;
        fail(externalAI && data.externalAiConsent !== true,
          'EXTERNAL_AI_CONSENT_REQUIRED',403);
        // Real-host approval is separate from the browser's untrusted consent
        // flag. Neither the legacy price proposal nor AI text may authorize pay.
        const revalidateExternalAi=async()=>{
          const currentSession=await resolveSession(request);
          fail(!currentSession||currentSession.verified!==true||
            currentSession.actorId!==session.actorId||
            currentSession.merchantId!==quote.merchantId||
            currentSession.csrfToken!==request.headers.get('x-csrf-token'),
            'EXTERNAL_AI_SESSION_CHANGED',403);
          const currentQuote=await repository.get(r.id);
          fail(!currentQuote||currentQuote.id!==quote.id||
            currentQuote.ownerId!==quote.ownerId||
            currentQuote.merchantId!==quote.merchantId||
            currentQuote.currency!==quote.currency||
            currentQuote.status!=='PROPOSED'||
            currentQuote.version!==data.expectedVersion,
            'EXTERNAL_AI_QUOTE_CHANGED',409);
        };
        if(externalAI){
          fail(session.merchantId!==quote.merchantId,
            'EXTERNAL_AI_MERCHANT_REQUIRED',403);
          const permitted=await authorizeExternalAi(Object.freeze({
            action:'LEGACY_AI_PRICE_DRAFT_ONCE',quoteId:r.id,
            quoteVersion:data.expectedVersion,actorId:session.actorId,
            merchantId:quote.merchantId,
            scopeHash:createHash('sha256').update(data.scope).digest('hex')
          }));
          fail(permitted!==true,'TRUSTED_EXTERNAL_AI_APPROVAL_REQUIRED',403);
          await revalidateExternalAi();
        }
        // Durable one-shot CAS/finite budget, performed before any third-party call.
        const claimArgs={id:r.id,actorId:session.actorId,
          expectedVersion:data.expectedVersion,expectedMembershipRevision};
        if(externalAI)await repository.claimAiDraft(claimArgs);
        try{
          // A durable claim can await SQLite. Revocation after that claim must
          // consume the reservation as UNKNOWN and never contact Gemini.
          if(externalAI)await revalidateExternalAi();
          let proposal;
          try{proposal=await draftProvider({scope:data.scope,currency:quote.currency});}
          catch{throw new QuoteApiError('DRAFT_PROVIDER_UNAVAILABLE',503);}
          const expectedSource=externalAI?'GEMINI_API':'OFFLINE_MOCK';
          fail(!proposal || !Number.isSafeInteger(proposal.suggestedMinor) ||
            proposal.suggestedMinor < 100 || proposal.suggestedMinor > 1000000 ||
            proposal.source!==expectedSource,'INVALID_DRAFT_PROVIDER_RESULT',503);
          const revised=await repository.revise({
            id:r.id,actorId:session.actorId,expectedVersion:data.expectedVersion,
            scope:data.scope,suggestedMinor:proposal.suggestedMinor,
            suggestionSource:proposal.source,expectedMembershipRevision,
          });
          return reply({quote:revised,provider:expectedSource,
            warning:externalAI?'AI estimate only; human approval required before payment':
              'Deterministic demonstration only; not a live AI model'});
        }catch(error){
          if(externalAI){
            // Once the call may have started, NEVER release its durable reservation.
            try{await repository.markAiDraftUnknown(claimArgs);}catch{}
          }
          throw error;
        }
      }
      const data = await parseSmallJson(request);
      if (r.resource === 'reject') {
        fail(typeof repository.reject !== 'function','QUOTE_REJECTION_NOT_CONFIGURED',503);
        fail(!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 1,
          'QUOTE_VERSION_REQUIRED');
        fail(typeof data.reason !== 'string' || data.reason.trim().length < 3 ||
          data.reason.trim().length > 500 || /[\u0000-\u0008\u000b-\u001f]/.test(data.reason),
        'INVALID_REJECTION_REASON');
        return reply({quote:await repository.reject({id:r.id,actorId:session.actorId,
          expectedVersion:data.expectedVersion,reason:data.reason.trim(),
          expectedMembershipRevision})});
      }
      fail(data.confirmed !== true, 'EXPLICIT_CONFIRMATION_REQUIRED');
      fail(!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 1,
        'QUOTE_VERSION_REQUIRED');
      fail(!Number.isSafeInteger(data.amountMinor) ||
        data.amountMinor < 100 || data.amountMinor > 1000000,
      'INVALID_APPROVED_AMOUNT');
      if(assertSelectionBeforeApprove)await assertSelectionBeforeApprove({
        id:r.id,actorId:session.actorId,merchantId:session.merchantId,
        expectedVersion:data.expectedVersion
      });
      const approved = await repository.approve({
        id: r.id, expectedVersion: data.expectedVersion, actorId: session.actorId,
        amountMinor: data.amountMinor,expectedMembershipRevision,
      });
      return reply({ quote: approved });
    } catch (error) {
      if (error instanceof QuoteApiError)
        return reply({ error: error.code }, error.status);
      return reply({ error: 'INTERNAL_ERROR' }, 500);
    }
  };
}

