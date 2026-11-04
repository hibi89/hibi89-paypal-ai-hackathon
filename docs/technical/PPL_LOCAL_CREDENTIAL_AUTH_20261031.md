# Local credential sessions — loopback-only opt-in (2026-10-31 KST)

## Why
Design A: preserve existing synthetic role-switching (fast, not authentic identity).
Design B: preprovision buyer/seller/reviewer password verifiers and persistent hashed sessions, role-checked by existing authoritative SQLite membership.
Selected B as an opt-in. A remains the unchanged default for previous synthetic browser demos. This is NOT a production authentication provider, real seller verification, PayPal merchant ownership proof, real money or public deployment.

## Run on a private local machine
Node >=22.5. Configure three *distinct* private 12–256-character passwords (never store passwords in Git or source):

~~~powershell
$env:PAYPAL_LOCAL_BUYER_PASSWORD = Read-Host "Local buyer password"
$env:PAYPAL_LOCAL_REVIEWER_PASSWORD = Read-Host "Local reviewer password"
$env:PAYPAL_LOCAL_SELLER_PASSWORD = Read-Host "Local seller password"
npm run demo -- --local-accounts --synthetic-seller
# Remove after exiting:
Remove-Item Env:PAYPAL_LOCAL_BUYER_PASSWORD,Env:PAYPAL_LOCAL_REVIEWER_PASSWORD,Env:PAYPAL_LOCAL_SELLER_PASSWORD
~~~

The printed ephemeral address is 127.0.0.1 only. No login form is provided yet: a same-origin HTTP client can POST application/json containing actorId and password to /api/demo/auth/login. Fixed preprovisioned actor IDs are synthetic-owner, synthetic-reviewer and synthetic-seller. Server sets HttpOnly SameSite=Strict session cookie (plain HTTP loopback only); GET /api/demo/auth/session provides per-session CSRF token and current actor. POST /api/demo/auth/logout needs matching Origin, cookie and x-csrf-token. Old POST /demo/synthetic-role is 404 in this mode. Anonymous API fallback is disabled. No checkout or provider HTTP is available in this demo.

## Data/safety
Random per-account salt + scrypt password verifier; SHA-256 hashes of random 32-byte bearer tokens stored in SQLite. Sessions have a 30-minute default expiration and individual logout revocation. Absent, duplicated, malformed or expired session cookies are denied. Unknown accounts and bad passwords both return INVALID_CREDENTIALS. Client role headers do not grant privileges; each protected API still checks persisted membership.
Integrated demo uses temporary isolated files deleted on stop. Standalone createLocalAccountAuth can reopen its explicitly chosen SQLite file, with existing credentials validated on reopen; no production migration or durable hosted storage.
No registration, account reset, public Secure-cookie/TLS configuration, email confirmation, seller ownership proof or provider merchant authorization is claimed. Keep disabled on public reverse proxies.

## Tests and release gate
Source SHA: 7a9352fe21e417a166231df62bb1d11803f1a25f.
Full Actions: https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41197115440 — completed SUCCESS: 638/638 Node, 0 failures/skips; Chromium original marketplace, seller/reviewer, Global Services and budget journeys PASS; Windows first-run and local synthetic video integrity PASS.
Smoke: https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41197115549 — completed SUCCESS.
No PayPal or Gemini provider call, new order/capture, genuine customer data, Production/Vercel or Devpost submission. Restore previous source from parent commit c209bb7a if required; main unchanged. Follow-up: real host identity, seller-to-merchant ownership verification, HTTPS, production database and approved separate real-provider integrations.
