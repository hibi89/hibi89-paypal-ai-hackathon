# [ACTIVE OWNER DECISION] PayPal Global Services Marketplace — two verticals, one transaction backend
Date: 2026-10-29 KST · repository `hibi89/hibi89-paypal-ai-hackathon` · development branch `lead/paypal`.

## Product / business thesis
Propose a **PayPal-owned, optionally operated global services marketplace**: PayPal is not merely an external payment processor but could participate in forming eligible transactions and earn both (a) marketplace intermediary fees and (b) ordinary processing fees, **only if PayPal actually operates/owns/has a properly approved commercial partnership for that fee**. Fees go to different entities in a third-party marketplace by default; no current PayPal affiliation, sponsor commitment, agreed commission, proprietary trademark authorization, actual revenue or approved platform partner is claimed.

**The single contest product is ONE marketplace with TWO clickable categories, not two separate sites:**
1. **AI Work**: AI programming, workflow automation, chatbots, analytics; main AI+PayPal demonstration.
2. **Global Services**: self-published digital and remote work such as graphic design, translation, writing and marketing; second demo showing cross-category extension using the **same** demand/eligibility/quote/approval/PayPal/ledger machinery.

This is an owner-proposed *low-fee, voluntary opt-in supply* business model (Kmong-style general services category), not a recreation of Kmong branding, website, proprietary ratings or seller inventory. Neither an actual global buyer/seller userbase nor real opt-in enrollment exists in today's test fixtures. Any unimplemented onboarding must be labeled ROADMAP.

## Mandatory contest functionality (actual tested code, not slides)
- A visibly working selector **AI Work / Global Services**. A fictional sample brief in each category can be submitted, matched to **clearly fictional and appropriately skilled** providers, chosen and passed into the existing quote approval → contract → payment/evidence status. The categories share the same transaction back end; no duplicative checkout implementation.
- The **AI function is central**: a real separately approved Gemini skill extraction demo and clear source indication; offline or inferred results remain labeled offline, not actual Gemini. AI recommendations never set payment authorization or fabricated price.
- The **PayPal function is central**: show separate owner-observed real authorized Sandbox buyer-approved CREATE/CAPTURE/GET historical evidence without repeating the existing POST; prepare an authentic judge-reproducible checkout route only where safe and authorized. A category switch is not proof of actual general-market PayPal payments.
- Human quote approval bound to exact amount, currency, merchant and version; idempotency, authenticated PayPal GET and durable transaction/audit history remain **infrastructure safety**, not 'SOVIA integration'.
- **Price transparency:** the buyer sees the seller's listed price, a separately labeled **illustrative/platform-owner fee** hypothesis and PayPal processing charge as distinct where known. The actual payment total/recipient/merchant must never be inferred from a hypothetical business fee or assumed PayPal partner privileges. Missing rate data = DATA_INSUFFICIENT rather than invented charges.
- Explicitly show what has been tested versus merely proposed. Test both categories and common quote workflow in a browser, then keep public MIT source / reproducible judge README / English materials / owner-clicked real product recording (<3 min) / final Devpost submission.

## Removed from contest product scope by owner
- **SOVIA and DBVORA** as separate apps, branded integrations, screens or pitch pillars; **CODE COUNCIL/code checker** integration or judging feature; HAE, LA, RAG_STUDIO and AutoML remain external future tooling, **not** contest runtime dependencies.
- **Standalone BI or operational analytics dashboard is not mandatory**. A single illustrative marketplace business model/fee comparison is enough for the sponsor pitch; do not assert hypothetical figures as actual economics. Keep only plain necessary payment/contract log records, safe payment controls and existing code/tests.
- Do not spend effort deleting already working audit/SQLite/diagnostics code if removing it risks functional regression. Remove SOVIA/DBVORA *branding and priority* from front-end/pitch; preserve necessary evidence, error recovery, security and stability.

## Priority / acceptance
1. P0: stabilize actual Gemini + PayPal Sandbox evidence and main AI Work E2E; do not weaken the already approved historic receipt protections.
2. P1: add **general service category** to the same matching/quote browser interface with 2-3 synthetic provider examples; no real seller enrollment, extra merchant accounts or proprietary real ratings needed.
3. P2: cohesive product-grade frontend with two visible category tabs, source-labeled professionals, clear quote, human approval, PayPal action/evidence and delivery state. Show hypothetical fees in strategy/pitch separately from actual checkout.
4. P3: test both user journeys, identity/quote isolation and no-payment-on-GET/reload; reproduce from clean clone; final owner-operated recording and **post-footage** English timed narration/subtitles.
5. P4: owner-approved open-source release/public video/Devpost, before 2026-11-13 05:00 KST. The 2026-11-05 optional organizer early-check goal may be used, never presumed an official deadline.

**Status at document creation:** CHANGE OF SCOPE APPROVED, IMPLEMENTATION NOT YET VERIFIED. Never call categories/live providers/PayPal processing/partner fee implemented until tested.

**Rule precedence:** This 2026-10-29 direct owner's decision supersedes older references making SOVIA/DBVORA/BI contest pillars or prohibiting a second category. The official rules, existing security/consent restrictions, and main AI+PayPal genuine behavior continue to prevail. No release or provider POST authorization by this scope change.

Official contest rules: https://paypalaihackathon.devpost.com/rules
