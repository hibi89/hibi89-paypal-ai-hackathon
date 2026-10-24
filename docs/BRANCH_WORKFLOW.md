# PayPal 5개 브랜치 협업 규약

```text
main — 검수 통과한 통합 코드만
└─ lead/paypal — 설계·검수·제출·상위 보고
├─ feature/quote-payment — 견적·결제
├─ feature/delivery — 납품·단계 관리
├─ feature/subscriptions — 구독 청구 이상 탐지
```

**선택 비교**: (A) 모든 AI가 하나의 브랜치에서 개발: 단순하지만 충돌·역할 혼선 가능. (B) KIC와 같은 5개 브랜치: 담당자의 독립 이력·검수 경계가 분명하나 문서 갱신 비용 증가. 기존 합의된 다중 AI 운영/이관 목적에 맞춰 (B)를 채택; **이 결정은 운영 구조에 한하며 제품 설계·범위 확정 아님**.

- **기능 브랜치마다 별도 채팅 3개를 만들지 않는다.** 총괄 `lead/paypal:docs/dispatch/ACTIVE_TASK.md`가 유일한 현재 지시이며, 순환 작업자 채팅 1개가 지시된 브랜치로 이동한다. 작업 전 [작업자 시작](../WORKER_START_HERE.md)과 [프로토콜](dispatch/PROTOCOL.md) 확인.
- 각 역할별 소유 문서: `docs/roles/<role>/OPERATIONS.md`, `STATUS.md`, `HANDOFF.md`, 기능 담당 메시지 `TO_PAYPAL_LEAD.md` 또는 총괄 메시지 `TO_HACKATHON_LEAD.md`.
- 기능 담당자는 자기 브랜치 개발·테스트→커밋→문서 최신화→메시지 보고.
- 총괄은 세 담당자 메시지함·HEAD 전수 확인 후 `MESSAGE_REVIEW.md`에서 수락/보류/승인을 기록.
- 검증된 결과만 PR→`main` 병합. 합성 테스트/CI 성공과 실제 서비스 검증을 구분.
- 타 역할 브랜치 무단 수정, force push, 무의미한 빈 커밋, 자동 공유 가정 금지.

## 최종 승인 — 2026-10-24: 담당자 채팅 하나 + GitHub 지시서 라우팅
- **채팅은 총괄 1개 + 순환 작업자 1개**. 기능 담당 3개의 GitHub 브랜치는 유지하되 3개 별도 작업자 채팅을 만들지 않는다. KIC/UGREEN은 별도 프로젝트다.
- **PayPal 작업자 진입점:** [`WORKER_START_HERE.md`](../WORKER_START_HERE.md). **현재 단 하나의 활성 지시:** [`docs/dispatch/ACTIVE_TASK.md`](dispatch/ACTIVE_TASK.md). [큐](dispatch/QUEUE.md)는 미래 일정일 뿐 작업 지시가 아님. 총괄만 lead 지시서 갱신.
- **작업자 채팅 동일 세션 재사용:** 매번 lead의 최신 ACTIVE_TASK 조회 → 지정된 feature 브랜치만 코드·테스트·TO_PAYPAL_LEAD·STATUS/HANDOFF 갱신 → 총괄 검수/인수 후 다음 task_ID+branch 발행. 날짜/큐 보고 자동 전환 금지.
- 최초 `PPL-001` READY, target `feature/quote-payment`: Sandbox 무료 가능성+설계 A/B/계약 v0 및 재현 가능한 증빙. **실행/검증 시작 전**.
- 구 채팅 3개/담당자별 별도 대화 방식과 충돌하면 **이 최신 GitHub 라우팅 규칙이 우선**. 추가 지출 0원·Live 금지·기능 3개 출품 1개·11/13 05:00 공식 제출 마감 유지.
