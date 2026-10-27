# PayPal AI Work Marketplace — FIXED REAL-WORLD TOOLCHAIN
2026-10-27 owner correction: exact selected programs and libraries, not vague AI/DB/backend categories. This is the specific build stack and post-submission roadmap. No newly added runtime dependency before deadline. Latest submission freeze prevails.

## A. THIS CONTEST SUBMISSION — 2026-11-13 05:00 KST
| Layer | Tool / program | Role and limitations |
| --- | --- | --- |
| Runtime | Existing Node.js >=22.5 ESM JavaScript, npm | Existing package.json uses --experimental-sqlite; pin compatible Node version after local verification. NO Express, Next.js, NestJS, Python web service |
| UI | Existing HTML5 + CSS3 + browser vanilla JavaScript | One client request, three synthetic freelancer choices, explain selection and price data, human quote review, PayPal checkout/audit |
| HTTP backend | Node built-in node:http, fetch, node:crypto and existing Node source modules | Reuse code and validated amount/session and idempotency binding; no backend rewrite |
| AI | Gemini API existing REST adapter, previously tested model gemini-3.5-flash-lite ONLY if currently available and within verified free tier; server-side structured-output checks | Synthetic descriptions and profiles only, no real unconsented customer data; Gemini output never authorizes payment |
| Matching | Native JavaScript eligibility filtering by skills/language/availability + Gemini reasoning/explanation | ONLY 3 labeled synthetic candidates, not a real global matching SaaS |
| Pricing | Native JS "DATA_INSUFFICIENT" fallback / clearly fictional reference scenario | NO trained price ML, no fake big-data estimates |
| Actual payment | PayPal Developer Sandbox OAuth2 + Orders v2 REST, exact merchant + approved quote, buyer approve, capture, provider GET | A genuine approved test buyer transaction and authoritative capture verification is critical; NO Live payments or autonomous refund |
| Local transactional DB | Existing built-in node:sqlite and persistent checkout session store, claim and event ledger | Source of truth, approved amount/merchant binding and replay protection; no actual Cloudflare D1 migration |
| SOVIA functionality | Small auditor fields embedded in current Node ledger: AI recommendation, exact human approval, provider result and error, timestamps/actor/request_id | SOVIA-style **audit**, not full Python SOVIA service or live anti-fraud authority |
| DBVORA functionality | Read-only schema/DB health contract as a document ONLY, not runtime requirement | DBVORA not a separate startup dependency; no direct DB writes |
| Local runs/testing | Node test runner node:test, built-in npm scripts, Chromium local browser E2E, GitHub Actions | Existing 347 offline passes not payment E2E or judge setup proof |
| Demo distribution | **Public GitHub** repo with root existing MIT LICENSE and complete English install/run instructions; **localhost runnable Node demo** | Official rules allow runnable repo instead of hosted URL; genuine judge access including authorized Sandbox test guidance essential |
| Recording | OBS Studio screen capture, Shotcut optional free video edit, public YouTube under 3 minutes, English Devpost | Only show actual working flow, state synthetic/non-synthetic precisely |

## B. End-to-end deliverable that matters
One fictional client posts an e-commerce contract brief. Gemini extracts scope. Deterministic filter matches 3 explicitly synthetic freelancers; the assistant explains why. "Reference price unavailable" unless lawfully comparable prices exist. User approves quote version and merchant/amount. PayPal Sandbox buyer completes one authentic virtual order; server-only capture and GET check, with replay/UNKNOWN protections. Ledger displays exact status and audit. No unapproved API calls; real Sandbox merchant, buyer, owner-scoped consent and secrets excluded from published code are independent blockers.

## C. Advanced stack only after this competition submission
| Capability | Selected future stack only with data/rights | Reason to DEFER |
| --- | --- | --- |
| ML price/quality estimates | Python 3.11 + pandas + numpy + scikit-learn, adapter from AI_AutoML_Analyst once permitted and tested, group/time holdout | No licensed actual completed-deal labels or validated coverage now |
| Real marketplace scale | Verified user authentication provider and PostgreSQL or Cloudflare D1 only after approval and successful SQL migration tests | Not required for 3 synthetic candidates and one Sandbox transaction |
| Production deployment | Cloudflare Workers + D1 possible after Linux/runtime/edge compatibility tests, provider data rights and payment session rework | Current node:sqlite is not drop-in Cloudflare Workers D1 |
| Full risk/audit | Authenticated event interface with independent SOVIA service only on justified contract, never replacement for PayPal truth | Python service increases complexity and attack surface |
| DB observability | DBVORA adapter read-only after actual DB storage chosen | Not part of buyer checkout or hackathon grading proof |
| Merchant ecosystem | PayPal partner/merchant onboarding approval, lawful consent, authorized payouts/dispute workflows | Official PayPal Sandbox integration doesn't itself grant multi-seller platform rights |

**No React/Vite migration; no new server/database SaaS; no price ML, no dynamic cloud deployment requirement before Nov13.** Preserve previously proven API/Node components and roll back any hypothetical feature that endangers checkout. In case of failed buyer/capture proof at Nov09 internal gate, stop all other work.

Official: https://paypalaihackathon.devpost.com/rules . Functional localhost running via public repo instructions is allowed, not mere static screenshots. Separate approval needed for provider requests, release/public upload and final Devpost.
