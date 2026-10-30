# PayPal Agentic Freelance Marketplace — 2026-10-29 approved redesign plan

## Owner decision
Retain the existing two-category global freelancer marketplace (AI Work / Global Services) and its working Node.js/SQLite/Gemini/PayPal Sandbox evidence. Integrate **all three** capabilities: (1) buyer/seller AI price negotiation, (2) agent payment budget/authorization guardrails, (3) delivery verification and conditional payout workflow. No SOVIA, DBVORA, CODE COUNCIL. Do not discard working code or claim synthetic evidence is provider proof.

## Architecture decision
A: migrate now to FastAPI/PostgreSQL/Redis/LangGraph: more rewrite, migration risk, deployment cost.
B (selected): modular Node.js services using existing SQLite transactional state and current UI, with adapter interfaces for Gemini and PayPal. Preserve source and existing tests. Add infra only after measured bottlenecks. UI should show one end-to-end contract.
- Negotiation: bounded rounds; two role-specific agents; explicit seller/client policies; server-side min/max, currency, expiry, agreed quote version; AI suggestions are never payment authorization.
- Guardrail: per-agent/contract budget, atomic reservation and unique payment intent; human authorization bound to amount, merchant, quote version and expiry; safe unknown-outcome GET reconciliation; no auto replay of POST.
- Delivery: GitHub PR/checks evidence with provenance; objective rules + AI explanation; uncertain/failed checks escalate for human review. A green CI status alone is not proof of contractual acceptance.
- Payment: reuse verified Orders v2 Sandbox create/approve/capture/GET and signed webhook path; Payouts availability, merchant eligibility and regulatory handling are **unverified**. Never call captured funds 'escrow'; never assume platform can hold third-party funds. Demo conditional settlement decision separately until permitted payout route is validated.
- Persist immutable events, idempotency keys and transitions; browser refresh never triggers payments; prohibit secrets or owner private receipts in repo.

## Public implementation schedule (KST, targets not verified completion)
| Date | Deliverable | Acceptance |
|---|---|---|
| Oct 29 | Scope, design and schedule committed; baseline inspected | Existing flows and evidence retained |
| Oct 30 | Buyer/seller AI negotiation | deterministic fixtures + bounded negotiation + actual Gemini integration behind consent gate |
| Oct 31 | Budget guardrail | overspend, concurrency, replay and approval-binding tests |
| Nov 1 | Delivery verification + conditional settlement decision | PR evidence verification and safe human-review fallback |
| Nov 2 | End-to-end local integration | quote -> negotiation -> guardrail -> authorized PayPal flow -> delivery -> decision -> audit; browser test |
| Nov 3-4 | UX, English <3m video, submission candidate | source/evidence distinction; owner review and publication gates |
| Nov 5-12 | Regression, permitted provider verification, Devpost finalization | actual public source/video/receipt only after owner approval |

## Execution rules
Work in lead/paypal, commit feature-sized changes with tests; CI non-blocking unless it gates the next step. No live charges, new Sandbox capture, paid API, external publication, main merge, new cloud service, or private-data upload without explicit owner authorization. Historical Oct 28 USD1.50 Sandbox transaction must not be replayed. Update STATUS.md and HANDOFF.md after meaningful implementation, with exact commit SHA and PASS/FAIL/UNVERIFIED. No invented completion percentage.

## First coding task
Inspect package.json, src/offline_demo_server.mjs, existing contract/quote/payment and browser flows. Implement persistent negotiation policy and pure bounded price proposal engine using existing stack; add unit tests and UI connection without weakening existing human consent. Continue guardrail and delivery modules in sequence.
