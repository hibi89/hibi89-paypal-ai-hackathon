> **[REVISED CONTEST POSITIONING · 2026-10-29 · NOT YET PUBLISHED]** One PayPal-centered marketplace with **two demonstrated service categories, AI Work and Global Services**, both sharing AI-assisted demand interpretation, quote/approval and Sandbox payment evidence. The lead must not submit older copy that describes SOVIA/DBVORA/standalone BI as contest pillars. PayPal-operated market intermediation and a lower combined-cost hypothesis are a **proposed strategic opportunity, not an existing relationship or implemented fee collection**. Actual two-category code must pass tests before claimed as working. Owner will record final finished UI personally; write English timecoded narration only after that video is received. See [CURRENT SCOPE](strategy/HAECHONG_DUAL_VERTICAL_SCOPE_20261029.md). 

# PayPal AI Hackathon — Devpost entry and video copy (owner review draft)

Status: **DRAFT — NOT PUBLISHED / NOT SUBMITTED**. The 2026-10-29 synthetic review WebM was locally created and owner viewed it; the upgraded evidence-first candidate is not yet owner-reviewed, public or submitted.
Do not infer that the synthetic browser demo is a real-provider session. No private IDs, tokens, SQLite database, buyer details or account credentials belong in this package.

## Devpost project fields — ready to edit

**Project title:** Proofline — AI-Assisted Global Freelance Opportunities

**Tagline:** Help newcomers find their first opportunity across AI Work and Global Services, with human-approved transactions.

**Project website:** Not deployed; the judge reproducibility route is the public source branch below.

**Open-source repository:** https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/lead/paypal

**Video URL:** [OWNER TO ADD AFTER APPROVED PUBLIC YOUTUBE UPLOAD]

### Inspiration

**My message is simple: AI should not only automate jobs; it should also help more people get their first chance to do one.** Technology demonstrates the mechanism, but the goal is access to opportunity. The global marketplace is the proposed way to reach that goal.

I did not begin with an abstract market thesis. I started applying for freelance opportunities with few expectations, partly because I wanted to see whether I could find a place for my skills. What I experienced was frustrating: as a newcomer, it felt as though the most visible work and opportunities were concentrated around already-established profiles with reviews, reputation and an existing customer base. This is my personal experience and motivation, not a statistical claim that every platform excludes new workers.

That raised a question: **where do capable newcomers get their first real opportunity, especially as AI creates new kinds of skills and services?** I wanted a stage where people can voluntarily present what they can do, where customers can describe what they actually need, and where AI helps connect both sides instead of rewarding visibility alone.

The idea grew beyond AI freelance matching. Imagine a low-friction, potentially lower-total-cost global services marketplace that can begin with AI work and expand to design, translation, marketing and other eligible digital services. If PayPal chose to operate or partner in such a marketplace, it could potentially participate in **creating new eligible transactions as well as processing their payments**. We would still have to prove whether fees can truly fall after all payment, currency, support and risk costs.

Small service projects can also fail when a promising introduction moves through scope, quote, contract, milestones and payment without a clear record of what was approved. Our working contest slice tests whether AI assistance, deliberate human consent and verifiable PayPal Sandbox payment evidence can make that journey more understandable. The personal story explains **why I started**, while the tested application must demonstrate **what actually works**.

### Market opportunity: opening freelance opportunities across borders

The bigger idea is to **create new demand for PayPal transactions, not merely add PayPal to an existing checkout**. AI developers, automation builders, consultants and small teams around the world need an accessible place to find paying work. The contest prototype presents **AI Work and Global Services together** as two categories of one marketplace. Both share skill matching, quote approvals, contracts and payment-evidence boundaries. Fictional sample sellers demonstrate the concept; real enrollment, live transactions and commercial fee models remain future work.

The proposed supply model is **asset-light and participation-led**. Unlike a business that must own physical inventory or manually secure every supplier before it can sell, a digital AI-work marketplace can let qualified providers **voluntarily opt in, publish their skills and services, and respond to qualified requests**. Awareness and useful demand could attract suppliers without proportional inventory procurement or one-to-one recruitment. This is a scalability **hypothesis**, not evidence of zero customer-acquisition cost, automatic viral growth or an existing live seller community; identity checks, moderation, trust, disputes and two-sided marketplace liquidity still cost money.

The economic thesis has two distinct beneficiaries: an **independent marketplace operator might earn a disclosed, agreed intermediation fee**, while **PayPal could earn its applicable payment-processing fees on genuinely additional eligible transactions**. We propose no special PayPal fee share, partnership, guaranteed volume or realized revenue. The goal is to test whether a new AI-work market can produce **incremental** PayPal payment activity; the broader, opt-in global AI commerce community is future strategy, not a deployed feature.

### What it does

The browser prototype presents **two selectable service categories in one marketplace**. A customer can explore AI Work or Global Services and compare three explicitly fictional specialists for the selected category. Both paths share the same quote and human-approval concept; a production marketplace, seller onboarding and connected buyer payments are not yet live.

The runnable local, **synthetic** marketplace lets a customer describe a project, compare three explicitly fictional freelancer profiles against required skills and see missing skills instead of invented certainty. An offline quote draft is versioned; a person may reject it with a reason or explicitly approve an amount. Contracts and milestone delivery have a separate reviewer workflow, including rejection, revision and acceptance. A SQLite audit timeline shows each transition, while local read-only diagnostics show ledger integrity, policy findings and measured synthetic funnel counts.

A separate **owner-operated private Sandbox proof run on October 28, 2026** used Gemini to classify skills and PayPal Sandbox Orders to create an order, obtain a distinct test-buyer approval, perform a consented capture and confirm the result with provider GET. The owner reported a USD 1.50 virtual test amount and saved local evidence. That one-shot terminal run is **not** the browser demo, has not been independently replayed in CI and does not represent live charges or production availability.

The default browser app makes **zero Gemini or PayPal API requests**, never creates/captures payments and deliberately labels its output `OFFLINE_MOCK`. Historic owner-reported provider results appear separately with their attribution.

### How we built it

- Node.js 22.5+ ES modules, native HTTP, HTML/CSS/vanilla JavaScript, local SQLite with transactional version checks and immutable-style event history.
- A deterministic, bounded 3-profile marketplace with explicit unmatched skills and `DATA_INSUFFICIENT` reference pricing; no invented market-price ML model.
- An owner-gated Gemini skill-classification adapter and PayPal Sandbox OAuth / Orders create → test buyer approval → capture → authenticated provider GET reconciliation in a **separate private one-shot workflow**.
- A fail-closed payment boundary: human-approved amount/version/merchant scope, claim uniqueness, idempotency, unknown-outcome GET-first handling, origin/CSRF validation, and no payment POST from browser GET/refresh.
- Read-only SQLite integrity checks, scoped event history and explicit quote/payment state controls. These are supporting safeguards, not additional marketplace products.
- Node regression tests plus an actual Chromium walkthrough of the **synthetic localhost** flow. These tests do not attest the external services or a deployed product.

### Challenges we ran into

Real buyer approval and capture cannot safely be replaced by a fake green test. Equally, publishing the test-buyer identity, tokens, order IDs or a private SQLite database would be irresponsible. We kept provider proof private, labeled the difference between observed and independently reproduced evidence, and made the judge's offline journey fully reproducible without payment authority. Managing ambiguous payment outcomes and stale quote approval required transaction and event-version checks rather than simple optimistic UI messages.

### Accomplishments

A one-browser synthetic journey links service requirements, bounded matching, human quote decisions, contract fulfillment, reviewer acceptance/rejection and a real SQLite-backed local event history. Separately, the owner demonstrated one authorized private Gemini + PayPal Sandbox test cycle. The project exposes provenance and negative results, including missing skills, insufficient pricing data and no live payment integration, rather than presenting fabricated transactions.

### What we learned

An AI suggestion must never be treated as permission to charge. A provider GET receipt, a local ledger assertion and a reproducible browser test prove different things. Separating those evidence types made a stronger, more honest prototype and yielded a reusable approval/audit contract.

### What's next

Support authenticated real customers and opt-in sellers, clear identity and skills verification, transparent fees, dispute and cancellation handling, secure server-side PayPal integration, and privacy-preserving marketplace analytics. These are roadmap items, **not implemented production features**. No PayPal partnership, revenue-sharing arrangement, AI pricing model or real customer traction is claimed.

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

## Evidence-first final video procedure (owner review required)

The extended recorder retains the tested synthetic client, matching, approval,
delivery and audit scenes. It inserts **three readable full-screen cards**
identifying (1) owner-reported Gemini classification, (2) owner-reported USD 1.50
PayPal Sandbox buyer approval / capture / historical provider GET, and
(3) the source distinction from the synthetic browser. On the original owner's
PC, the recorder invokes the existing **read-only** local receipt inspector. If
the original private SQLite record is internally consistent, it shows
**LOCAL SAVED RESULT MATCHED — NOT FRESH PROVIDER GET**; without that private
record (including CI), it states **OWNER REPORT ONLY — NOT VERIFIED ON THIS
MACHINE**. It never copies private identifiers or replays external calls.
The owner must visually check the new 2:30–2:45 candidate, confirm that source
labels match the actual private receipt, and separately approve any public upload.

This local-record check is NOT independent remote provider attestation. Showing
the real original merchant dashboard or buyer account is neither required nor
authorized by this recording command. No new Sandbox payment should be made.

## Judge video — English caption/narration guide for the CURRENT dual-category recording

**Status:** Editorial draft for a future owner-reviewed video. The CI recorded and independently measured a **148.72-second** private synthetic WebM at commit `0061d278` ([Actions proof](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40876399546)); the encoded file was ephemeral in CI. **No owner-PC final version, publicly approved YouTube link or Devpost receipt exists.** Actual scene timestamps must be checked against the owner's final recording, not assumed from this guide.

The current automated screen sequence is: **opening → AI Work matches → Global Services matches → AI Work quote approval → historical Gemini/PayPal provenance cards → contract/delivery/reviewer rejection and acceptance → SQLite audit → historical disclosure → closing**. This sequence is not the earlier quote-first storyboard.

| On-screen sequence | Suggested English caption or voice-over (edit to fit final footage) |
| --- | --- |
| **Opening — why** | "A newcomer can have real skills but no reviews or previous clients. AI should open a first door to work, not just automate work that already exists." |
| **AI Work** | "Proofline starts with AI work: agents, automation and development. These are clearly fictional sample specialists, with skills and gaps shown openly." |
| **Global Services** | "It is not an AI-only job board. The same marketplace can serve design, translation, marketing and other remote services. Both categories share one human-approved transaction path." |
| **Quote and approval** | "A customer chooses a sample specialist and approves an exact quote version and amount. The browser generates offline mock proposals; no charge is authorized." |
| **Historical Gemini / PayPal cards** | "Separately, on October 28, the owner reported an actual Gemini skill-classification call and one approved PayPal Sandbox order, capture and later provider GET. The original local record may be checked read-only. These are historical owner-observed results, not calls made by this browser or independently replayed in CI." |
| **Delivery and review** | "A synthetic contract goes to review. The reviewer rejects an incomplete delivery, and the revised submission is accepted. People keep the decisions." |
| **Audit and close** | "SQLite preserves the local event history, and payment remains NOT_CAPTURED in this browser. Technology is the evidence; the marketplace is the mechanism; more opportunity for people is the goal." |

**Judge-facing claim boundary:** Label every browser transaction **OFFLINE SYNTHETIC**. Show no actual seller inventory, real purchases, production authentication, PayPal-owned marketplace, lower-fee guarantee, escrow, or present-time Gemini/PayPal provider activity. Never show buyer/merchant IDs, tokens or private SQLite files. The separate owner-reported Sandbox proof is not a substitute for independent judge-accessible integration, and that remains a scoring risk.

**Audio and rights:** Silent English captions are acceptable editorially but still need owner inspection for readability. Do not add third-party music, brand graphics or other copyrighted material without appropriate rights. Do not publish until owner approval.

## Release owner checklist (not automatic)

- [ ] Re-run the committed SHA in the intended judge environment and record PASS/FAIL/SKIP.
- [ ] Confirm the public repository's actual chosen branch, root license and reproducible demo.
- [ ] Review the English entry for claims against recorded test/proof.
- [ ] Capture and approve the actual under-three-minute video; publish only with explicit consent.
- [ ] Enter the real public video URL and reviewer path in Devpost.
- [ ] Review all rights, data exposure and selected account permissions.
- [ ] Submit Devpost with explicit owner approval; save the actual submission confirmation.

Never convert an unchecked item to a success by changing a status string.
