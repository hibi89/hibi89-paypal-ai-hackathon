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
