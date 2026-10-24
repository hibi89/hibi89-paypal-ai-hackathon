# PayPal AI 역할 및 공통 운영 규칙

- 실제 참가자: 사용자 **1명**. PayPal AI 채팅방은 **총괄 1개 + 순환 작업자 1개**, 작업 feature 브랜치는 3개 유지. 역할 전환은 총괄의 ACTIVE_TASK 지시로만.
- 대회 총괄(`lead/paypal`)이 제출·아키텍처·검수·통합·개발 지시 책임을 진다. 기능 담당자는 `feature/quote-payment`, `feature/delivery`, `feature/subscriptions`만 수정한다. 최상위 해커톤 총괄은 전체 일정·위험·공식 성과만 감독한다.
- 다른 브랜치의 소스/메시지/기능은 사용자 승인 없이 수정하지 않는다. `main`은 검증된 통합 기준이다.
- 시작: **반드시 먼저 lead/paypal:WORKER_START_HERE.md → docs/dispatch/ACTIVE_TASK.md → PROTOCOL.md 확인** 후 지정된 자기 브랜치 `HANDOFF.md` → `STATUS.md` → `AGENTS.md` → `REQUIREMENTS.md` → 역할별 `docs/roles/<role>/OPERATIONS.md`. 최신 GitHub HEAD·실제 소스와 대조한다.
- 작업 종료: 기능/실행/테스트/실패·검증·미검증 구분 → `STATUS`·`HANDOFF`와 메시지함/상위 보고 갱신 → 자기 브랜치에 커밋, 원격 SHA 검증. 단순 질의에는 불필요한 커밋 금지.
- 총괄은 새로운 기능 지시 전에 세 기능 브랜치의 최신 `TO_PAYPAL_LEAD.md`를 전수 확인하고 `MESSAGE_REVIEW.md`에 기록한다. 채팅 간 자동 전송·실시간 동기화 없음.
- 원본·기존 정상 기능·데이터 보존. 설계 2안 비교 후 사용자 승인. 유료 API/결제·개인정보 외부 전송·권한/공개 설정 변경·기존 원본 변경은 승인 필요.
- 토큰·.env·비밀번호·개인정보·비공개 원본 업로드 금지(**저장소 Public**). API Sandbox 성공/합성 테스트/CI/Production 실제 동작을 구분한다.
- 이 운영 문서는 코드 개발 완성의 근거가 아니다. 대회 공식 규정은 https://paypalaihackathon.devpost.com/rules.

## 2026-10-24 KST — 사용자 승인: PayPal 0원/B안 실행계획 확정
- 개발·검수·운영 단일 PayPal 기준: [실행계획 v3.0](docs/PAYPAL_EXECUTION_PLAN_20261024.md) / [0원 스택·과금 차단](docs/ZERO_COST_STACK_AND_GUARDRAILS.md). 이전 승인 대기 후보안은 이 사용자 승인 결정보다 후순위.
- 3개 feature 브랜치는 각자 담당 모듈에 한정, 총괄은 선결제 POC→담당자 1명씩 순차 인수→11/02 실제 E2E→11/06 기능 동결→11/11 조기 제출을 지휘한다.
- 추가 현금 지출 0원 하드캡. 유료 전환/카드 등록/라이브 결제/실 고객 데이터/주요 기능 축소·변경은 별도 명시적 사용자 승인 없이는 금지.

## 최신 운영 변경 — 2026-10-24 KST: 해커톤당 1명 활성
- **이 규칙이 이전 'PayPal 담당자 3명 병렬' 문구보다 우선한다.** 세 해커톤 KIC/PayPal/UGREEN 각각 담당자 1명씩 병렬 진행하되, PayPal 내부에서는 언제나 feature 담당자 한 명만 활성. 두 명은 대기.
- PayPal 순서는 `quote-payment` → `delivery` → `subscriptions`. 이전 작업자 종료/커밋·테스트·메시지 보고와 총괄 확인 전 다음 담당자에게 작업 지시 금지.
- [실행계획 v4.0](docs/PAYPAL_EXECUTION_PLAN_20261024.md), 0원 방침 변경 없음. 별도 담당자 채팅은 아직 실착수 확인 전.

## 최종 승인 — 2026-10-24: 담당자 채팅 하나 + GitHub 지시서 라우팅
- **채팅은 총괄 1개 + 순환 작업자 1개**. 기능 담당 3개의 GitHub 브랜치는 유지하되 3개 별도 작업자 채팅을 만들지 않는다. KIC/UGREEN은 별도 프로젝트다.
- **PayPal 작업자 진입점:** [`WORKER_START_HERE.md`](WORKER_START_HERE.md). **현재 단 하나의 활성 지시:** [`docs/dispatch/ACTIVE_TASK.md`](docs/dispatch/ACTIVE_TASK.md). [큐](docs/dispatch/QUEUE.md)는 미래 일정일 뿐 작업 지시가 아님. 총괄만 lead 지시서 갱신.
- **작업자 채팅 동일 세션 재사용:** 매번 lead의 최신 ACTIVE_TASK 조회 → 지정된 feature 브랜치만 코드·테스트·TO_PAYPAL_LEAD·STATUS/HANDOFF 갱신 → 총괄 검수/인수 후 다음 task_ID+branch 발행. 날짜/큐 보고 자동 전환 금지.
- 최초 `PPL-001` READY, target `feature/quote-payment`: Sandbox 무료 가능성+설계 A/B/계약 v0 및 재현 가능한 증빙. **실행/검증 시작 전**.
- 구 채팅 3개/담당자별 별도 대화 방식과 충돌하면 **이 최신 GitHub 라우팅 규칙이 우선**. 추가 지출 0원·Live 금지·기능 3개 출품 1개·11/13 05:00 공식 제출 마감 유지.
