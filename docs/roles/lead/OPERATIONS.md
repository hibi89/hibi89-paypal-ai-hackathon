# PayPal AI Hackathon 총괄 운영 절차

총괄 전용 브랜치 **`lead/paypal`**. 책임은 PayPal AI Hackathon 제품 아키텍처·기술 검증·제출 및 아래 기능 담당 세 AI의 업무 감독. 통합 총괄은 개발하지 않고 **전체 일정·위험**을 감독한다.

## 모든 신규 지시 이전 필수 작업
1. `feature/quote-payment` HEAD와 `docs/roles/quote-payment/TO_PAYPAL_LEAD.md` 확인 — AI 견적/승인/PayPal Sandbox 결제
2. `feature/delivery` HEAD와 `docs/roles/delivery/TO_PAYPAL_LEAD.md` 확인 — 납품·거래 단계 관리
3. `feature/subscriptions` HEAD와 `docs/roles/subscriptions/TO_PAYPAL_LEAD.md` 확인 — 구독 결제 예외 대응

각 최신 상태를 확인한 뒤 `docs/roles/lead/MESSAGE_REVIEW.md`에 조회 시각(KST), 브랜치 SHA, 신규/보류/해결 항목과 결정 기록. 메시지함을 읽지 못했으면 **미확인**으로 남기고 기존 지시와 충돌하는 새 지시를 금지.

## 중요한 작업 종료
- 소스·테스트·CI·API·브라우저/서비스 검증 대조 → `docs/roles/lead/STATUS.md`·`docs/roles/lead/HANDOFF.md`·`docs/roles/lead/TO_HACKATHON_LEAD.md` **같은 작업에서 최신화** → 원격 SHA 검증.
- 기능 담당자는 자기 feature 브랜치만, 총괄은 `lead/paypal`의 운영 문서·설계와 검증된 통합 PR만 관리.
- 실제 결제/개인 데이터/유료 서비스·권한/주제/범위 변경 등은 사용자 승인. 원본·보안 보존.

## 새 대화의 필수 독해
`lead/paypal`의 `docs/roles/lead/HANDOFF.md` → `STATUS.md` → `OPERATIONS.md` → 루트 `AGENTS.md` → `REQUIREMENTS.md` → 기능 메시지함 세 곳 → GitHub HEAD와 실제 소스. 채팅방 간 알림·실시간 갱신을 가정하지 않는다.

## 2026-10-24 KST — 3개 해커톤 통합 일정 공시
- 이 브랜치 공식 일정: [docs/COMPETITION_SCHEDULE.md](../../COMPETITION_SCHEDULE.md). `PayPal` 대회 총괄은 모든 주요 작업/지시 전에 본인 마감·전체 충돌·내부 조기 제출 목표를 검토한다.
- **현재 최우선:** 공식 11/13 05:00 KST까지 실제 PayPal+AI 작동 앱·공개 LICENSE/소스·실행 안내·3분 미만 YouTube·Devpost 제출.
- **내부 조기 제출 목표:** 11/11 KST (**주최 공식 마감이 아닌 프로젝트 목표**).
- **교차 위험:** KIC 11/12 10:00 PDF와 19시간 간격이며 PayPal은 그보다 앞서 완성작 조기 제출 목표.
- 제출 결과·기술 상태는 변경 없음. **등록 완료 ≠ 작품 생성 ≠ 최종 제출**; 주제·기능은 사용자 승인 전 잠정, CI/실 API/배포·시연 미검증.
- 발표/본선 등 후속 일정은 일정표 원문 기준. 중요 변경·지연·사용자 일정 개입은 총괄 상위 보고를 갱신하고 전체 총괄에게 전달할 것.

- 지시 전 세 기능 담당자의 TO_PAYPAL_LEAD 메시지함 최신 SHA/원문도 검토한다. 공식 일정 변경을 확인했다면 주최 출처와 KST 변환 근거를 함께 기록한다.

## 2026-10-24 KST — 사용자 승인: PayPal 0원/B안 실행계획 확정
- PayPal 작업 우선 일정은 [전용 실행계획 v3.0](../../PAYPAL_EXECUTION_PLAN_20261024.md); 0원 스택 정책은 [Guardrails](../../ZERO_COST_STACK_AND_GUARDRAILS.md). 3개 해커톤 통합 일정은 기록용으로 보존하지만 **PayPal 개발 우선순위 계산에 사용하지 않는다**.
- 새 기능 지시 전 **세 작업자 메시지함 직접 확인** 및 `MESSAGE_REVIEW.md` 기록. 담당자별 10/27, 11/02, 11/06 Gate 상태·API 증거·Git SHA·무료 한도/비용 추적. 11/11 Devpost 제출은 실제 증빙만 인정.
- B안과 3개 모듈 통합 목표는 승인됨. **유료 전환/Live 결제/외부 실제 데이터/기능 범위 변경**은 여전히 별도 승인 필요.

## 2026-10-24 KST — 최종 운영 변경: PayPal 기능 담당 1명 순차 활성
- 이전 '3명 병렬'은 더 이상 유효하지 않음. **PayPal 기능 활성 작업자는 한 번에 단 1명.** 다른 두 작업자는 대기. 전역 3대회(KIC/PayPal/UGREEN)는 각 대회 1명씩 병렬 가능.
- 신규 지시 전 각 feature HEAD·TO_PAYPAL_LEAD 확인. 이전 작업자 중단→검증/커밋/STATUS·HANDOFF/TO_PAYPAL_LEAD 인수→다음 작업자 1명에게 지시. 각각의 담당자에게 동시 실행 지시를 보내지 않음.
- 유효 일정 [단일 슬롯 v4.0](../../PAYPAL_EXECUTION_PLAN_20261024.md), 0원 하드캡 그대로. 실제 기능/Devpost/무료 배포 성공은 아직 증명되지 않음.

## 최종 승인 — 2026-10-24: 담당자 채팅 하나 + GitHub 지시서 라우팅
- **채팅은 총괄 1개 + 순환 작업자 1개**. 기능 담당 3개의 GitHub 브랜치는 유지하되 3개 별도 작업자 채팅을 만들지 않는다. KIC/UGREEN은 별도 프로젝트다.
- **PayPal 작업자 진입점:** [`WORKER_START_HERE.md`](../../../WORKER_START_HERE.md). **현재 단 하나의 활성 지시:** [`docs/dispatch/ACTIVE_TASK.md`](../../dispatch/ACTIVE_TASK.md). [큐](../../dispatch/QUEUE.md)는 미래 일정일 뿐 작업 지시가 아님. 총괄만 lead 지시서 갱신.
- **작업자 채팅 동일 세션 재사용:** 매번 lead의 최신 ACTIVE_TASK 조회 → 지정된 feature 브랜치만 코드·테스트·TO_PAYPAL_LEAD·STATUS/HANDOFF 갱신 → 총괄 검수/인수 후 다음 task_ID+branch 발행. 날짜/큐 보고 자동 전환 금지.
- 최초 `PPL-001` READY, target `feature/quote-payment`: Sandbox 무료 가능성+설계 A/B/계약 v0 및 재현 가능한 증빙. **실행/검증 시작 전**.
- 구 채팅 3개/담당자별 별도 대화 방식과 충돌하면 **이 최신 GitHub 라우팅 규칙이 우선**. 추가 지출 0원·Live 금지·기능 3개 출품 1개·11/13 05:00 공식 제출 마감 유지.
