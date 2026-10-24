> **PayPal 새 채팅 한 문장 실행:** `페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈` → [CHAT_BOOTSTRAP.md](CHAT_BOOTSTRAP.md) → `lead/paypal` 최신 원격 HEAD → 현 작업 직접 개발·테스트·GitHub 최신화. 별도 작업자 채팅 없음.

# PayPal AI Hackathon — Freelancer Payment Agent

> **현행 규칙(2026-10-24): PayPal 총괄 채팅 하나가 설계·코딩·테스트·검수·통합·Devpost 제출까지 직접 맡는다. 별도 작업자 채팅과 작업자 라우팅은 폐지했다.**

- **개발 원본:** `lead/paypal`; **검증 릴리스:** `main`. `feature/quote-payment`, `feature/delivery`, `feature/subscriptions`는 보존된 기존 작업 이력이며 신규 작업하지 않는다.
- **사용자 `ㄱ`:** [HANDOFF](HANDOFF.md) → [STATUS](STATUS.md) → [AGENTS](AGENTS.md) → [REQUIREMENTS](REQUIREMENTS.md) → [현재 실제 작업](docs/roles/lead/LEAD_ACTIVE_WORK.md) → 소스/테스트를 확인해 총괄 스스로 구현·검증·커밋한다.
- **[일차별 100% 진행률·잔여시간 현재 원장](data/paypal_daily_progress.json)** · [작업 종료 보고 의무](docs/DAILY_PROGRESS_REPORTING.md): Day1·Day2·Day5 100% (오프라인 범위), Day3 0% 실계정 차단 (3h/8h), Day4 80% (2h/4h), 현재 Day6 0% (5h/9h); 괄호는 남은 예상/안전시간.
- [보수적 일별 예상시간·완료 기준](docs/DAILY_CAPACITY_PLAN_20261024.md) (**PayPal 82h 예상·164h 지연 포함; 3대회 병행 시 고위험**)
- [제출 후 심사 접근 유지·수상 대응표](docs/POST_SUBMISSION_JUDGING_PLAN_20261024.md) (PayPal은 별도 공식 본선 개발 단계 없음; 기본 8h·안전 16h, 조건부)
- [단일 개발 프로토콜](docs/roles/lead/LEAD_FULLSTACK_PROTOCOL.md) · [브랜치 규정](docs/BRANCH_WORKFLOW.md) · [실행 일정](docs/PAYPAL_EXECUTION_PLAN_20261024.md).

- [PPL-002 Day1 code, API/CI evidence](docs/technical/PPL_002_DAY1_API_CONTRACT.md) — 23 new offline tests + 11 existing, CI success; real PayPal/order unavailable.

- [PPL-002 Day2 SQLite 영속 레저·오프라인 CI](docs/technical/PPL_002_DAY2_SQLITE_LEDGER.md) — Day2 100%; 실제 PayPal API 호출은 여전히 차단

- [4·5일차 선행 개발 검증·남은 항목](docs/technical/PPL_004_005_ADVANCE_WORK_20261024.md): `npm run demo` 로컬 전용 (모의 견적, PayPal 비활성), PayPal Sandbox 전용 어댑터(주입된 mock transport 테스트만).

- [5일차 결제 원장↔Sandbox mock 어댑터 연동 검증](docs/technical/PPL_D05_LEDGER_TRANSPORT_RECONCILIATION.md) (**mock 95/95 PASS**, 실제 결제 미실행)

## 제품 및 제약
프리랜서 **AI 견적 → 사람 승인 → PayPal Sandbox 주문·결제 → 계약·마일스톤·납품 → 구독·실패 예외** 통합 작품 1개. 신규 현금 지출 **0원**, Live/유료 API/카드 등록/실 고객 데이터 금지.

기존 작업자 `feature/quote-payment@876d7d1`의 PPL-001 설계·계약 가드·11개 합성 테스트를 원본 blob 그대로 총괄 브랜치로 이관했으며, **Node v22.16.0으로 독립 재실행 11 PASS/0 FAIL**. 이는 오프라인 검증으로, PayPal 실제 Sandbox/무료 AI/브라우저/Production 성공은 아니다.

## 마감
2026-11-13 **05:00 KST** 공식 제출, 11/11 내부 조기 목표. [0원 정책](docs/ZERO_COST_STACK_AND_GUARDRAILS.md), [상위 총괄 보고](docs/roles/lead/TO_HACKATHON_LEAD.md), [공식 규정](https://paypalaihackathon.devpost.com/rules).

**폐기된 작업자 입구:** `WORKER_START_HERE.md` 및 `docs/dispatch/*`는 기록용이며 작업 실행 기준이 아니다. 과거 전문은 Git 이력에 남아 있다.
