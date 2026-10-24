# PayPal 순차 작업 큐 — 총괄만 활성화

> **QUEUE 항목은 작업 지시가 아님.** 작업자는 `lead/paypal:docs/dispatch/ACTIVE_TASK.md`의 `READY/IN_PROGRESS`인 **하나만** 수행한다. 미래 항목의 실제 수락·작업 브랜치·기한은 전환 시 총괄이 재설계할 수 있다. 2026-10-24 KST 초안.

| 순서 | Task ID | 역할/타깃 브랜치 | 예정 구간(KST) | 목표 | 현재 상태 |
|---|---|---|---|---|---|
| 1 | **PPL-001** | quote-payment | 10/24~26 | Sandbox 무료 접근/구현안 A/B/공통 계약 v0 및 검증 준비 | **ACTIVE: READY** |
| 2 | PPL-002 | quote-payment | 10/26~30 | AI 견적→사람 승인→실 Sandbox Orders create/approve/capture 및 멱등·오류/테스트 | **QUEUED, 승인·발행 전 실행 불가** |
| 3 | PPL-003 | delivery | 10/31~11/02 | 계약/납품/검수 CRUD·DB 영속화 및 결제 상태 연동, E2E | **QUEUED** |
| 4 | PPL-004 | subscriptions | 11/03~06 | Subscriptions/Webhooks 접근 검증·실패/취소/중복 이벤트 안전 처리 | **QUEUED** |
| 5 | PPL-005 | 총괄 재지정 1개 feature만 | 11/07~09 | PR 통합·종합 E2E·보안·무료 한도·회귀테스트·문서 | **QUEUED** |
| 6 | PPL-006 | 총괄/필요 시 활성 feature 1개 | 11/10~11 | 실제 앱 3분 미만 YouTube·영문 제출·Devpost 접수 확인 | **QUEUED** |

## 다음 작업으로 넘어가는 절차

1. 현재 작업자 `READY_FOR_REVIEW` 또는 `BLOCKED` 보고 제출(지정 feature 브랜치).
2. 총괄이 코드·테스트·SHA·비용·미지원/API 증거 확인, PASS/FAIL 판정.
3. 총괄이 미완료면 **같은 ID** 재지시, 완료면 이전 task 종료·인수인계 기록.
4. 총괄이 현재 `ACTIVE_TASK.md`를 **새 ID 및 단 하나의 target_branch**로 교체. 기존 작업자 채팅 하나에서 다음 턴에 최신 지시 읽고 새 역할 수행.
5. **날짜가 바뀌어도 자동 승계 없음**. 오직 총괄 검수/명시된 새 활성 지시로 전환.

## 예정 Gate

- 10/27 PayPal Sandbox 결제 API 실제 성공 증거와 무료 모델 접근 확인.
- 11/02 AI 견적→인간 승인→Sandbox 결제→납품 상태 브라우저 E2E.
- 11/06 기능 동결. 11/09 제출 후보. 11/11 조기 접수. 공식 11/13 05:00 KST.
- 계정/지역 제한·실 API 불가·일정 초과라면 **0원 범위 내 대안 2개** 보고 후 필요한 승인·재계획. 3기능 축소를 자동 결정하지 않는다.

[운영 규칙](PROTOCOL.md) · [작업자 입구](../../WORKER_START_HERE.md)
