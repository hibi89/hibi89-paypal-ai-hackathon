# PayPal AI Hackathon

> **현재 작업자 지시 시스템:** [**WORKER_START_HERE.md**](WORKER_START_HERE.md) → [**ACTIVE_TASK.md**](docs/dispatch/ACTIVE_TASK.md) → [PROTOCOL](docs/dispatch/PROTOCOL.md). **작업자 채팅 1개만 사용**, GitHub가 현재 대상 브랜치를 지정한다. 현재 활성 작업 **PPL-001 / quote-payment / READY**.

> **[최신 승인 · 2026-10-24 KST]** 세 해커톤은 각각 최대 담당자 1명만 활성화. **PayPal 내부 활성 기능 담당자는 1명**, 나머지 2명 대기. 순서: `quote-payment`(10/26~30) → `delivery`(10/31~11/02) → `subscriptions`(11/03~06) → 단일 담당자 통합 검수(11/07~09). 세 브랜치/기능은 유지, 여러 PayPal 작업자를 동시에 실행하지 않는다. [확정 순차 일정 v4.0](docs/PAYPAL_EXECUTION_PLAN_20261024.md).

> **[확정 · 2026-10-24 KST]** PayPal 개발은 추가 현금 지출 **0원**, 결제 코어부터 검증하고 담당자 **한 명씩 순차 개발하는 운영 방식**, **3기능 통합 작품 1개** 기준으로 진행한다. 최신 [PayPal 전용 실행계획 v4.0](docs/PAYPAL_EXECUTION_PLAN_20261024.md) · [0원 구성/과금 차단](docs/ZERO_COST_STACK_AND_GUARDRAILS.md). Gate: 10/27 Sandbox, 11/02 E2E, 11/06 동결, 11/11 조기 제출, 11/13 05:00 공식 마감. **승인은 구현·API 검증·제출 완료가 아니다.**


> **PayPal 총괄 단독 개발 일정(승인됨):** [PayPal Execution Plan v4.0](docs/PAYPAL_EXECUTION_PLAN_20261024.md) — 10/27 Sandbox API 검증, 11/02 첫 통합 E2E, 11/06 기능 동결, 11/11 조기 제출 목표. **실제 계정/API와 기능 구현은 아직 미검증이다.**

> **이전 통합 공시(참고 기록):** [docs/COMPETITION_SCHEDULE.md](docs/COMPETITION_SCHEDULE.md) (**2026-10-24 KST 공시**). 이 브랜치에서 작업을 시작할 때 마감과 내부 조기 제출 목표를 확인하며 공식 변경 시 대회 총괄에게 보고한다.


> 참가자는 **1명**. **PayPal AI 채팅방 2개**(총괄 1 + 순환 개발 작업자 1), 개발용 feature 브랜치 3개. 이 저장소는 Public이다.

- **사용자 승인된 실행 방향:** AI 프리랜서 계약·결제 자동화 Agent, **견적·결제 / 납품 / 구독 3기능 통합 출품작 1개**. 세부 구현·국가별 API 가용성은 실제 검증 후 조정한다(기능 삭제·축소/비용 변경은 재승인).
- 제출 마감: **2026-11-13 05:00 KST**.
- 전체 일정·상위 보고: [2026 통합 해커톤 상황실](https://github.com/hibi89/hackathon-command-center-2026/blob/main/START_HERE.md).
- 초기 단계: **브랜치·운영 문서 준비**, 코드·실 API·제품·제출물 구현은 미착수.

## 역할 브랜치
- `main`: 검증된 코드·최종 통합 기준.
- `lead/paypal`: 대회 총괄, 설계/검수/기획/제출/상위 보고.
- `feature/quote-payment`: 기능 개발 담당 1.
- `feature/delivery`: 기능 개발 담당 2.
- `feature/subscriptions`: 기능 개발 담당 3.

## 읽을 문서
**작업자 채팅 하나를 처음 열 때 [WORKER_START_HERE.md](WORKER_START_HERE.md)부터 읽는다.** 매번 [현재 활성 지시서](docs/dispatch/ACTIVE_TASK.md)와 [프로토콜](docs/dispatch/PROTOCOL.md) 확인 후, 지시된 **해당 브랜치**에서 `HANDOFF.md` → `STATUS.md` → `AGENTS.md` → `REQUIREMENTS.md` → 역할별 `docs/roles/<role>/OPERATIONS.md`를 읽는다. 역할별 문서가 다른 브랜치에도 있다고 가정하지 않는다.

- [공통 규칙](AGENTS.md)
- [요구 사항](REQUIREMENTS.md)
- [진행 현황](STATUS.md)
- [브랜치 운영](docs/BRANCH_WORKFLOW.md)

**중요:** 어떤 비밀값·고객 개인정보도 공개 저장소에 저장하지 않는다. 개발·범위·권한·비용 확장은 사전 승인 대상이다.
