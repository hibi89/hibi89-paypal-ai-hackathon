# MASTER_PROGRESS — PayPal AI Hackathon

> **자동 생성 파일입니다. 직접 수정 금지.** 단일 JSON 정본: `data/paypal_daily_progress.json`. 갱신: `python render_master_progress.py --write`; 검증: `python render_master_progress.py --check`.
> 예정일과 실제 수행일은 별개. DONE은 **그날 정한 검증 범위만** 완료했음을 의미하며 실제 외부 API/운영/제출 성공과 다릅니다.
> 시간은 예상 작업·별도 안전 예비의 **미사용 작업 배정량**입니다. 외부 승인 대기 및 미계측 실투입시간은 포함하지 않습니다.

**전체 18일 / 완료 10 / 부분 1 / 차단 1 / 미착수 6**

**다음 실행 포인터: `PPL-D13`** · 원래 일정: `docs/DAILY_CAPACITY_PLAN_20261024.md`

| ID | 예정일(KST) | 원래 작업 | 상태 | 해당 일 완료율 | 남은 기본 | 남은 예비 | 실제 수행일 | 증거(경로·CI) | 검증 SHA | 회수 목표일 |
|---|---|---|---|---:|---:|---:|---|---|---|---|
| PPL-D01 | 2026-10-25 | Quote read-only GET; explicit human-approved POST; offline API security validation | DONE | 100% | 0h | 0h | 2026-10-24 | src/quote_api.mjs @ 9fa2084e27995ec7d77e5907c2390246f13f4150; tests/quote_api.test.mjs | — | — |
| PPL-D02 | 2026-10-26 | Durable DB and unique/atomic payment operation claims | DONE | 100% | 0h | 0h | 2026-10-24 | src/sqlite_ledger.mjs & tests/sqlite_ledger.test.mjs @ 0c07306bb9633183358f0a1c86a8a3d28653d15e; SQLite file persists close/open; UNIQUE quote/remote IDs | — | — |
| PPL-D03 | 2026-10-27 | Access feasibility: actual PayPal Sandbox and free AI external API (no credential disclosure) | BLOCKED | 0% | 3h | 5h | — | — | — | — |
| PPL-D04 | 2026-10-28 | AI quote draft and explicit human approval UI; mock-only forward development | PARTIAL | 80% | 2h | 2h | 2026-10-24 | src/quote_draft.mjs; src/quote_api.mjs @ ee0427e8a6c4ef22904e671f70cfa59120c009dc; synthetic tests | — | — |
| PPL-D05 | 2026-10-29 | PayPal Sandbox-only OAuth/Orders create/GET/capture adapter; real API access remains blocked | DONE | 100% | 0h | 0h | 2026-10-24 | src/paypal_sandbox_transport.mjs @ 7e1b7ee8de5a6cdfee7f21560ff97f0d3c6760b2; cannot select live URL; mock OAuth auth | — | — |
| PPL-D06 | 2026-10-30 | Quote→human approval→payment-safe user flow validation; browser and security adapter gap review | DONE | 100% | 0h | 0h | 2026-10-24 | tests/browser_offline_e2e.py & .github/workflows/test.yml @ 04c57a4c39767835940ed9dc3a42ca2793b47643; GitHub CI 40066792213 browser Chromium PASS with local UI draft, approval, quote revision | — | — |
| PPL-D07 | 2026-10-31 | Contract, milestone, and delivery schema with ownership, separated settlement vs fulfillment and append-only history | DONE | 100% | 0h | 0h | 2026-10-24 | src/contract_milestones.mjs + src/sqlite_ledger.mjs; tests/contract_milestones.test.mjs (D07 CI 40069063023, SHA e682d6dd): schema, FK, snapshot sum, strict ordering, legacy migration | — | — |
| PPL-D08 | 2026-11-01 | Authenticated server API for contract, milestones, delivery submission and reviewer acceptance/rejection | DONE | 100% | 0h | 0h | 2026-10-24 | src/contract_api.mjs creates/reads contract and events via trusted session context; Node actual 127.0.0.1 API test, CI 40070199115 @ 17b804e | — | — |
| PPL-D09 | 2026-11-02 | Contract/delivery UI and separated payment status local E2E; real PayPal Sandbox dependent tests remain D03 external blocked | DONE | 100% | 0h | 0h | 2026-10-24 | web/offline_demo.html and web/contract_client.js: contract creation from approved quote, read-only GET quote/contract, D09 Chromium real loopback E2E in CI 40071015803 @ 9e3ee79a | — | — |
| PPL-D10 | 2026-11-03 | Official PayPal Subscriptions and Webhooks support/region/cost feasibility; offline subscription state-machine contract | DONE | 100% | 0h | 0h | 2026-10-24 | Official PayPal https://developer.paypal.com/api/subscriptions/v1, /api/subscriptions/v1/definitions/subscription/, /subscriptions/webhooks/ and /reference/country-codes researched 2026-10-24; region account eligibility NOT_TESTED; docs/technical/PPL_D10_SUBSCRIPTIONS_FEASIBILITY_20261024.md | — | — |
| PPL-D11 | 2026-11-04 | Offline webhook ingress, signature verification boundary, SQLite event-id idempotency and out-of-order fail closed with synthetic signature tests; real PayPal Sandbox remains blocked | DONE | 100% | 0h | 0h | 2026-10-24 | src/webhook_ingress.mjs @ 8e4d6503: original raw body CRC32(decimal), pinned sandbox cert URL, off-line-only RSA-SHA256 Fetch handler, no automatic service wiring; 17 fixture tests @ 6f5cc754 | 1fbbb56357b3243c2ff45c19f549d49780491ada | — |
| PPL-D12 | 2026-11-05 | 구독 UI 및 실패·취소·복구 시나리오 | DONE | 100% | 0h | 0h | 2026-10-24 | D12 design/guards: src/subscription_demo_store.mjs + src/subscription_demo_api.mjs; synthetic-only lifecycle with NOT_VERIFIED payment, version CAS/CSRF/trusted owner and forbidden CANCELLED recovery | 80bb6c8442e02bde8247980537cc1efbc05e6698 | — |
| PPL-D13 | 2026-11-06 | 전체 기능 통합 회귀·주요 결함 수정 | NOT_STARTED | 0% | 6h | 5h | — | — | — | — |
| PPL-D14 | 2026-11-07 | 보안/권한/Rate 제한·LICENSE·영문 자료 초안 | NOT_STARTED | 0% | 4h | 6h | — | — | — | — |
| PPL-D15 | 2026-11-08 | 무료 호스팅·D1·실제 데모 배포/복구 | NOT_STARTED | 0% | 6h | 6h | — | — | — | — |
| PPL-D16 | 2026-11-09 | 실제 브라우저 E2E·심사위원 접근 검수 | NOT_STARTED | 0% | 5h | 5h | — | — | — | — |
| PPL-D17 | 2026-11-10 | 영문 Devpost 안내·3분 미만 영상 촬영/편집 | NOT_STARTED | 0% | 6h | 5h | — | — | — | — |
| PPL-D18 | 2026-11-11 | Devpost 제출·링크/권한·접수증 검수 | NOT_STARTED | 0% | 3h | 4h | — | — | — | — |

## 보류·차단 / 다시 확인할 일

- **PPL-D03 (2026-10-27, 0%):** 실 PayPal Sandbox Business/Personal·무료 AI 계정 접근 불가 / 재검토: 실 Developer 앱과 buyer 계정 접근 확보 시 D03 재검토 / 회수일: —
- **PPL-D04 (2026-10-28, 80%):** 실 무료 AI 프로바이더 실행 검증이 누락됨 / 재검토: 무료 AI 실 API 이용 가능할 때 D04 잔여20% 검증 / 회수일: —

## 이미 선행한 작업과 검증 경계

- PPL-D01 (2026-10-25): 예정일 앞당겨 독립 수락범위 검증. 실제 PayPal/AI/배포 조건은 별도.
- PPL-D02 (2026-10-26): 예정일 앞당겨 독립 수락범위 검증. 실제 PayPal/AI/배포 조건은 별도.
- PPL-D04 (2026-10-28): 예정일 앞당겨 독립 수락범위 검증. 실제 PayPal/AI/배포 조건은 별도.
- PPL-D05 (2026-10-29): 예정일 앞당겨 독립 수락범위 검증. 실제 PayPal/AI/배포 조건은 별도.
- PPL-D06 (2026-10-30): 예정일 앞당겨 독립 수락범위 검증. 실제 PayPal/AI/배포 조건은 별도.
- PPL-D07 (2026-10-31): 예정일 앞당겨 독립 수락범위 검증. 실제 PayPal/AI/배포 조건은 별도.
- PPL-D08 (2026-11-01): 예정일 앞당겨 독립 수락범위 검증. 실제 PayPal/AI/배포 조건은 별도.
- PPL-D09 (2026-11-02): 예정일 앞당겨 독립 수락범위 검증. 실제 PayPal/AI/배포 조건은 별도.
- PPL-D10 (2026-11-03): 예정일 앞당겨 독립 수락범위 검증. 실제 PayPal/AI/배포 조건은 별도.
- PPL-D11 (2026-11-04): 2026-10-24 선행: 오프라인 합성 RSA Webhook·SQLite 중복 원장·재전송/GET-first 17개 신규 테스트 및 전체 163/163 Node, Chromium CI PASS. 실제 PayPal 서명·HTTPS 수신 NOT_TESTED.
- PPL-D12 (2026-11-05): 2026-10-24 선행: 구독 모의 UI(활성·실패·복구·취소) SQLite·권한/CSRF 및 실제 로컬 Chromium 171 Node CI PASS. 실제 PayPal 구독/거래/GET 미검증.

## 운영 의무

1. 모든 예정일을 JSON에서 보존하고 날짜를 건너뛰어 삭제하지 않습니다. 선행 수행은 실제 수행일을 기록하되 다음 미완료 날짜를 자동 완료 처리하지 않습니다.
2. 작업 완료·부분중단·차단 변경 때 **JSON 정본 → 이 Markdown 재생성 → CI --check**를 같은 GitHub 커밋으로 반영합니다. 과거 운영문서는 이력이며 충돌하면 JSON·실제 테스트 증거를 확인합니다.
3. DONE/100%는 해당 날짜 범위만 뜻합니다. 실제 PayPal/DAKER/NAS 접근·실고객·운영 배포·Devpost는 별도 외부 영수증 없으면 NOT_TESTED로 유지합니다.
4. 예비시간을 기본시간에 합쳐 '실제 사용시간'이라고 주장하지 않습니다. 조건이 충족되지 않은 BLOCKED 행은 새 날짜가 와도 DONE으로 바뀌지 않습니다.
