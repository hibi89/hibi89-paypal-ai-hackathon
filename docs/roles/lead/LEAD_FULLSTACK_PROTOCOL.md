# PayPal — Lead-as-Builder execution protocol (CURRENT)
Effective 2026-10-24 KST. Replaces former one-worker dispatch model.

## Owner and workflow
One PayPal lead chat owns strategy, implementation, tests, code review, integration, public Devpost demo and submission. The user types `ㄱ` to continue the next practical step. There is **no second worker chat**, task reassignment or handoff notification. Read remote lead HEAD, `LEAD_ACTIVE_WORK.md`, source/test evidence and current constraints each execution.
One logical work item at a time; the sole live checkpoint is `docs/roles/lead/LEAD_ACTIVE_WORK.md`. `docs/dispatch/ACTIVE_TASK.md`, `PROTOCOL.md`, `BACKLOG.md`, `docs/WORKER_START_HERE.md` are archived history and must not trigger a separate chat.
**Working branch: `lead/paypal`** for all new implementation and verification. Keep `main` stable until meaningful tests and reviewed integration; preserve previous three `feature/*` refs and their commits as evidence. Do not blindly copy or merge old artifacts before reviewing them. Code can be transported from finished old feature as reviewed additions; other feature branches stay untouched.
Before code: check API access and credentials privacy, webhook signature / server-side authorization, order idempotency, duplicate capture, approval-state transitions, database persistence/retry, free quota, costs and rollback; compare alternative solutions when a material decision is needed.
After code: run offline tests; distinguish simulated vs real PayPal Sandbox calls, GitHub Actions, live browser/rendering and Production SHA; commit status/handoff/upper lead report in same verified GitHub commit, ensure author/committer match linked account. No force push or secrets in this Public repo.
PayPal live transactions / new spending / customer data transmission / security or production changes require participant approval. Use Sandbox only when properly authorized, and clearly mark BLOCKED_BY_ACCESS rather than inventing a successful integration.
Final submission must prove actual PayPal and AI relevance with functioning demo, public OSS repo/license, installation instructions, <3-minute public English-caption/narrated video and Devpost receipt, by 2026-11-13 05:00 KST.

## Alternative evaluation
A (chosen): single lead implementation branch and direct work, manual evidence-based import from the former quote branch. B (retired): rotating worker feature branch + dispatcher + second-chat reporting. A reduces context switching/collisions and simplifies CI/rollbacks; preserves legacy artifacts and gate checks.
