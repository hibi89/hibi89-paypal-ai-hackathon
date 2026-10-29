# PayPal AI Hackathon — Devpost entry and video copy (owner review draft)

Status: **DRAFT — NOT PUBLISHED / NOT SUBMITTED / VIDEO NOT RECORDED**.
Do not infer that the synthetic browser demo is a real-provider session. No private IDs, tokens, SQLite database, buyer details or account credentials belong in this package.

## Devpost project fields — ready to edit

**Project title:** Proofline — Human-approved AI Work and PayPal Sandbox Evidence

**Tagline:** Match skills, approve a clear quote, track milestones and preserve payment evidence without granting an AI permission to charge.

**Project website:** Not deployed; the judge reproducibility route is the public source branch below.

**Open-source repository:** https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/lead/paypal

**Video URL:** [OWNER TO ADD AFTER APPROVED PUBLIC YOUTUBE UPLOAD]

### Inspiration

Small service projects fail when a good idea moves from a message to an estimate, a contract, a milestone and payment without a clear record of what the human actually approved. We asked whether an AI-assisted work marketplace could separate recommendations from authority and make each handoff inspectable.

### What it does

The runnable local, **synthetic** marketplace lets a customer describe a project, compare three explicitly fictional freelancer profiles against required skills and see missing skills instead of invented certainty. An offline quote draft is versioned; a person may reject it with a reason or explicitly approve an amount. Contracts and milestone delivery have a separate reviewer workflow, including rejection, revision and acceptance. A SQLite audit timeline shows each transition, while local read-only diagnostics show ledger integrity, policy findings and measured synthetic funnel counts.

A separate **owner-operated private Sandbox proof run on October 28, 2026** used Gemini to classify skills and PayPal Sandbox Orders to create an order, obtain a distinct test-buyer approval, perform a consented capture and confirm the result with provider GET. The owner reported a USD 1.50 virtual test amount and saved local evidence. That one-shot terminal run is **not** the browser demo, has not been independently replayed in CI and does not represent live charges or production availability.

The default browser app makes **zero Gemini or PayPal API requests**, never creates/captures payments and deliberately labels its output `OFFLINE_MOCK`. Historic owner-reported provider results appear separately with their attribution.

### How we built it

- Node.js 22.5+ ES modules, native HTTP, HTML/CSS/vanilla JavaScript, local SQLite with transactional version checks and immutable-style event history.
- A deterministic, bounded 3-profile marketplace with explicit unmatched skills and `DATA_INSUFFICIENT` reference pricing; no invented market-price ML model.
- An owner-gated Gemini skill-classification adapter and PayPal Sandbox OAuth / Orders create → test buyer approval → capture → authenticated provider GET reconciliation in a **separate private one-shot workflow**.
- A fail-closed payment boundary: human-approved amount/version/merchant scope, claim uniqueness, idempotency, unknown-outcome GET-first handling, origin/CSRF validation, and no payment POST from browser GET/refresh.
- Read-only local SQL health and scoped evidence queries: **DBVORA-inspired**, not the standalone DBVORA service. Audited local transitions and policy checks: **SOVIA-style**, not a deployed SOVIA service.
- Node regression tests plus an actual Chromium walkthrough of the **synthetic localhost** flow. These tests do not attest the external services or a deployed product.

### Challenges we ran into

Real buyer approval and capture cannot safely be replaced by a fake green test. Equally, publishing the test-buyer identity, tokens, order IDs or a private SQLite database would be irresponsible. We kept provider proof private, labeled the difference between observed and independently reproduced evidence, and made the judge's offline journey fully reproducible without payment authority. Managing ambiguous payment outcomes and stale quote approval required transaction and event-version checks rather than simple optimistic UI messages.

### Accomplishments

A one-browser synthetic journey links service requirements, bounded matching, human quote decisions, contract fulfillment, reviewer acceptance/rejection and a real SQLite-backed local event history. Separately, the owner demonstrated one authorized private Gemini + PayPal Sandbox test cycle. The project exposes provenance and negative results, including missing skills, insufficient pricing data and no live payment integration, rather than presenting fabricated transactions.

### What we learned

An AI suggestion must never be treated as permission to charge. A provider GET receipt, a local ledger assertion and a reproducible browser test prove different things. Separating those evidence types made a stronger, more honest prototype and yielded a reusable approval/audit contract.

### What's next

Support authenticated real users, opt-in real seller onboarding, controlled server-side Sandbox reviewer reproduction, deployment hardening, dispute and cancellation flows, richer SOVIA-style governance, DBVORA-inspired operations and permissioned aggregate decision analytics. These are roadmap items, **not implemented production features**. No PayPal partnership, revenue-sharing arrangement, AI pricing model or real customer traction is claimed.

### Built with

PayPal Sandbox REST API (OAuth and Orders v2, owner-operated test); Gemini API (owner-operated classification); Node.js; JavaScript; SQLite; HTML; CSS; Python Playwright / Chromium for synthetic browser testing; GitHub Actions for repository checks; MIT license.

## Judge reproducibility

```bash
git clone https://github.com/hibi89/hibi89-paypal-ai-hackathon.git
cd hibi89-paypal-ai-hackathon
git switch lead/paypal
node --version  # Node 22.5+
npm run preflight:reviewer
npm run demo
```

Open the printed `http://127.0.0.1:PORT` address on that computer. This runs **local synthetic behavior only**, without accounts, external API calls or payment authorization. The browser's historical proof panel is an owner-attributed summary, not live checkout.

## Video script — under three minutes, no face or live credentials

**0:00–0:15 · Opening title / browser banner.**
“Work marketplaces need better handoffs between an AI suggestion, human approval, delivery and payment. Proofline makes those boundaries visible.”

**0:15–0:40 · Marketplace fixture.**
“Here's a synthetic client request and three fictional worker profiles. We show which skills match and which are missing. No live inventory or market-price model is claimed.”

**0:40–1:05 · Quote and human decisions.**
“This scope draft is intentionally offline mock data. The owner can reject a version, revise it and approve a specific amount. A previous approval cannot silently authorize a changed quote.”

**1:05–1:35 · Contract/reviewer workflow.**
“The synthetic owner creates a contract and submits a milestone. We switch to a separate synthetic reviewer session, reject the first delivery, request a revision and accept the corrected version.”

**1:35–1:55 · New event timeline.**
“The read-only audit timeline records contract creation, submission, rejection, resubmission and acceptance with their versions and actors. This is a local SQLite audit, not a production SOVIA deployment.”

**1:55–2:15 · Provider proof disclosure.**
“Separately, the owner observed one private Gemini skill classification and a PayPal Sandbox test-buyer approval, capture and subsequent provider GET. This is historical owner evidence, not a payment executed by this browser.” Show **only** the built-in sanitized attribution panel; do **not** show private CLI, buyer, token, merchant, order or capture IDs.

**2:15–2:35 · Database health and payment safety.**
“The local read-only evidence panel shows SQLite integrity, an unsigned audit chain and synthetic-only funnel counts. Page refresh never triggers a provider payment or capture.”

**2:35–2:48 · Source and close.**
“The MIT-licensed source is reproducible locally. This demo shows a safer path from AI suggestion to accountable human approval. The production marketplace remains future work.”

**Recording requirement:** The script is a production plan, **not captured footage or a public link**. The owner must review the final video, approve publication and provide the URL before Devpost submission. Do not record real user details, credentials or private evidence.

## Release owner checklist (not automatic)

- [ ] Re-run the committed SHA in the intended judge environment and record PASS/FAIL/SKIP.
- [ ] Confirm the public repository's actual chosen branch, root license and reproducible demo.
- [ ] Review the English entry for claims against recorded test/proof.
- [ ] Capture and approve the actual under-three-minute video; publish only with explicit consent.
- [ ] Enter the real public video URL and reviewer path in Devpost.
- [ ] Review all rights, data exposure and selected account permissions.
- [ ] Submit Devpost with explicit owner approval; save the actual submission confirmation.

Never convert an unchecked item to a success by changing a status string.
