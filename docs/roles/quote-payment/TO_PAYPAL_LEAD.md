# AI 견적·PayPal Sandbox 결제 → PayPal 총괄 메시지함

> 역할 브랜치: `feature/quote-payment`. 최초 생성 2026-10-24 KST.

## [초기 안내] 책임·협업
- 담당 후보 범위: 고객 요구사항 분류·구조화 견적 초안·고객 승인·PayPal Sandbox 주문 생성/승인/캡처 및 상태 증빙(가능 범위).
- 첫 검증 예정: PayPal Developer 가입/Orders v2 Sandbox 지원·엔드투엔드 동작 확인. API 권한·인증·필요 범위·거래 실패/재시도·중복 캡처 위험 분석.

## PPL-001 — STARTED (2026-10-24 12:58 KST)
- 조회 지시: `lead/paypal:docs/dispatch/ACTIVE_TASK.md` / `PPL-001 READY` / `feature/quote-payment`.
- 총괄 시작 HEAD: `b8d12259307e7ca3f893680c4f8d2877f8020ee9`.
- 작업 브랜치 시작 원격 HEAD: `e5b70e0376628dc9e6237d69234f56648c849ca8`.
- 범위: 공식 Sandbox OAuth2·Orders v2, 한국 제약, 0원 A/B 설계, Quote/Payment/Approval/Idempotency/Error 계약, 비밀 없는 오프라인 검증.
- 시작 검증: repository/feature tree 확인. 제품 기능, 실 PayPal Sandbox 호출, 무료 AI API 호출 = `NOT_TESTED`; Sandbox 자격증명과 테스트 계정 접근 = `NOT_AVAILABLE_IN_THIS_SESSION`.
- 다른 브랜치와 Live 결제/유료 서비스는 사용하지 않음. 작업 결과와 실제 테스트 증거를 같은 문서에 추가 보고 예정.
- 총괄 검수 요청: NO (착수 기록).

## 추후 누적 기록 형식
날짜(KST) / 브랜치 HEAD SHA / 검증한 코드·테스트·API / 완료·미검증 / 총괄 결정 필요 / 장애와 시도 / 안전한 다음 행동.

**매 작업 종료와 새 승인/차단 발생 때 반드시 이 메시지함을 갱신한다.** 자동 알림 없음.
