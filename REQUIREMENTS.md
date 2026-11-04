# 2026-10-31 Owner decision — video last, engineering first

Official Devpost video MUST be **less than three minutes**, publicly viewable on YouTube only after owner approves publication. Target final edit length **02:45** (165 sec) rather than exactly 03:00: Part 1 Freelancer Platform 00:00–01:15 (75s), Part 2 AI Innovation Lab 01:15–02:35 (80s), final recap 02:35–02:45 (10s). These are provisional editing targets, not proof the film exists.

**Critical execution priority:** Finish and verify the actual backend, A2A two-agent protocol and eventual externally approved AI / PayPal integration, then complete both dashboards. Do NOT divert engineering time into repeated voiceovers, recording, fictional PayPal evidence or polishing video until both functional parts are ready. Reserve final submission stage for video production and English Devpost text. A final video may only truthfully show functionality that is run and verified; clearly label simulated/fixture content.

---
# 2026-10-31 OWNER CONFIRMED: TWO-PART PRODUCT SCOPE

PART 1: Existing Proofline Freelancer Platform (AI Work and Global Services) remains intact. Complete the original real-world product: real users, matching, quotes, human approval, seller/reviewer contract and milestone, verified PayPal Sandbox integrations, frontend and deployment. No regression or removal of original records.

PART 2: Proofline Agentic Innovation Technology Lab comprises FIVE separate demo skills in one linked dashboard: A2A Buyer/Seller offer-counter-accept, scoped Delegate & Consent, Gift-finder, Subscription Churn Saver, and Invoice / Dispute Copilot. Their common policy/event ledger is isolated from Part 1. These are all required in the two-part final product.

Safety and status: The 2026-10-31 initial Part 2 implementation is deterministic FICTIONAL fixtures with temporary SQLite, not actual model-to-model AI, actual catalog, PayPal checkout, subscription modification, invoice issuance, or dispute submission. A synthetic agent ACCEPT is never a PayPal payment authorization. Real consented PayPal autonomous payment requires explicit verified provider support, authentication and merchant authority. Actual API use, paid services, public deployment, live data and submission remain separately owner-authorized.

Acceptance criteria: Each module has a clear API/UI proof, role scope, expiry/limit where applicable, idempotency, no implied payment, and evidence. Part 1 and Part 2 remain independently functional; real-world provider integrations must be validated separately and cannot be claimed by offline CI. The existing official deadline and release rules below remain applicable.

---

# PayPal AI Hackathon — 확정 요구 (2026-10-24 최신)

- **제품:** AI 프리랜서 계약·견적·PayPal 결제 Agent 출품작 하나. ① AI 구조화 견적→사람 승인→Sandbox OAuth/Orders v2 create/approve/capture/GET ② 계약·마일스톤·납품/검수(결제와 상태 분리) ③ 구독/실패·취소/Webhook 서명·중복 이벤트.
- **실행자:** PayPal 총괄 채팅 1개가 설계·코딩·테스트·검수·통합까지 직접 진행. 작업 `lead/paypal`; `main` 릴리스, 과거 세 feature 브랜치는 증빙 보존. 기능 축소 아님.
- **0원 신규 현금 하드캡:** Cloudflare Workers/D1 Free, 실제 사용 가능한 무료 AI, PayPal Sandbox 후보. API/국가/무료 계정·Rate 확인 전 실제 동작·무료 제공 보장 주장 금지. Live·카드·유료 서비스/실 고객 정보 금지.
- **금전 안전:** 인증된 인간 승인 및 quote version/금액/통화/merchant 재검증. 멱등 키+DB unique/원자 전이, UNKNOWN 시 추가 캡처 차단·PayPal GET, 웹훅 서명·event ID, GET/F5/redirect에서 결제 생성·캡처 금지.
- **제출:** 내부 2026-11-11, 공식 **11/13 05:00 KST**. 실제 PayPal+AI 기능, 공개 오픈소스 소스와 루트 LICENSE, 영문 Devpost/실행 안내, 3분 미만 공개 YouTube, 안전한 심사위원 접속 또는 재현 경로. [공식 규정](https://paypalaihackathon.devpost.com/rules).
- **검증 구분:** PPL-001 합성 Node 계약 11/11 PASS는 실 PayPal 결제 성공이 아님. Sandbox credentials/Business·Personal buyer, 무료 AI, D1·브라우저·Production/제출 영수증은 미검증.
- [현재 작업](docs/roles/lead/LEAD_ACTIVE_WORK.md) · [예산 수칙](docs/ZERO_COST_STACK_AND_GUARDRAILS.md)
