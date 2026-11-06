# Proofline — PayPal AI Hackathon | Final English entry candidate

**DRAFT — NOT PUBLISHED. The source and root MIT LICENSE are already public on main via merged PR #28; OWNER APPROVAL IS STILL REQUIRED BEFORE YOUTUBE AND DEVPOST PUBLICATION.**

This is a concise owner-review copy, not a submitted or independently provider-verified contest entry. All browser actions described as *offline* are fictional/test-data actions. Do not substitute this for the official Devpost submission receipt.

## Project title
Proofline — AI-Assisted Freelance Opportunities with Human-Controlled Payments

## Tagline
Help newcomers find an opportunity, agree on a clear scope, and keep AI agents under human payment authority.

## Source and demo
- **Working source (public default branch):** https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/main
- **Default branch:** merged PR #28 at `28a370fd` published runnable source and root MIT LICENSE to main, with all 514 release-preview blobs matched. This is **source publication**, not a hosted application, live provider action, public video or Devpost submission.
- **Website / hosted production:** NOT DEPLOYED. The current demo runs on a loopback-only address on the reviewer's computer. The source README and `docs/JUDGE_REPRODUCTION_EN.md` describe the exact local route.
- **Public demonstration video:** OWNER TO ADD AFTER APPROVED PUBLIC YOUTUBE UPLOAD.
- **Devpost confirmation:** NOT SUBMITTED.

## Inspiration

A freelancer may have useful skills and still struggle to win a first project without reviews or visibility. I wanted AI to help people access opportunities rather than only automate work. Proofline explores a global, opt-in digital-services marketplace where a customer describes a need, can see missing skills and reviews the proposed transaction before anything could be paid. The business model and potential fee reductions are hypotheses—not operational claims or a PayPal partnership.

## What it does

**Part 1 — Freelancer marketplace:** A local reviewer can switch between **AI Work** and **Global Services**. Three intentionally fictional example specialists are compared against the requested skills, with missing skills visible. A deterministic OFFLINE_MOCK proposal supports versioned quotes, rejection, explicit human approval of an exact amount, and a contract with delivery, revision, rejection and independent acceptance. SQLite records the local event history. The browser does not enroll real freelancers or issue PayPal transactions.

**Part 2 — Agentic Innovation Lab:** Five distinct working **offline deterministic** skills share policy boundaries without gaining payment authority.

1. **A2A negotiation:** A bounded buyer/seller offer, counteroffer and agreement with recorded turns; the default browser does not call a language model.
2. **Delegate & Consent:** Limited, expiring, revocable scopes and amount caps; authorizing a demonstration never authorizes PayPal payment.
3. **Gift-finder:** A fictional product catalog plus an optional owner-entered local SKU and price catalog, chosen under a budget; there is no independently verified merchant inventory or checkout.
4. **Subscription Churn Saver:** Proposes a retention action without changing a real PayPal subscription.
5. **Invoice / Dispute Copilot:** Checks contract/delivery/review evidence for a human decision without creating a PayPal invoice or dispute.

A separately gated private Gemini A2A pilot can be explored only with the operator's own credentials, consent and verified quota; no such call is made during judge reproduction. The local browser may **read a selected private A2A JSON result entirely on-device** and check its transcript digest, but neither this digest nor the viewer proves Google executed the model.

## What uses PayPal and AI

The project includes a consent-controlled PayPal Sandbox OAuth/Orders create, buyer approval, capture and provider GET workflow, and a Gemini skill-classification workflow. On **October 28, 2026**, the owner reported a private **Sandbox** test with a manually approved **USD 1.50 virtual amount** and a Gemini classification result. A local read-only SQLite receipt inspector exists. This is an **owner-reported historical test, not the synthetic video**, **not independently reproduced in CI**, and **not available as a live provider-integrated browser flow**. It does not show Live money, a production merchant or current Free Tier eligibility. Do not infer real payment from an offline A2A agreement.

The default two-part browser is deliberately credential-free, **OFFLINE_MOCK**, and makes **zero actual PayPal or Gemini requests**. It labels source classes separately: reproducible local browser, orchestrator tested against injected fake transports, owner-reported historical provider evidence, and public submission status. These are different types of evidence.

## How we built it

Node.js 22.5+, JavaScript/HTML/CSS, local SQLite with version and idempotency constraints, separate PayPal Sandbox and Gemini adapters, GitHub Actions, Python Playwright and Chromium. Human-approved quote versions, role-specific session boundaries, event history, payment-operation claim uniqueness and GET-first reconciliation protect against accidental duplicates. Real Cloudflare/IdP deployment and remotely accessible authentication are **not verified**. Offline CI and local browser tests do not independently attest an external service.

## Challenges

The biggest challenge was keeping AI suggestions separate from authority to spend money. Retrying an unknown payment POST can be dangerous. We built fail-closed approval, replay and read-only recovery boundaries and kept simulated, historically reported and independently tested evidence clearly labeled. We also preserved privacy: the public source, demo recording and entry do not include customer identities, tokens, merchant IDs or private SQLite databases.

## Accomplishments

Both marketplace categories and all five Part 2 modules have a reproducible local workflow. The project contains explicit approval and rejection states, local audit and bounded policy rules. GitHub CI previously verified large offline regression suites and browser journeys, but current media/release candidate checks have not all completed. The historical PayPal and Gemini result remains owner-reported rather than a new provider test. No public deployment, YouTube publication or Devpost submission is claimed.

## What we learned

The same green status can mean different things: a synthetic browser test, a local SQLite record, and a provider's remote GET result are not interchangeable. The prototype is strongest when evidence, consent, application state and payment authority stay separate.

## What's next

Seek an explicitly authorized judge-safe real-provider walkthrough, authenticated opt-in users, a live seller/merchant verification process, secure production hosting if later needed, and transparent fee and dispute policy. Those are future work, not current features. The default-main source-only release is completed; an actual under-three-minute public YouTube video and the Devpost form still need separate owner approval.

## Tools and how used

- **PayPal Sandbox OAuth 2.0 / Orders v2** — Implemented a consent-gated sandbox-only OAuth/Orders, buyer-approval, Capture and provider-GET adapter; the 2026-10-28 private result is historical owner-reported evidence, not independently reproduced in CI, and the default browser performs no PayPal calls.
- **Gemini API** — Implemented a gated skills-classification adapter and an optional private A2A pilot; historical private model use is owner-reported, not independently reproduced in CI, and the default browser uses deterministic OFFLINE_MOCK agents with no Gemini calls.
- **Node.js and SQLite** — Runs the localhost marketplace, quote and contract state machines, local audit events, scoped consent and owner-entered gift catalog persistence without production data.
- **Playwright and Chromium** — Exercises the Part 1 and Part 2 local browser journeys and records a private synthetic walkthrough with hash and independently measured encoded-media duration.
- **GitHub Actions** — Runs Linux/Windows regression and Chromium checks; passing CI verifies the stated offline scope, not external provider availability or a real PayPal payment.

## Built with
PayPal Sandbox Orders v2 and OAuth (private owner-operated workflow), Gemini API (private owner-operated workflow), Node.js, SQLite, JavaScript, HTML/CSS, Playwright, Chromium and GitHub Actions. The default main branch now contains the MIT LICENSE and runnable local source; provider, video and Devpost remain separately gated.

## Reviewer quickstart — synthetic demonstration only

```bash
git clone https://github.com/hibi89/hibi89-paypal-ai-hackathon.git
cd hibi89-paypal-ai-hackathon
git switch main
node --version  # Node 22.5 or newer
npm run verify:local
npm run demo
```

Open the printed `http://127.0.0.1:PORT` on that computer; visit `/demo/innovation` for Part 2. Some browser tests need Python Playwright and a locally installed Chrome/Chromium. Offline demo launch never triggers a real PayPal payment or Gemini request.

## Publication checklist (NOT YET SATISFIED)

- [ ] Latest exact-source Linux/Windows/local-browser and video media-length verification completed
- [ ] Owner confirms accurate provider-evidence boundaries and final wording
- [x] Default-main source/license release: PR #28 merged at `28a370fd` (not Production deployment)
- [ ] Owner visually approves and publishes the accurate public YouTube video **under 180 seconds**
- [ ] Owner explicitly approves and submits the English Devpost form; real confirmation URL recorded

**RELEASE HOLD.** Never promote a local draft, historical owner record, source hash, video hash or CI PASS into a claim of independent current PayPal/Gemini verification.
