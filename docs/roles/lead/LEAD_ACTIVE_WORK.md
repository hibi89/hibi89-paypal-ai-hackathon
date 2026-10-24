# PayPal 총괄 단일 작업 — 2026-10-24 KST

**사용자 `ㄱ` = 여기의 다음 실제 작업을 총괄이 직접 코딩·테스트·검수한다. 다른 worker chat/feature 전환 없음.** 개발 브랜치 `lead/paypal`.

## PPL-001 인수·독립 검수 — OFFLINE_ACCEPTED, LIVE_GATE_BLOCKED
- 원본 `feature/quote-payment@876d7d1b5935b91e6baddea36abdb8e50602c4fb`의 기술문서·계약 가드·합성 테스트를 원본 blob 그대로 `lead/paypal`에 이관.
- **직접** Node v22.16.0 `node --test tests/payment_contract.test.mjs` 실행 결과 `11 PASS / 0 FAIL / 0 SKIP`; `git hash-object`로 source `4cd04345a15791f1773217d57755aac405bfa13a` 및 tests `75802e7b22091fd3b28bd7dc32a20ff184ccc24b` 원본과 일치 확인.
- 이는 **합성 pure guard만 통과**. PayPal Sandbox 실제 OAuth→Orders create/approve/capture/GET·구매자 브라우저·무료 AI/Cloudflare 계정은 `NOT_TESTED/BLOCKED_BY_ACCESS`, Gate1 미통과. CI는 해당 신규 커밋 GitHub Actions 결과 확인 시에만 PASS 판정.

## NEXT: PPL-002 — 결제 MVP 직접 구현
1. 승인된 견적/version/amount/currency/owner → PayPal Sandbox 주문 생성·approve/GET·capture 및 마지막 GET을 분리한 서버 API·상태 저장 골격 구현(실 키 없는 mock transport부터).
2. 조회 GET/F5에서 절대 부작용 없도록, 명시적 POST + 서버측 검증. 중복 클릭·동시성·UNKNOWN 응답·금액/캡처 ID 불일치·Live 호스트 차단·멱등/영속 저장 불변조건을 테스트. DB UNIQUE/원자 캡처 점유 실제 구현 전 안전 완료 주장 금지.
3. `npm test`/CI 및 실제 URL/브라우저/외부 API 여부를 별도 검증해 이 문서·STATUS/HANDOFF/상위 보고 갱신.
4. 계정·사용자 승인된 안전한 환경이 있을 때만 실제 PayPal Sandbox와 무료 AI 호출 수행. 비밀·실 고객 자료는 Public GitHub나 채팅 금지.

## 이후 단독 실행
PPL-003 계약/납품·마일스톤 → PPL-004 구독/웹훅 → PPL-005 통합·배포·보안·심사 → PPL-006 공개 LICENSE·영문 영상/Devpost 제출. 내부 11/11, 공식 11/13 05:00 KST. 범위 축소/유료/Live는 별도 승인.
