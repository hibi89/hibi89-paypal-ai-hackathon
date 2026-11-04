# PayPal owner-only Quick Tunnel bridge — 2026-10-28 KST

## Scope and decision
An approved temporary public HTTPS ingress reduces the last manual callback setup burden before ONE owner-approved Sandbox transaction. Existing Node/SQLite and PayPal GET-only authority stay unchanged. Alternative of a named permanent tunnel requires domain/account and operations; no deployment was performed here. Official reference: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

## What changed
- `src/owner_mvp_quick_tunnel.mjs`: launches installed `cloudflared` without a shell, extracts ONLY a valid `*.trycloudflare.com` HTTPS origin from bounded local process output, gives up on timeout/process exit, and terminates tunnel on cleanup.
- `scripts/run_owner_mvp_operator.mjs` optional `--quick-tunnel`: after terminal approval, starts a navigation-only localhost callback with inert bootstrap Host, launches the tunnel, stops bootstrap, rebinds same localhost port to the random HTTPS Host, probes BOTH return/cancel URLs with non-payment GET proof, THEN permits the separate Gemini/quote/Sandbox stage consents.
- Default CLI without all flags and interactive TTY stays dry-run. Root public `main` is not released. No automatic payment after buyer redirect; no auto retry after ambiguous POST.
- `npm run mvp:quick -- --execute --owner-authorized --free-tier-confirmed --sandbox-only --buyer-is-sandbox-personal` is owner-only opt-in. Requires installed `cloudflared`, local terminal, private existing sandbox merchant/client/secret and confirmed-free Gemini key. The Quick Tunnel mode does NOT need `PAYPAL_PILOT_PUBLIC_ORIGIN`. Optional `PAYPAL_PILOT_CALLBACK_PORT` defaults 8787.
- Tunnel makes the two inert callback navigation pages internet-reachable to anyone with the random URL. Quick Tunnels are NOT production authentication; they stop when the operator exits. Never publish credentials in GitHub/chat.

## Acceptance boundary
Unit tests exercise synthetic cloudflared process output, strict random origin parsing, cleanup, no-shell launch, rejection of invalid URL, early exit and deadline. **Verified exact source SHA `98fbbf65`: [GitHub Actions #40539239448](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40539239448) completed success with 457/457 Node tests, synthetic full MVP smoke, Chromium offline E2E, and 18-entry progress PASS. Earlier candidate CI #40539148381 failed 456/457 on deceptive suffix parsing; fixed before final success. Still NOT true external HTTPS tunnel, Gemini or PayPal transaction proof.

Actual owner machine: do not delete existing `~/.paypal-ai-mvp-private` to replay. First run `npm run mvp:status` and independently verify the actual Sandbox Business app, separate Personal buyer, authorized synthetic amount and Gemini Free project. Once owner terminal confirmations succeed, server's two GET probes verify live ingress; then the full staged flow may be exercised once. No Live payment.
