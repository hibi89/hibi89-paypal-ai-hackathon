# PayPal AI Hackathon — 확정 요구 (2026-10-24 최신)

- **제품:** AI 프리랜서 계약·견적·PayPal 결제 Agent 출품작 하나. ① AI 구조화 견적→사람 승인→Sandbox OAuth/Orders v2 create/approve/capture/GET ② 계약·마일스톤·납품/검수(결제와 상태 분리) ③ 구독/실패·취소/Webhook 서명·중복 이벤트.
- **실행자:** PayPal 총괄 채팅 1개가 설계·코딩·테스트·검수·통합까지 직접 진행. 작업 `lead/paypal`; `main` 릴리스, 과거 세 feature 브랜치는 증빙 보존. 기능 축소 아님.
- **0원 신규 현금 하드캡:** Cloudflare Workers/D1 Free, 실제 사용 가능한 무료 AI, PayPal Sandbox 후보. API/국가/무료 계정·Rate 확인 전 실제 동작·무료 제공 보장 주장 금지. Live·카드·유료 서비스/실 고객 정보 금지.
- **금전 안전:** 인증된 인간 승인 및 quote version/금액/통화/merchant 재검증. 멱등 키+DB unique/원자 전이, UNKNOWN 시 추가 캡처 차단·PayPal GET, 웹훅 서명·event ID, GET/F5/redirect에서 결제 생성·캡처 금지.
- **제출:** 내부 2026-11-11, 공식 **11/13 05:00 KST**. 실제 PayPal+AI 기능, 공개 오픈소스 소스와 루트 LICENSE, 영문 Devpost/실행 안내, 3분 미만 공개 YouTube, 안전한 심사위원 접속 또는 재현 경로. [공식 규정](https://paypalaihackathon.devpost.com/rules).
- **검증 구분:** PPL-001 합성 Node 계약 11/11 PASS는 실 PayPal 결제 성공이 아님. Sandbox credentials/Business·Personal buyer, 무료 AI, D1·브라우저·Production/제출 영수증은 미검증.
- [현재 작업](docs/roles/lead/LEAD_ACTIVE_WORK.md) · [예산 수칙](docs/ZERO_COST_STACK_AND_GUARDRAILS.md)


## 2026-10-29 사용자 확정 최종 범위 — 기존 10-24 요구보다 우선

정본: `docs/strategy/HAECHONG_DUAL_VERTICAL_SCOPE_20261029.md`.

- **단일 글로벌 서비스 마켓플레이스, 두 카테고리:** AI Work(개발·자동화·챗봇·분석) + Global Services(디자인·번역·글쓰기·마케팅). 두 카테고리는 동일한 의뢰·매칭·견적·사람 승인·계약·PayPal·거래 기록 백엔드를 공유한다.
- **실제 AI/PayPal 증빙 분리:** Gemini 실제 기술 추출은 별도 승인된 과거 로컬 기록과 합성 브라우저 테스트를 구별한다. PayPal Sandbox CREATE→구매자 승인→Capture→GET의 과거 사용자 관찰 증거는 재결제 없이 출처를 표시한다. 합성 CI는 실 API 검증으로 표시하지 않는다.
- **거래 안전 유지:** 금액·통화·판매자·견적 버전에 묶인 명시적 사람 승인, 멱등성, 영속 원장, GET/새로고침 무결제, UNKNOWN 결과 재POST 차단을 유지한다.
- **사업 모델은 제안:** PayPal 소유/운영 중개 플랫폼 및 이중 수수료는 사업 가설이며, PayPal의 제휴·승인·실제 매출을 뜻하지 않는다. 가상 판매자·요금·매칭은 명확히 표시한다.
- **최종 출품 제외:** SOVIA, DBVORA, CODE COUNCIL/ai-code-checker, HAE, LA, RAG_STUDIO, AutoML 및 별도 BI 대시보드는 실행 의존성이나 심사 기능이 아니다. 기존 내부 SQLite/감사·안전 기능은 유지한다.
- **릴리스 게이트:** 양 카테고리 브라우저 E2E, 영문 재현 안내, 공개 루트 라이선스, 소유자 검수한 3분 미만 영상, 공개 YouTube 링크, Devpost 접수. `main` 병합·영상 공개·외부 API/결제 POST·제출은 각각 소유자 승인 전 실행 금지.

이 절은 기존 2026-10-24의 'AI 프리랜서 한 카테고리' 설명만 갱신하며, 보안·비용·외부 승인 제한을 완화하지 않는다.
