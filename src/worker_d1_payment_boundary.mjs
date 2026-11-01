// Cloudflare Worker-compatible, INTERNAL-ONLY D1 boundary. No node:* imports,
// HTTP route, OAuth, PayPal provider, AI transport or automatic payment action.
// DO NOT expose this module to public requests until a real issuer/JWKS-backed
// verified server session is independently integrated and authorized.
import {claimD1OperationOnce} from './d1_claim.mjs';
import {createD1RecoveryBoundary} from './d1_recovery.mjs';

export class WorkerD1BoundaryError extends Error {
  constructor(code) {super(code);this.name='WorkerD1BoundaryError';this.code=code;}
}
const fail=(bad,code)=>{if(bad)throw new WorkerD1BoundaryError(code);};
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);

// The resolveVerifiedPrincipal callback MUST be implemented by a server-side
// IdP/JWKS-backed session verifier. User JSON, role headers and "verified:true"
// objects from the browser MUST NOT be passed directly as verified principals.
export function createWorkerD1PaymentBoundary({db,resolveVerifiedPrincipal}={}) {
  fail(!db||typeof db.withSession!=='function','D1_SESSION_BINDING_REQUIRED');
  fail(typeof resolveVerifiedPrincipal!=='function','VERIFIED_IDENTITY_RESOLVER_REQUIRED');

  async function context(request) {
    let identity;
    try {identity=await resolveVerifiedPrincipal(request);}
    catch {throw new WorkerD1BoundaryError('UNAUTHENTICATED');}
    fail(identity?.verified!==true||!valid(identity.actorId)||
      !valid(identity.merchantId), 'UNAUTHENTICATED');
    // Do not return or expose browser/request body identity claims.
    return Object.freeze({actorId:identity.actorId,merchantId:identity.merchantId});
  }
  function primary() {
    let session;
    try {session=db.withSession('first-primary');}
    catch {throw new WorkerD1BoundaryError('D1_PRIMARY_SESSION_UNAVAILABLE');}
    fail(!session||typeof session.prepare!=='function', 'D1_PRIMARY_SESSION_UNAVAILABLE');
    return session;
  }

  return Object.freeze({
    async inspect({request,quoteId,quoteVersion,operation,requestId}={}) {
      const principal=await context(request);
      // Read-only: no GET/refresh may age claims, place orders or call providers.
      return createD1RecoveryBoundary({db:primary(),
        resolveSession:async()=>({...principal,verified:true})})
        .inspect({request,quoteId,quoteVersion,operation,requestId});
    },
    async claimOnce({request,quoteId,quoteVersion,operation,requestId}={}) {
      const principal=await context(request);
      // Server-owned identity is used exclusively; caller does not supply
      // actorId / merchantId.  UNIQUE SQL claim is the cross-isolate CAS gate.
      return claimD1OperationOnce({db:primary(),quoteId,quoteVersion,
        operation,requestId,actorId:principal.actorId,
        merchantId:principal.merchantId});
      // FIRST_CLAIM is not provider authorization and NEVER invokes a POST.
    }
  });
}
