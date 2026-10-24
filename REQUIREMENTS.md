# PayPal AI Hackathon — 확정 요구 (2026-10-24 최신)

- **제품:** AI 프리랜서 계약·견적·PayPal 결제 Agent 출품작 하나. ① AI 구조화 견적→사람 승인→Sandbox OAuth/Orders v2 create/approve/capture/GET ② 계약·마일스톤·납품/검수(결제와 상태 분리) ③ 구독/실패·취소/Webhook 서명·중복 이벤트.
- **실행자:** PayPal 총괄 채팅 1개가 설계·코딩·테스트·검수·통합까지 직접 진행. 작업 `lead/paypal`; `main` 릴리스, 과거 세 feature 브랜치는 증빙 보존. 기능 축소 아님.
- **0원 신규 현금 하드캡:** Cloudflare Workers/D1 Free, 실제 사용 가능한 무료 AI, PayPal Sandbox 후보. API/국가/무료 계정·Rate 확인 전 실제 동작·무료 제공 보장 주장 금지. Live·카드·유료 서비스/실 고객 정보 금지.
- **금전 안전:** 인증된 인간 승인 및 quote version/금액/통화/merchant 재검증. 멱등 키+DB unique/원자 전이, UNKNOWN 시 추가 캡처 차단·PayPal GET, 웹훅 서명·event ID, GET/F5/redirect에서 결제 생성·캡처 금지.
- **제출:** 내부 2026-11-11, 공식 **11/13 05:00 KST**. 실제 PayPal+AI 기능, 공개 오픈소스 소스와 루트 LICENSE, 영문 Devpost/실행 안내, 3분 미만 공개 YouTube, 안전한 심사위원 접속 또는 재현 경로. [공식 규정](https://paypalaihackathon.devpost.com/rules).
- **검증 구분:** PPL-001 합성 Node 계약 11/11 PASS는 실 PayPal 결제 성공이 아님. Sandbox credentials/Business·Personal buyer, 무료 AI, D1·브라우저·Production/제출 영수증은 미검증.
- [현재 작업](docs/roles/lead/LEAD_ACTIVE_WORK.md) · [예산 수칙](docs/ZERO_COST_STACK_AND_GUARDRAILS.md)
