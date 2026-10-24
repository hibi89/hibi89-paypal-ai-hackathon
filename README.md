# PayPal AI Hackathon

> **[2026-10-24 최신 운영] PayPal 통합 개발자 채팅 1개 / 현재 지시 기반 동적 브랜치 전환.** 이 브랜치는 역할 소유용이지 별도 작업자 채팅을 뜻하지 않는다. 항상 총괄 `lead/paypal`의 [WORKER_START_HERE.md](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/WORKER_START_HERE.md) → [ACTIVE_TASK.md](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/docs/dispatch/ACTIVE_TASK.md) → [PROTOCOL.md](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/docs/dispatch/PROTOCOL.md)를 원격 조회. **현재 ACTIVE_TASK의 target_branch가 `feature/quote-payment`가 아니면 이 브랜치 개발·수정 금지.** 같은 작업자 채팅이 총괄 검수 후 다음 브랜치로 이동한다. 비용 0원/Sandbox only/민감정보 공개 금지. 초기 ACTIVE_TASK는 quote-payment 대상으로 발행되었으나 **최신 원격 지시 재확인이 필수**.
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
