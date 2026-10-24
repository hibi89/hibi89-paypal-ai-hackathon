# PayPal Orders POST ambiguous response guard — 2026-10-24 KST

## Finding and scope
HTTP 503 or an unreadable 2xx JSON body may follow an already-processed create/capture POST. The previous Sandbox transport returned SANDBOX_HTTP_FAILURE or SANDBOX_MALFORMED_JSON, while only network interruption was called SANDBOX_POST_OUTCOME_UNKNOWN. The durable orchestrator already catches all errors and prevents duplicate POST, but future callers could misinterpret the transport error.

## Approaches
- Alternative A: automatically retry with PayPal-Request-Id. PayPal supports idempotency, but provider retention, unknown timing, and one-shot safety requirements make this inappropriate as the default for this project.
- **Chosen B:** classify all unsuccessful/unreadable Orders payment POST outcomes as SANDBOX_POST_OUTCOME_UNKNOWN, preserve the durable first claim, perform only authenticated GET reconciliation when the order ID exists, otherwise require operator investigation. No extra API calls are introduced.
- OAuth token POST network failure uses SANDBOX_OAUTH_NETWORK_ERROR, not a payment uncertainty code.
- Nonpayment GET/OAuth HTTP or JSON errors retain their former fail-closed handling.

## Regression criteria
1. Create Orders POST HTTP 503 => UNKNOWN and exactly one payment POST.
2. Create Orders POST success 201 with truncated JSON => UNKNOWN and one POST.
3. Capture Orders POST HTTP 503 => UNKNOWN and one capture POST.
4. Capture Orders POST 201 malformed JSON => UNKNOWN and one capture POST.
5. OAuth network reset => OAuth-specific error, zero payment POSTs.

The original orchestrator's SQLite UNKNOWN and GET-first contract remains unchanged. Run `npm test` plus `python render_master_progress.py --check` in full repository and verify exact SHA GitHub Actions. **At authoring, new CI is PENDING, not PASS.** No real provider account/API calls or production deployment.

## Remaining P0 conditions
D03 0% BLOCKED — actual PayPal Business/Personal Sandbox and free AI setup; D04 80% PARTIAL — real AI test missing; D15 20% PARTIAL — public HTTPS identity/session/D1 not implemented or tested (remaining planned 5h base, 10h safe; actual null). D16–D18 0%. No actual Devpost submission.

Official sources: https://developer.paypal.com/api/rest/integration/orders-api/errors and https://developer.paypal.com/api/make-api-requests .
