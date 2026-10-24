# PayPal AI Hackathon

> **[확정 · 2026-10-24 KST]** PayPal 개발은 추가 현금 지출 **0원**, 결제 코어 먼저 검증 후 담당 3명 병렬 개발하는 **B안**, **3기능 통합 작품 1개** 기준으로 진행한다. 최신 [PayPal 전용 실행계획 v3.0](docs/PAYPAL_EXECUTION_PLAN_20261024.md) · [0원 구성/과금 차단](docs/ZERO_COST_STACK_AND_GUARDRAILS.md). Gate: 10/27 Sandbox, 11/02 E2E, 11/06 동결, 11/11 조기 제출, 11/13 05:00 공식 마감. **승인은 구현·API 검증·제출 완료가 아니다.**


> **PayPal 총괄의 최신 단독 개발 일정:** [PayPal Execution Plan v2.0](docs/PAYPAL_EXECUTION_PLAN_20261024.md) — 10/27 실제 Sandbox 검증, 11/02 첫 통합 데모, 11/06 기능 동결, 11/11 제출 목표. 기존 3개 해커톤 통합 공시와 별도이며 PayPal 작업은 이 전용 일정을 우선 참조한다. **사용자 최종 범위 승인 전 제안 일정이다.**

> **3개 대회 전체 일정·충돌·제출 마감:** [docs/COMPETITION_SCHEDULE.md](docs/COMPETITION_SCHEDULE.md) (**2026-10-24 KST 공시**). 이 브랜치에서 작업을 시작할 때 마감과 내부 조기 제출 목표를 확인하며 공식 변경 시 대회 총괄에게 보고한다.


> 참가자는 **1명**, 개발 역할은 독립된 AI 채팅방 4개(대회 총괄 1 + 기능 담당 3). **2026-10-24 KST 초기 구조**. 이 저장소는 사용자가 생성한 **Public** 저장소다.

- 대회 목표(잠정): **AI 프리랜서 계약·결제 자동화 Agent (잠정)**. 주제와 기능 범위는 사용자 승인 전 확정하지 않는다.
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
새 AI 담당자는 자기 **브랜치**에서 `HANDOFF.md` → `STATUS.md` → `AGENTS.md` → `REQUIREMENTS.md` → 역할별 `docs/roles/<role>/OPERATIONS.md`를 읽는다. 역할별 문서가 다른 브랜치에도 있다고 가정하지 않는다.

- [공통 규칙](AGENTS.md)
- [요구 사항](REQUIREMENTS.md)
- [진행 현황](STATUS.md)
- [브랜치 운영](docs/BRANCH_WORKFLOW.md)

**중요:** 어떤 비밀값·고객 개인정보도 공개 저장소에 저장하지 않는다. 개발·범위·권한·비용 확장은 사전 승인 대상이다.
