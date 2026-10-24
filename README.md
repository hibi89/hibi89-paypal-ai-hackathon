# PayPal AI Hackathon

> 참가자는 **1명**, 개발 역할은 독립된 AI 채팅방 4개(대회 총괄 1 + 기능 담당 3). **2026-10-24 KST 초기 구조**. 이 저장소는 사용자가 생성한 **Public** 저장소다.

- 대회 목표(잠정): **AI 프리랜서 계약·결제 자동화 Agent (잠정)**. 주제와 기능 범위는 사용자 승인 전 확정하지 않는다.
- 제출 마감: **2026-11-13 05:00 KST**.
- 전체 일정·상위 보고: [2026 통합 해커톤 상황실](https://github.com/hibi89/hackathon-command-center-2026/blob/main/START_HERE.md).
- 초기 단계: **브랜치 5개·운영 문서 구축 및 원격 존재 검증 완료**, 코드·실 API·제품·제출물 구현은 미착수.

## 역할 브랜치
- `main`: 검증된 코드·최종 통합 기준.
- `lead/paypal`: 대회 총괄, 설계/검수/기획/제출/상위 보고.
- `feature/quote-payment`: 기능 개발 담당 1.
- `feature/delivery`: 기능 개발 담당 2.
- `feature/subscriptions`: 기능 개발 담당 3.

## 역할별 새 채팅 진입점
**[docs/ROLE_COORDINATION.md](docs/ROLE_COORDINATION.md)**에서 총괄 및 기능 담당 3명의 전담 브랜치·인수인계·메시지함을 바로 연다. 이 안내서는 `main`에만 존재하며 역할별 최신 상태는 각 기능 브랜치에 있다.

## 읽을 문서
새 AI 담당자는 자기 **브랜치**에서 `HANDOFF.md` → `STATUS.md` → `AGENTS.md` → `REQUIREMENTS.md` → 역할별 `docs/roles/<role>/OPERATIONS.md`를 읽는다. 역할별 문서가 다른 브랜치에도 있다고 가정하지 않는다.

- [공통 규칙](AGENTS.md)
- [요구 사항](REQUIREMENTS.md)
- [진행 현황](STATUS.md)
- [브랜치 운영](docs/BRANCH_WORKFLOW.md)

**중요:** 어떤 비밀값·고객 개인정보도 공개 저장소에 저장하지 않는다. 개발·범위·권한·비용 확장은 사전 승인 대상이다.
