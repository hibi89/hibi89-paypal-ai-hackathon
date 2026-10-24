// PPL-002 Day 1: offline Fetch API. NOT a deployed server, auth provider or PayPal client.
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
  return ['quote', 'approve', 'orders', 'payment', 'draft'].includes(resource)
    ? { id: parts[3], resource } : null;
}

// resolveSession is a TRUSTED server-side session verifier; never read actorId
// or csrfToken from arbitrary browser headers/body. No insecure fallback.
export function createQuoteApi({ repository, resolveSession, draftProvider } = {}) {
  if (!repository || typeof repository.get !== 'function' ||
      typeof repository.approve !== 'function' ||
      typeof resolveSession !== 'function')
    throw new TypeError('TRUSTED_SESSION_AND_REPOSITORY_REQUIRED');
  if (draftProvider !== undefined &&
      (typeof draftProvider !== 'function' || typeof repository.revise !== 'function'))
    throw new TypeError('DRAFT_PROVIDER_AND_REVISION_REPOSITORY_REQUIRED');
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
        // Repo CAS always re-checks version/owner and blocks changes after any payment claim.
        const proposal = await draftProvider({ scope: data.scope, currency: quote.currency });
        fail(!proposal || !Number.isSafeInteger(proposal.suggestedMinor) ||
          proposal.suggestedMinor < 100 || proposal.suggestedMinor > 1000000 ||
          proposal.source !== 'OFFLINE_MOCK',
        'INVALID_DRAFT_PROVIDER_RESULT', 503);
        const revised = await repository.revise({
          id: r.id, actorId: session.actorId, expectedVersion: data.expectedVersion,
          scope: data.scope, suggestedMinor: proposal.suggestedMinor,
          suggestionSource: proposal.source,
        });
        return reply({ quote: revised, provider: 'OFFLINE_MOCK',
          warning: 'Deterministic demonstration only; not a live AI model' });
      }
      const data = await parseSmallJson(request);
      fail(data.confirmed !== true, 'EXPLICIT_CONFIRMATION_REQUIRED');
      fail(!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 1,
        'QUOTE_VERSION_REQUIRED');
      fail(!Number.isSafeInteger(data.amountMinor) ||
        data.amountMinor < 100 || data.amountMinor > 1000000,
      'INVALID_APPROVED_AMOUNT');
      const approved = await repository.approve({
        id: r.id, expectedVersion: data.expectedVersion, actorId: session.actorId,
        amountMinor: data.amountMinor,
      });
      return reply({ quote: approved });
    } catch (error) {
      if (error instanceof QuoteApiError)
        return reply({ error: error.code }, error.status);
      return reply({ error: 'INTERNAL_ERROR' }, 500);
    }
  };
}
