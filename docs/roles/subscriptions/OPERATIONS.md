# 구독 청구 실패·예외 대응 — 담당 작업 규칙

- 대회: **PayPal AI Hackathon**. 역할 브랜치: `feature/subscriptions`. 이 브랜치 밖 코드·데이터/상위 `main`/총괄 브랜치는 승인 없이 변경 금지.
- 사용자 승인 전 기능은 잠정; 총괄 `lead/paypal`이 데이터 계약·우선순위·통합 최종 책임자.
- 목표/범위 후보: PayPal Subscriptions API 및 Webhooks로 가능한 실패/취소/갱신 상태 감지와 사용자 해결 절차 지원(지원될 경우).
- **첫 검증 지시:** 대회 일정 내 API 접근 권한·국가 제한·Sandbox 시뮬레이션 가능성 확인, 실제 Webhook 서명 검증·중복 이벤트 안전 처리 설계.
- 제약: Subscriptions/Webhooks 권한·Sandbox 사용 가능 여부 미검증. 반복 결제 생성/취소 등 외부 효과는 사용자 승인 전 금지.
- 작업 시작: **자기 브랜치** `docs/roles/subscriptions/HANDOFF.md` → `docs/roles/subscriptions/STATUS.md` → 본 OPERATIONS → 루트 AGENTS/REQUIREMENTS → 원격 코드/SHA 확인.
- 구현 전 트리거·흐름·상태 저장/조회 분리·API 비용/Rate·idempotency/장애복구·보안 설계 A/B안을 총괄에게 보고. 승인 없는 외부 연동·결제·민감정보 노출·범위 변경 금지.
- 매 중요 작업 종료: 테스트/실API/CI·미검증 정확히 구분 → 자기 브랜치 `STATUS/HANDOFF` 갱신 → `TO_PAYPAL_LEAD.md`의 누적 메시지 갱신 → 원격 커밋 SHA 확인.
- 메시지는 GitHub를 통해 전달되며 다른 채팅으로 자동 전송되지 않는다.
