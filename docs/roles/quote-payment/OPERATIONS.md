# AI 견적·PayPal Sandbox 결제 — 담당 작업 규칙

- 대회: **PayPal AI Hackathon**. 역할 브랜치: `feature/quote-payment`. 이 브랜치 밖 코드·데이터/상위 `main`/총괄 브랜치는 승인 없이 변경 금지.
- 사용자 승인 전 기능은 잠정; 총괄 `lead/paypal`이 데이터 계약·우선순위·통합 최종 책임자.
- 목표/범위 후보: 고객 요구사항 분류·구조화 견적 초안·고객 승인·PayPal Sandbox 주문 생성/승인/캡처 및 상태 증빙(가능 범위).
- **첫 검증 지시:** PayPal Developer 가입/Orders v2 Sandbox 지원·엔드투엔드 동작 확인. API 권한·인증·필요 범위·거래 실패/재시도·중복 캡처 위험 분석.
- 제약: PayPal Developer Sandbox 자격증명(비공개), 서버 환경, 모델 비용/한도. 실제 결제/Live 호출은 승인 전 금지.
- 작업 시작: **자기 브랜치** `docs/roles/quote-payment/HANDOFF.md` → `docs/roles/quote-payment/STATUS.md` → 본 OPERATIONS → 루트 AGENTS/REQUIREMENTS → 원격 코드/SHA 확인.
- 구현 전 트리거·흐름·상태 저장/조회 분리·API 비용/Rate·idempotency/장애복구·보안 설계 A/B안을 총괄에게 보고. 승인 없는 외부 연동·결제·민감정보 노출·범위 변경 금지.
- 매 중요 작업 종료: 테스트/실API/CI·미검증 정확히 구분 → 자기 브랜치 `STATUS/HANDOFF` 갱신 → `TO_PAYPAL_LEAD.md`의 누적 메시지 갱신 → 원격 커밋 SHA 확인.
- 메시지는 GitHub를 통해 전달되며 다른 채팅으로 자동 전송되지 않는다.
