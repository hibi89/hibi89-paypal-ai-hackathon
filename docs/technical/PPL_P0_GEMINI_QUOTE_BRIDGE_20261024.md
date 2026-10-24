# P0 Gemini server quote bridge - offline-only work, 2026-10-24 KST

## Alternatives checked
- A: Keep offline quote only. Lowest cost and risk, but real AI contest requirement remains unavailable.
- B: Add optional trusted server Gemini adapter to the existing consent/quote/approval/versioning API. Low change surface, no network or cost unless owner separately enables it. Selected.
- C: Build new hosted Workers and D1 replacement. Higher cost and security surface; real provider approval still needed. Deferred.

## Invariants
- Default localhost UI is untouched, continues OFFLINE_MOCK. New src/gemini_quote_provider.mjs has no implicit global fetch; no credential read, billing, hosting or third-party calls in CI.
- To construct adapter, trusted server operator must privately inject API key, a fetch transport, ownerAuthorized true, and freeTierConfirmed true. None of these claims cryptographically verify ownership, tier, spend, or provider reachability.
- A POST to /api/quotes/id/draft using the injected external adapter additionally requires externalAiConsent true, verified backend session and CSRF. Missing consent blocks provider call before network.
- Fixed Gemini sandbox-like synthetic project prompt, approved model candidate, JSON schema for USD cents, strict valid amount [100, 1000000], 10-second AbortSignal, no retries, and generic sanitized errors. This is a genuine model API adapter that has NOT called the real API yet.
- Generative estimate is stored as PROPOSED. Version and human approval remain separate. A new draft cannot issue PayPal create/capture. Do not expose the API key to a browser.
- The external provider may process submitted scope. Do not use real customer data before provider data-processing review and per-request informed consent. Free Tier availability, limits and charges must be privately verified in AI Studio before any manual enabled call.

## Proof scope
Only fixture-injected Node tests and GitHub Actions can validate the adapter in this change. Real Gemini, Free Tier, PayPal Sandbox, secure public access and Devpost evidence remain NOT_TESTED. D03 0% BLOCKED; D04 80% PARTIAL; D15 20% PARTIAL; D16-D18 NOT_STARTED.
Next after owner approval: verify Free Tier, make one synthetic real Gemini request with a private key, then check revision/invalidation/explicit approval and actual PayPal Sandbox buyer integration before upgrading status.
Official provider contract: https://ai.google.dev/api/generate-content and https://ai.google.dev/gemini-api/docs/migrate-to-interactions .
