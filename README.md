# PayPal Global Services Marketplace — PayPal + AI Hackathon (owner proposal)

> **2026-10-30 UNMERGED FINAL REVIEW CANDIDATE:** Current source on this
> branch is in stacked [draft PR #26](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/26),
> atop integrated [draft PR #25](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/25).
> The last fully green 3-job Actions run [#41002555640](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41002555640)
> verified an **older SHA**, not this latest candidate. The newer integrated
> [CI #41017095517](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41017095517)
> was queued at last check. No final full CI PASS, public video, release or Devpost receipt is claimed.
> Use `npm run owner:final:local` for private owner-PC review; it neither publishes nor calls payment providers.

## For judges — Proofline in 60 seconds (English)

**Concept:** AI should help skilled newcomers get their first freelance opportunity, not only automate existing jobs. Proofline is **one proposed global freelancer marketplace** with two playable categories: **AI Work** (agents, automation, development) and **Global Services** (design, translation, marketing). The current implementation is a working **offline synthetic browser demo**, not a commercial service.

**Run the working browser build (Node.js 22.5+; no API keys or payments):**

```bash
git clone https://github.com/hibi89/hibi89-paypal-ai-hackathon.git
cd hibi89-paypal-ai-hackathon
git switch work/paypal-video-integrity-hardening-20261030
npm run demo
```

Open the printed `http://127.0.0.1:PORT` URL. Select **AI Work** and click **Explore matching specialists**; then select **Global Services** and explore again. You can return to AI Work, choose a fictional profile, generate an offline quote, explicitly approve its amount, and exercise the synthetic contract/reviewer workflow. All profiles and browser transactions are fictional, clearly labeled, and carry **no real payment authority**.

**NEW: quote-bound PayPal Orders plan (strictly offline, not a payment):** Approve a fictional AI Work or Global Services quote, then click **Preview plan for approved quote (GET only)** in the payment panel. The backend retrieves that exact SQLite-approved quote and calls the same pure `planOrder` used by the private Sandbox transport. It displays the current version, USD amount and planned Orders path without showing merchant identifiers, idempotency keys or outgoing JSON. The merchant is fictional; no PayPal/Gemini API, buyer approval, order or Capture takes place. Four Node unit tests, real loopback Node E2E and a Chromium Global Services journey check the binding and zero-payment behavior. The earlier independent fake USD 1.50 API replay remains separate. This makes the judge's *local quote → payment planning* data path executable, but is NOT a real Sandbox transaction or proof of live integration.

**NEW: human-approved quote bound to Orders + Capture + GET domain simulation (pure code, ZERO payment):** The quoted USD 15 or USD 29 amount now runs through `planOrder`, `planCapture` and `reconcileCapture` with explicitly invented in-memory PayPal responses; a pending buyer blocks capture, a wrong capture amount fails and the fake completed order matches the *same* quote. The browser labels all nine steps **FAKE, NOT SENT**, with zero provider HTTP, ledger mutations or real payment. This is executable domain logic, not actual PayPal Sandbox payment evidence. The separate fixed USD 1.50 Gemini/PayPal injected-fake adapter remains independently labeled.

**Single-click two-source judge check (NEW, offline-only):** After approving the current synthetic quote, click **Verify both local code paths (fake only)**. The browser checks the actual SQLite-approved quote and real pure PayPal Orders planner, performs a separate explicit CSRF-bound fake Gemini/PayPal API replay for **fixed USD 1.50**, then verifies the original quote was unchanged. The live quote amount (for example USD 29.00) and fake USD 1.50 adapter fixture are **NOT one transaction**. The silent local video now demonstrates both and the real browser test checks one local POST, no external provider/payment calls. This is not real Sandbox or Gemini integration proof.

**Browser-accessible, fake-only API trace:** The four-source Evidence Map now includes a **Run synthetic API replay** button. An explicit click uses the actual owner orchestration with **injected fake Gemini and PayPal responses** and shows redacted request stages and human-consent checkpoints. The localhost-only endpoint is owner-scoped, CSRF-guarded, rate-limited, and never called on load or refresh. It does **not** perform external Gemini/PayPal requests, authorize payment, or verify the owner's historical Sandbox result.

**NEW: judge command now verifies current quote-bound PayPal logic for BOTH categories:** `npm run judge:reproduce` creates isolated localhost SQLite demo sessions for AI Work (USD 15.00) and Global Services (USD 29.00), submits synthetic briefs, drafts and explicit human approval fixtures, then verifies the actual saved amount/version reaches pure `planOrder`, `planCapture` and `reconcileCapture` with nine **invented in-memory PayPal statuses** per quote. The JSON receipt includes `reproducibleQuoteBoundPlans` plus a separate fixed USD 1.50 injected-fake Gemini/PayPal adapter trace; these are **NOT real paid transactions or one combined checkout**. Zero provider calls or payment POSTs; offline payment endpoint stays disabled. `tests/judge_reproduction.test.mjs` checks both prices, response integrity and claim boundaries.

**One-command reviewer reproduction (QA branch only until approved release):** `npm run judge:reproduce` uses the real loopback HTTP server to verify **both** fictional service categories and calls the real orchestration code **only with injected fake Gemini/PayPal transports**. It writes `output/submission/judge_reproduction_receipt.json` (gitignored), including the exact local source SHA and a four-class evidence boundary. No external provider, money, credentials, user-private SQLite or publication. The command **does not** prove a live integrated browser checkout; separate historical October 28 owner-reported provider tests remain labeled as such. On the unmerged QA branch run `git switch work/paypal-video-integrity-hardening-20261030` before the command; the current public `lead/paypal` may not yet include it.

**Optional historic Sandbox GET (no payment creation):** `npm run owner:sandbox:get:optional` is intentionally blocked without an exact set of flags, an interactive terminal and a separate human confirmation. With *independent owner approval*, it can verify the previously recorded Sandbox order using one OAuth POST and one read-only Orders GET, without a new order or Capture. It does **not** revalidate Gemini, grant publication permission or prove a judge-facing live workflow. See the [integration evidence guide](docs/JUDGE_PAYPAL_AI_INTEGRATION_TRACE_EN.md). This command has **not** been executed against real providers in CI or by the assistant.

**Owner-only historical evidence disclosure (PRIVATE LOCAL ONLY, no provider calls):** On the original PC, `npm run owner:evidence:local -- --review-local-only` optionally checks the prior immutable/read-only private SQLite with the existing guarded inspector and writes a tightly allowlisted `output/submission/owner_local_provider_disclosure_PRIVATE_REVIEW_<unique-id>.json` file created exclusively for that run (never overwrites an earlier export). This may mark **local record consistency only**, never fresh PayPal GET, independent Gemini proof, real money, publication authorization or Devpost submission. It excludes order/capture/merchant IDs, secrets, raw briefs, hashes and private paths. The command without flags reads no private SQLite, makes zero network calls and writes nothing. The resulting ignored file remains PRIVATE; publication requires separate informed owner review.

**Owner-PC minimal review (PRIVATE ONLY):** `npm run owner:review:local` runs existing safe local reproduction, candidate packet and freeze checks, plus immutable/read-only inspection of the earlier private Sandbox/Gemini SQLite **if present on that computer**. The command prints a short, secret-free action summary in `output/submission/owner_review_brief.json` and never records or publishes footage. If it reports missing/stale footage, run `npm run video:record:owner` once and then `npm run owner:review:local` again. No live providers, new orders/captures, private DB writes, uploads or Devpost submission are performed. A consistent saved receipt **is not fresh provider attestation**. This post-freeze QA improvement needs its own exact-HEAD CI before any new source is considered release-ready.

**Inspectable PayPal + AI adapter route:** [integration source and fake-provider API protocol trace](docs/JUDGE_PAYPAL_AI_INTEGRATION_TRACE_EN.md) explains which real adapter functions the injected tests execute, which human consent/GET boundaries are enforced, and why the historical owner Sandbox result is not CI proof. This is a QA source preview, not an approved public release.

**One-command backend evidence trace (NO provider network):** `npm run judge:evidence`. This runs the existing owner MVP orchestrator with **injected fictional Gemini/PayPal transports** and writes `output/submission/judge_evidence_report.md` plus `.json` locally (gitignored). It labels the executed mock flow, the separately owner-reported October 28 Sandbox/Gemini history, and the unsubmitted release state. It **does not** verify a live PayPal transaction or repeat a Capture.

**Evidence boundaries:** The browser makes **zero** Gemini/PayPal provider calls. A separate owner-observed October 28 Gemini skills classification and PayPal **Sandbox-only** approved order/capture/provider-GET test is described as historical evidence, not independently reproduced in CI. No production integration, actual sellers, escrow, PayPal partnership or paid transaction is claimed.

**Verified engineering (QA branch `020d7cc`):** [GitHub Actions #40904439915](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40904439915) passed **572/572 Node tests**, synthetic AI Work/Global Services Chromium journeys, Windows recording and a private default-speed WebM measured at **154.08 seconds (2:34.08)** with `ffprobe`. The recording is synthetic, CI-private and **not** a publicly released or owner-approved YouTube submission. See [English reproduction instructions](docs/JUDGE_REPRODUCTION_EN.md), [MIT license on this development branch](LICENSE), [current video storyboard](docs/VIDEO_STORYBOARD_EN.md), and [owner-reviewed draft Devpost copy](docs/DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md).

**Release status:** Default `main` is older and lacks a visible MIT license; [draft PR #16](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/16) prepares its release landing and license. [Draft QA PR #23](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/23) contains later UI, approval-consent and submission-provenance fixes **not yet merged into `lead/paypal`**. Both need owner review. The video is not approved for public upload, and Devpost has not been submitted. See [owner release checklist](docs/FINAL_OWNER_SUBMISSION_CHECKLIST_20261030.md).

---


> **ACTIVE OWNER DIRECTION · 2026-10-29:** One marketplace, **two working synthetic service categories: AI Work and Global Services** (design/translation/marketing), **one shared Node.js + SQLite matching/quote/contract backend**. The category picker and distinct fictional matches have been added to the offline browser demo. This is **NOT yet** a deployed real seller marketplace, live Gemini browser invocation, actual Global Services payment, fee collection, or PayPal partnership. Historic owner-observed PayPal Sandbox and Gemini API proof is separate from the offline browser fixture. Any older one-category-only claims below are superseded by this notice. [Owner-approved exact scope](docs/strategy/HAECHONG_DUAL_VERTICAL_SCOPE_20261029.md).

> **Contest exclusions:** SOVIA, DBVORA and CODE COUNCIL are **not** required independent contest features or product integrations; standalone BI is not necessary. Payment safety and ordinary SQLite event history are essential infrastructure, not branded audit apps. **Proposed business model only:** if PayPal separately decided to own/operate an eligible marketplace, it could evaluate intermediary fees **plus** existing processing fees; these are not active authorized marketplace partner fees. The user will personally screen-record the fully tested final product; English narration/captions will be matched **after** receiving the actual footage. Prior synthetic automated video is a QA artifact, not final submission. [Production plan](docs/PAYPAL_VIDEO_PRODUCTION_PLAN_20261027.md).

> **2026-10-27 CURRENT PRODUCT NORTH STAR:** **Global AI Commerce Community**, not a freelancer-only destination. The AI freelancer marketplace is the first contest-targeted transaction vertical (owner-reported Gemini + PayPal Sandbox E2E on 2026-10-28; NOT independently provider-verified in public CI). [Read the owner-approved market/community thesis and PayPal sponsor opportunity recommendation](docs/architecture/GLOBAL_AI_COMMERCE_COMMUNITY_NORTH_STAR_20261027.md) for user-generated expansion candidates, risk-adjusted market selection and economic caveats. **Strategy only; the 2026-11-13 contest submission freeze and real PayPal Sandbox + AI E2E obligations still control implementation.** No second vertical or sponsor partnership has been launched or authorized.

> **2026-10-27 LATEST USER CLARIFICATION — EXACT NAMED TOOLCHAIN LOCKED (PayPal):** First read [concrete software/API/DB/model/deploy/QA tools](docs/architecture/FINAL_TOOLCHAIN_20261027.md). No extra features before initial submission; prior [submission freeze](SUBMISSION_SCOPE_FREEZE_20261027.md) still applies. This documentation does not prove functionality, model training, a deployed app, submitted entry or authorization for external payments/data.
> **2026-10-29 owner continuation instruction:** Safe, independent implementation and reproducibility improvements are authorized to continue on `lead/paypal`; this supersedes the earlier feature-freeze note above for this development run. The explicit prohibitions on unapproved provider calls, payments, deployment and submission remain in force.

## Evidence-first submission video — safe owner workflow

The **final candidate recorder** now inserts three explicit historical-proof scenes
(Gemini classified skills; prior USD 1.50 PayPal Sandbox buyer approval / Capture /
owner-reported GET; synthetic-versus-provider evidence boundary) into the tested
offline marketplace/contract walkthrough. CI confirms **157.24 seconds (2:37.24)**
using a true WebM `ffprobe` duration probe on the **CI owner-report-only** variant
([exact-source Actions #40838069960](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40838069960)).
Neither real Gemini nor PayPal is called by the video program.

From the original Windows computer run `npm run video:record:owner` after updating
`lead/paypal`; it **read-only** checks prior owner-private local evidence via
`npm run mvp:receipt` and displays an allowlisted, redacted historical receipt
status only if that local check succeeds. Otherwise it visibly says
**OWNER REPORT ONLY**. Videos and their SHA256 manifests remain exclusively in
ignored `output/videos/`. Next run `npm run submission:candidate:local`, view
`output/submission/submission_candidate.md`, personally review the video and
approve publication separately. Do not publish private SQLite, tokens,
account/order/capture identifiers or the owner-only receipt server URL.

## Judge quick start — offline, no accounts or API keys

Requirements: Node.js 22.5 or newer and Git. To run the complete local verifier, use `npm run verify:local`. To start the interactive demo, run `npm run demo` and open the loopback URL printed in the terminal on the same computer. Stop it with Ctrl+C.

The browser demo uses synthetic marketplace profiles, an `OFFLINE_MOCK` quote, a synthetic contract and disabled payment actions. A collapsed panel separately summarizes owner-reported historical Gemini/Sandbox evidence and labels it **not independently reproduced**; it never contacts a provider. See the [English judge reproduction guide](docs/JUDGE_REPRODUCTION_EN.md) for the walkthrough, source attribution and submission blockers.

During the contract walkthrough, use the **Demo participants** panel to switch between synthetic owner and reviewer sessions, so a judge can submit, reject/revise, and accept a milestone in one browser. This explicit loopback demo switch is CSRF-checked and is not production authentication.

The **Contract audit timeline** (open by default) renders the SQLite owner/reviewer events via read-only GET, not PayPal or a standalone SOVIA service. For an optional private **English-captioned synthetic demo video** run `npm run video:record:owner` on Windows/Linux/macOS: this installs free pinned Playwright + ffmpeg in a git-ignored local Python venv, records the OFFLINE_MOCK demo, and verifies a SHA-256 WebM manifest. Requires Python 3 and Chrome/Chromium, with an initial connection only to install the free tools. Both the video and manifest are written to ignored `output/videos/` and **are not uploaded or final public evidence**. Next run `npm run submission:candidate:local` to generate ignored `output/submission/submission_candidate.md` plus `submission_candidate_status.json`. They explicitly retain YouTube, owner approval, default-branch release and Devpost receipt as incomplete. [English Devpost submission copy and video narration draft](docs/DEVPOST_ENTRY_AND_VIDEO_COPY_EN_20261029.md) are available for owner review only. PayPal provider execution is a separate owner-authorized Sandbox workflow, not the default browser demo.


> **2026-10-25 최신 P0 영속 Checkout Session 보안 검증 — IMPLEMENTED_VERIFIED (OFFLINE):** 구매자 승인 예정 주문 호출 전에 사용자 제공 `{verified:true}` 객체가 통과하던 위험을 제거. `src/pilot_checkout_session_store.mjs` on-disk SQLite(무작위 bearer SHA-256만 저장), 15분 만료·철회·재시작 검증·견적/판매자/금액 결합, 비공개 WeakMap 브랜드 proof; `createOwnerPilotOrderOnce`는 유효한 영속 세션 proof 필수, 잘못된 세션이면 OAuth/Orders **0회**. 실 외부 PayPal/Gemini 호출·주문·캡처·공개배포 **0회**. 신규 9개 Node 테스트, CI 첫 `cb412a7` 실패(검증 헬퍼 범위 참조) → 수정 [`ed8fe928`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/commit/ed8fe9280916b48ba5a3a14b65176765bf3ae69a), [Actions #40112289191](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40112289191) **347/347 Node + Chromium + 18일 원장 PASS**. 이것은 실제 서버 로그인/실 HTTPS 콜백이나 PayPal Business merchant ↔ OAuth 앱 소유권 증거가 아니므로 **D03 65% PARTIAL**, **D04 80% PARTIAL**, **D15 20% PARTIAL**(활성 계획 기본 잔여 5h/안전 10h), 18일 DONE12/PARTIAL3/BLOCKED0/NOT_STARTED3 유지. 별도 주문/캡처/AI 호출은 사용자 추가 승인 전 금지. [상세](docs/technical/PPL_P0_PERSISTED_CHECKOUT_SESSION_PROOF_20261025.md).

> **2026-10-25 P0 OWNER PILOT TRANSPORT BRIDGE — 최신 완료:** 실 PayPal Sandbox OAuth·Gemini 생성은 이전 사용자 1회씩 HTTP 200 검증. 이번 기능에서는 **외부 API/결제/배포 요청 0회**. `src/paypal_sandbox_transport.mjs`에 명시적 내부 `createOwnerPilotOrderOnce` 추가: 검증된 영속 첫-claim → 안전한 판매자·세션·가상 $1~$2·HTTPS callback 계획 → Sandbox OAuth/Orders CREATE 1회 → 주문/수취인/금액/승인 상태 GET 증명. 공개 HTTP 노출·자동 Capture 없음; POST 불명확 시 `UNKNOWN`·재POST 금지. [기능 `293c0bb`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/commit/293c0bb07ba625a226d2ab079598664b1bac827f) [CI #40111106248](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40111106248) **338/338 Node PASS, Chromium 로컬 E2E PASS, 18일 원장 PASS**. 실제 판매자·REST 앱 결합, 인증된 HTTPS callback 실서비스, 가상 주문·구매자 승인·캡처 **NOT_TESTED**. **D03 65% PARTIAL**(기본 잔여 2h/안전 포함 5h), **D04 80% PARTIAL**, 활성 **D15 20% PARTIAL**(기본 5h/안전 10h), 실제 투입 시간 미계측, 전체 DONE12/PARTIAL3/BLOCKED0/NOT_STARTED3 유지. **NEXT:** 별도 owner 승인·실 인증/merchant 검증 없이는 Sandbox 주문/캡처/AI 추가호출 금지. [상세](docs/technical/PPL_P0_SANDBOX_PILOT_TRANSPORT_BRIDGE_20261025.md).

> **2026-10-25 P0 Sandbox buyer checkout payload PLANNED_OFFLINE (최신):** 실 OAuth·Gemini 생성 각 1회 HTTP 200은 이전 사용자 로컬 증거. 이번 작업은 **외부 요청 0회**로 승인 견적·13자 PayPal 판매자·서버 검증 세션·정상 HTTPS 복귀/취소 URL·가상 USD $1–$2 상한을 묶어 Orders v2 `payment_source.paypal.experience_context` 요청을 구성하는 순수 모듈 및 **7개 신규 회귀 테스트**. 기능 SHA [`ee7bd380`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/commit/ee7bd3807c50734764432598de8e3e5280920c04), [CI #40110489991](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40110489991) **332/332 Node + Chromium + 18일 원장 PASS**. **실 API CREATE/BUYER/CAPTURE 불실행**, 콜백 서버/세션 영속 검증·가맹점과 OAuth 앱 실제 연결 미확보. D03 **65% PARTIAL**(기본 잔여 2h/예비 포함 5h), D04 **80% PARTIAL**, D15 **20% PARTIAL**(기본 잔여 5h/예비 포함 10h), 실투입시간 미계측·18일 DONE12/PARTIAL3/NOT_STARTED3 유지. **NEXT:** 별도 owner 승인 전까지 신규 Sandbox 주문/캡처·AI 호출·운영 배포 금지; 인증된 HTTPS 세션·가맹점 결합 확보 후 단발 실 거래 검증. [구현/검증/차단 명세](docs/technical/PPL_P0_SANDBOX_PILOT_ORDER_PLAN_20261025.md).

> **2026-10-25 actual provider success, owner-operated:** PayPal Sandbox OAuth HTTP 200 and Gemini gemini-3.5-flash-lite generation HTTP 200, one call each. D03=65% PARTIAL (Orders/approval/capture 35% outstanding); D04=80% PARTIAL (real AI quote integration not yet verified); D15=20%. 18-day DONE12/PARTIAL3/BLOCKED0/NOT_STARTED3. No secrets or real payments; rerun one-shot disallowed; checkout needs separately scoped consent. [Proof](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/docs/technical/PPL_P0_REAL_PROVIDER_FIRST_SUCCESS_20261025.md).

# PayPal AI Hackathon — Freelancer Payment Agent

**새 채팅 한 문장:** [페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]. 기준 lead/paypal → [CHAT_BOOTSTRAP](CHAT_BOOTSTRAP.md), [HANDOFF](HANDOFF.md), [STATUS](STATUS.md), [CURRENT TASK](docs/roles/lead/LEAD_ACTIVE_WORK.md), [18일 JSON](data/paypal_daily_progress.json).

**2026-10-24:** DONE12/PARTIAL2/BLOCKED1/NOT_STARTED3. D14 100% (오프라인 보안+승인된 MIT LICENSE+영문 재현 초안), [CI 40079691820](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40079691820) Node 180/180 + 로컬 Chromium PASS. 현재 PPL-D15 20%/기본 5h/안전 10h.

제품: 모의 견적→인간 승인→계약·마일스톤·납품/검수→합성 구독, GET-only 통합 로컬 데모. 현재 127.0.0.1 전용이며 **실제 결제·실제 AI·공개 서비스·제출 성공이 아님**. 실 PayPal 주문/캡처 POST는 503 차단, 구독도 합성.

실행: Node 22.5 이상, **npm run preflight:reviewer** (로컬 GET 4개/외부API 0/정상 종료0) → npm test → npm run demo. **npm run preflight:submission** 은 실증/영상/제출 증거가 없어 현재 의도적으로 종료2(실패 아님). python3 render_master_progress.py --check. [English reviewer guide](docs/JUDGE_REPRODUCTION_EN.md) · [video draft](docs/VIDEO_STORYBOARD_EN.md) · [MIT license](LICENSE) · [license decision](docs/LICENSING_DECISION.md). User approved MIT with Copyright (c) 2026 hibi89; package.json SPDX MIT.

브랜치: lead/paypal 개발 정본, main 별도 릴리스, 3개 feature 이력 브랜치 보존. [AGENTS](AGENTS.md), [REQUIREMENTS](REQUIREMENTS.md), [MASTER_PROGRESS](MASTER_PROGRESS.md). 이전 문서/코드의 전체 이력은 Git SHA 31a89d12dad680627c0cefd92ce61928dc6fb337 및 관련 technical 문서로 복원.

D03 실 Business/Personal Sandbox+실 무료 AI 계정 BLOCKED; D04 실 AI 부분 미완료. D15 정적/로컬 사전점검 Node 184 PASS, 외부 호스팅 사용자 별도 승인 필요. D16–D18 운영 검증·영상·Devpost 아직 미완료. 공식 2026-11-13 05:00 KST 마감, 내부 11/11 목표. 유료/Live/실고객/공개 배포를 무단 진행하지 않음.

## D15 hosting preflight (offline only)
- [Cloudflare vs local decision and evidence](docs/technical/PPL_D15_HOSTING_PREFLIGHT_20261024.md).
- `npm run preflight:hosting`: emits explicit blocker inventory and exits **2** on expected no-deploy condition. This does NOT host or configure a service.
- [GitHub Actions #40080872405](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40080872405): 184 Node PASS + Chromium local PASS; no Production URL evidence.

## D15 offline D1 payment idempotency prototype
[SQL migration candidate](migrations/d1/0001_payment_claims.sql) · [safe internal claim helper](src/d1_claim.mjs) · [9 offline Node tests](tests/d1_claim.test.mjs) · [design and unsatisfied release gates](docs/technical/PPL_D15_D1_CLAIM_FENCE_20261024.md). [GitHub Actions #40081717845](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40081717845) Node 193/193 and local Chromium PASS. **No actual D1/PayPal/AI or public deployment proof.**

### D15 internal claim-recovery boundary (offline)
[Read-only/authenticated-tenant recovery prototype](src/d1_recovery.mjs) · [11 local regression tests](tests/d1_recovery.test.mjs) · [assurance and remaining gaps](docs/technical/PPL_D15_D1_RECOVERY_AUTH_20261024.md). [Actions #40082429683](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40082429683) Node 204/204 + Chromium localhost PASS. Explicitly NOT actual D1, real PayPal GET or public authentication.

### D15 local Sandbox GET proof / D1 CAS (not remote PayPal)
[Private GET reconciliation](src/d1_sandbox_get_reconcile.mjs) · [15 synthetic tests](tests/d1_sandbox_get_reconcile.test.mjs) · [verification and blockers](docs/technical/PPL_D15_SANDBOX_GET_CAS_20261024.md). [Actions #40083028520](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40083028520) Node **219/219**, local Chromium PASS, zero real PayPal/D1 calls. D15 remains 20% because Production acceptance is not met.

### Latest D15 offline transport composition (2026-10-24)
[Code](src/offline_sandbox_d1_harness.mjs) · [13 regression tests](tests/offline_sandbox_d1_harness.test.mjs) · [verified boundaries & next action](docs/technical/PPL_D15_OFFLINE_TRANSPORT_COMPOSITION_20261024.md) · [Actions #40084869412](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40084869412) Node **232/232**, Chromium localhost PASS. No real PayPal, AI, Cloudflare D1 or public deployment. D15 20% PARTIAL.

## P0 REAL provider access readiness — owner action, no external calls
**The actual contest blocker is real PayPal Sandbox + one truly free AI generation, NOT more mock D1 tests.** Follow [owner-only PayPal/Gemini setup & non-secret evidence guide](docs/technical/PPL_P0_REAL_PROVIDER_UNBLOCK_20261024.md). Run `npm run preflight:p0`: it checks *only names/presence* of private local variables, never performs OAuth or a provider call, never prints secrets and exits 2 while external evidence is missing. [Actions #40086442379](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40086442379) Node 240/240 and local Chromium PASS; real PayPal/AI/D1 still NOT_TESTED. No payments, Live, paid AI, public deploy or keys in GitHub/chat.

## P0 owner-only single-call real provider evidence probe (prepared, NOT executed)
[Safe execution and limitations](docs/technical/PPL_P0_OWNER_ONE_SHOT_REAL_API_PROBE_20261024.md) · `src/p0_one_shot_probe.mjs` · `scripts/p0_one_shot_probe.mjs`. By default this exits 2 with zero network. Optional owner-authorized sandbox OAuth or one free-confirmed Gemini synthetic text call requires explicit CLI flags and private environment variables; **neither was run**. [GitHub CI #40087887623](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40087887623) 251 Node pass and local Chromium pass (fixture only). D03 0% BLOCKED, D04 80% PARTIAL, D15 20% PARTIAL until real receipts.

## Reviewer/source-release preflight (2026-10-24)
[Corrected English reproduction guide](docs/JUDGE_REPRODUCTION_EN.md) · [static submission evidence auditor](src/submission_evidence_gate.mjs) · `npm run preflight:submission` (intentionally exits **2** because real Sandbox/AI/browser/video/Devpost evidence is missing; zero external API calls). [GitHub Actions #40088755056](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40088755056) — **259/259 Node tests**, localhost Chromium and 18-day schedule PASS. Root MIT LICENSE already exists. This is **not** official release or submission acceptance.

### P0 Gemini new-project model availability (2026-10-24)
The two protected private Gemini adapters now pin `gemini-3.5-flash-lite` via `src/gemini_p0_model.mjs` because Google restricts legacy 2.5 access for new projects. A public Free Tier price listing is **not** owner account proof. Real provider calls, paid fallback and deployment remain forbidden without separate approval. [Audit](docs/technical/PPL_P0_GEMINI_NEW_PROJECT_MODEL_20261024.md).
