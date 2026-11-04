# PPL-001 — Sandbox 실현성·아키텍처·계약 v0

검증일: 2026-10-24 KST / 총괄 기준 `lead/paypal@b8d12259307e7ca3f893680c4f8d2877f8020ee9` / 대상 `feature/quote-payment` / 사용자 지시 `PPL-001 READY`.
본 문서는 **공식 문서에 근거한 설계 + 로컬 오프라인 안전 검증**이다. **PayPal 계정 인증·실 Sandbox API·브라우저 구매 승인은 실행되지 않았다.** 실제 계정 성공을 추론하지 않는다.

## 1. 판정 및 검증 매트릭스

| 항목 | 상태 | 증거/장애 |
| --- | --- | --- |
| PayPal OAuth2·Orders v2 경로 | DOC_VERIFIED | 공식 인증·주문·조회·캡처 레퍼런스 |
| 한국 등록 계정 사용 가능 여부 | PARTIAL / ACCOUNT_NOT_TESTED | PayPal 한국↔한국 결제 공식 불가; 국외 상대 가능하나 Sandbox 앱/권한 미접근 |
| Sandbox Business + Personal 2계정 | NOT_TESTED | 이 실행 환경에 인증된 PayPal Developer 계정·Client ID/Secret이 없음 |
| Sandbox OAuth HTTP/Order create/approve/capture/GET | NOT_TESTED / BLOCKED_BY_ACCESS | **호출 0건**, HTTP 코드·Order ID·Capture ID·승인 리다이렉트 실측 0건 |
| 무료 Gemini/Workers AI | NOT_TESTED / BLOCKED_BY_ACCESS | 활성 무료 API 키·모델/한도·무료 청구 설정 미검증. 실제 외부 데이터 송신 0건 |
| 오프라인 Quote/Payment 불변조건 | PASS 11 / FAIL 0 | `node --test tests/payment_contract.test.mjs`, Node v22.16.0, 외부 패키지·네트워크 0 |
| Cloudflare Workers/D1 무료 배포 | DOC_VERIFIED / ACCOUNT_NOT_TESTED | 공식 한도 확인, 계정·D1·라우트·배포는 미생성 |
| 증분 현금 비용 | 0원 사용(로컬 문서/테스트) | 새 유료 서비스 구매·Sandbox 거래·AI 호출 0건 |

**현재 Gate 1 판정: NOT_PASSED — 실제 Sandbox/무료 AI API E2E 미실증.** PPL-001의 기술설계 검토는 가능하며, 출시·실제 결제·Sandbox 완료는 아니다.

## 2. 대한민국·테스트 계정·사전 준비

| 구분 | 필요 조건/범위 | 확실성 |
| --- | --- | --- |
| 개발자 로그인 | Developer Dashboard에 합법적으로 등록한 본인 계정·이메일 검증 | 공식 절차, **현재 접근 미검증** |
| 국가/판매자 | 미국 이외 통합 테스트에는 PayPal Business 계정 필요(공식 Get Started). 한국 등록 계정 간 국내 상호 결제 불가; 국외 고객 거래는 원칙상 가능 | **공식 정책**, 각 Sandbox 시나리오 실제 성공은 미확인 |
| Sandbox Merchant | 테스트 Business 계정, REST App(Sandbox)과 그 앱의 Client ID·Secret | 문서상 가능; 실제 발급 미확인 |
| Sandbox Buyer | Merchant와 구분된 Personal 테스트 계정, 테스트 로그인 자격 | 문서상 가능; 실제 발급 미확인 |
| 국가 조합 | 한국 소재 사업자↔해외 고객이 원래 제품 시나리오. Sandbox buyer country가 실제 지원되는 국가로 생성 가능한지 검증 | **미검증**. 국내 거래를 해외 거래로 허위 표시해 우회하지 않음 |
| 서버 비밀 | Client Secret·OAuth Access Token은 서버/비공개 로컬 환경에만 저장, 로그·GitHub·브라우저 노출 금지 | 설계 |
| Return/Cancel URL | 앱의 사용자 승인 후 복귀·취소 UI 경로, order ID 바인딩, CSRF state. 개발 시 실제 허용 URL 정책 확인 | 설계·Sandbox 검증 전 |
| Webhook | HTTPS 공개 수신 URL, App Webhook ID, 이벤트 서명 확인; 초기 OAuth/Orders 수동 POC에서는 필수 아님 | 문서·계정 생성 전 미검증 |

참조: https://developer.paypal.com/api/get-started/ · https://developer.paypal.com/sandbox-testing/accounts · https://developer.paypal.com/sandbox-testing/overview/ · https://www.paypal.com/kr/digital-wallet/system-enhancement-faq?locale.x=en_KR

## 3. 공식 PayPal Orders v2 최소 호출 계약 (Sandbox **전용**)

Base URL 정확히 `https://api-m.sandbox.paypal.com`을 allowlist로 제한. 코드와 배포 설정에서 Live host `api-m.paypal.com`을 거절한다. 결제 수단 제공자/지역에 따라 승인 link rel은 `approve` 또는 `payer-action`일 수 있으므로 응답의 실제 HATEOAS 링크를 검사한다.

| 순서 | 주체/메서드/경로 | 기대 응답·검증 |
| --- | --- | --- |
| 0 | Developer Dashboard: Sandbox app 생성, Business+Personal 계정 확보 | 앱 Client ID/Secret·buyer login **비공개**, OAuth scope/권한 확인 |
| 1 | 서버 `POST /v1/oauth2/token`, HTTP Basic(Client ID:Secret), `grant_type=client_credentials` | 일반적 `200`; `access_token`과 `expires_in`을 **서버에만** 보관. 실패 HTTP/이유만 기록 |
| 2 | 서버 `POST /v2/checkout/orders`, Bearer token, `PayPal-Request-Id`, `intent=CAPTURE`, 승인된 USD amount | 일반적 `201`, `id`, `status=CREATED`, `links`. amount는 불변 승인 스냅샷과 비교 |
| 3 | Buyer browser: Sandbox personal로 `approve`/`payer-action` 링크에서 승인 | return URL 복귀는 **결제 성공의 증거가 아님**. cancel 시 자동 capture 금지 |
| 4 | 서버 `GET /v2/checkout/orders/{id}` | 일반적 `200`, 서버가 order ID·seller·총액·통화·`APPROVED` 확인 |
| 5 | 서버 `POST /v2/checkout/orders/{id}/capture`, 기존 캡처 시도와 GET 먼저 대조, 캡처용 별도 안정 `PayPal-Request-Id` | 성공 시 일반적 2xx, `purchase_units[].payments.captures[].id/status/amount` 확인 |
| 6 | 서버 `GET /v2/checkout/orders/{id}` (선택적으로 `GET /v2/payments/captures/{capture_id}`) | **order COMPLETED + capture COMPLETED + ID/통화/금액 일치**를 검증한 뒤에만 내부 PAID. PENDING/UNKNOWN은 보류 |
| 7 | Webhooks 활성화 시 실제 이벤트 수신 + PayPal 서명 검증 | 상태 변경 전에 App Webhook ID·raw payload·timestamp/replay·event ID 중복 검증, 불일치 격리 |

주문 생성 입력 최소 예: `{"intent":"CAPTURE","purchase_units":[{"reference_id":"quote-demo-1","amount":{"currency_code":"USD","value":"15.00"}}]}`. 승인 URL은 서버가 허용된 Sandbox 링크만 UI에 전달한다. Production 보안 설계 시 state/CSRF, 인증, rate-limit, 계정별 소유권 검증도 필수다.

`PayPal-Request-Id`는 동작별 **안정된** 키, 생성과 캡처는 **서로 다른 키**. Orders v2 개별 API 레퍼런스에 흔히 6시간 저장(계정 계약에 따라 최대 72시간 연장)으로 안내되므로, 일반 PayPal API 문서의 더 긴 기간을 여기에 보장되지 않은 것으로 간주. **DB 영구 unique + 사후 GET 조회가 진짜 중복 방어의 최종 장치**다. 동일 시점 병렬 실행은 서버의 조건부 원자적 전이로 1회만 허용한다.

공식: https://developer.paypal.com/api/rest/authentication · https://developer.paypal.com/api/rest/integration/orders-api · https://developer.paypal.com/sdk/orders/v2/orders-create/ · https://developer.paypal.com/sdk/orders/v2/orders-get/ · https://developer.paypal.com/serversdk/php/api-endpoints/orders/capture-order · https://developer.paypal.com/api/rest/requests/ · https://developer.paypal.com/api/rest/webhooks/rest/

## 4. 설계안 A/B 비교 (미배포, 선택 전)

| 기준 | A: React/Vite + Workers Free + D1 Free + 무료 AI API + Sandbox | B: 로컬 Node 서버 + SQLite + 정적 React + Sandbox |
| --- | --- | --- |
| 증분 비용 | **조건부 ₩0**: 무료 계정, 무료 hostname, 과금 전환 차단, 무료 AI 모델 접근 필요 | **₩0 로컬 개발 기준**, 사용자의 기존 PC/인터넷 사용. 심사위원 외부 접속·상시 운영은 별도 제약 |
| 네트워크/CPU | Workers Free 일 100,000 requests, 10ms CPU/request, 50 external subrequests/request, 호출 대기는 CPU 산정 제외. 폭주·오류 1027/1102 방어 | PC CPU/로컬 포트 제약; 인터넷 연결·기기 켜짐 필수, 안전한 HTTPS 공개 제공 별도 |
| 저장 | D1 Free 5M rows read/일, 100k written/일, 계정 전체 5GB; 무료 한도 초과 시 읽기/쓰기 거절 | SQLite WAL·unique·트랜잭션; 로컬 파일 백업 쉽지만 외부 동시 접속/PC 다운타임 문제 |
| 비밀/보안 | Worker secret binding, D1 접근 바인딩, 서버 검증, CDN과 분리. 계정 설정/권한 직접 검증 필요 | 루프백 서버의 비공개 환경변수, DB chmod, 인증/HTTPS 배포는 추후 필요 |
| 심사 재현성 | **우세**: URL에서 데모 및 Sandbox 기반 증빙, 무료 정책 변동/계정 장애 리스크 | **우세**: 네트워크 없는 pure test 재현, 공개 서비스 데모 불리 |
| 운영/유지보수 | Workers + D1 migration, 수동/CI deploy 관리; Worker CPU에 AI 동기 처리 금지 | Node+SQLite 간단, 로컬 프로세스·동시접속·백업·공개 URL 운영 부담 |
| AI/Rate | 실제 Gemini 또는 Workers AI 무료 등록/모델/호출 제한 **미확정**, 고객 데이터 금지, 1세션/일 호출 상한 | 동일 외부 AI 의존. 완전 오프라인 AI 품질·비용 상 별도 검증 필요 |
| 복구 | D1 고유키·이벤트 inbox·주문 상태 GET 대조; fail-closed | SQLite WAL·unique·복구 로그+PayPal GET 대조 |
| 결제 정확성 | 두 안 모두 **PayPal order/capture 서버 조회만** 결제 진실, 요청 멱등·사람 승인·금액/소유자 검증 필요 | 동일 |

**권고: 조건부 A**(심사 접근성 우선). 무료 Cloudflare 계정·D1 생성·무료 AI 계정·한국 PayPal Sandbox 구매 조합 **실제 확인 후** 아키텍처 확정/구현 승인. **무료 또는 Sandbox 인증이 막힐 때 B**를 외부 의존 최소 재현용으로 유지하되, 공개 접속/심사 접근 문제를 총괄에 별도 승인 요청. 코드/DB/플랫폼 계정은 아직 배포·생성하지 않았다.

공식 한도: https://developers.cloudflare.com/workers/platform/limits/ · https://developers.cloudflare.com/d1/platform/pricing/ · https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/ · https://ai.google.dev/gemini-api/docs/pricing

## 5. 공통 데이터 계약 v0 (다른 기능 브랜치 수정 전 총괄 합의 필요)

- `Quote`: `{quote_id,version,owner_id,ai_suggested_minor,currency,proposed_scope,status,created_at}`. `DRAFT/PROPOSED/HUMAN_APPROVED/SUPERSEDED`. AI 제시값은 결제 권한 없음. quote 변경 → version 증가 → 기존 승인 무효.
- `Approval`: `{approval_id,quote_id,quote_version,actor_id,decision,approved_amount_minor,currency,approved_at,scope_hash}`. 서버 인증된 actor가 명시 동의해야 함. 확인 가능한 승인 스냅샷과 PayPal amount 일치.
- `Payment`: `{payment_id,quote_id,quote_version,approval_id,merchant_id,provider:"PAYPAL_SANDBOX",order_id,capture_id,amount_minor,currency,state,observed_at,last_remote_status}`. `NOT_CREATED/CREATING/AWAITING_BUYER/APPROVED/CAPTURE_IN_FLIGHT/PENDING/PAID/FAILED/CANCELLED/UNKNOWN`. **PAID 여부는 backend가 PayPal 재조회로만 전이**.
- `Idempotency`: `{merchant_id,quote_id,quote_version,operation,request_id,attempt_state,remote_id,first_sent_at,last_checked_at,response_digest}`. `UNIQUE(merchant_id,quote_id,quote_version,operation)`, `UNIQUE(order_id)`, `UNIQUE(capture_id)` (nullable 허용); operation create/capture은 분리, 요청 ID를 DB에 먼저 기록. `UNKNOWN`이면 PayPal GET/기존 상태 확인 전 새 캡처 금지.
- `Error`: `{code,stage,provider_http_status,provider_debug_id,retryable,reconciled_at,public_message,created_at}`. 토큰/비밀/원본 개인정보 원문은 저장하지 않음. 401/403 인증·권한 오류는 키 재검증, 422 금액/계정·승인 오류는 blind retry 금지, 429 한도는 중단/유예, 5xx·timeout은 **remote GET 대조 후** 제한 재시도. `FREE_TIER_LIMIT`은 결제·AI 새 요청 차단.
- `Event`(후속 역할용 초안): `{provider_event_id,event_type,verified,related_payment_id,received_at,processed_at}`, 이벤트 ID UNIQUE. 웹훅 유효성 확인 전 상태 변경 금지.

### 상태 불변조건·사용자 동작

1. AI 제안 가격≠결제 금액. **사람 승인된 quote version/amount/currency**에서만 주문 생성.
2. 브라우저 조회/F5/새로고침/return URL 방문은 **GET만** 실행. POST는 로그인 세션+명시적 사용자 행위+CSRF 보호+서버 소유권·중복 키 검사 시에만 실행.
3. 더블클릭/네트워크 재시도: 동일 quote version/operation은 동일 request id·DB row. 중복 주문/캡처 요청은 새 동작 대신 기존 remote 조회.
4. 구매 승인 취소: `CANCELLED`로 표시하고 캡처하지 않음. 승인 상태 없이 취소/복귀 URL의 query parameter로 결제 성공 간주 금지.
5. 캡처 응답 단절: `UNKNOWN`. PayPal GET으로 order/capture 조회하여 확인, 미확정이면 **추가 POST 중지** 및 운영자 확인. 영구 중복 방지는 원자적 DB unique/conditional update가 구현되기 전까지 **미완성**.
6. 결제 수단/시스템 `PENDING`, 결제 캡처 부분 실패는 `PAID`가 아님. 납품/구독은 결제 공급자와 독립 상태 관리.
7. 공개 데모는 합성 사용자 데이터와 sandbox 거래만. 무료 AI 호출 조건 실패하면 mock을 실호출 성공으로 표시하지 않고 안전 중단.

## 6. 실제 실행 증빙·무료 재현

현재 실행 완료 명령 (`feature/quote-payment` 동일 코드):
`node --test tests/payment_contract.test.mjs`
결과: `11 tests, 11 pass, 0 fail, 0 skipped` / Node.js `v22.16.0`. 테스트는 Node 표준 라이브러리·합성 fixture만 사용, 실제 API 요청·DB·Webhook·Cloudflare 배포는 없음. `src/payment_contract.mjs`는 **오프라인 pure guard/계약 예제**이지 실제 결제 클라이언트/동시성 DB 구현이 아니다.

### 10/27 Gate 1에 필요한 가장 작은 실증 절차 (계정 접근 허가 후)

1. 본인의 로컬 비공개 장비/호스팅 secret store에 `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` 설정. **채팅·GitHub·공개 CI·화면 녹화에 값 복사 금지**. 테스트용 merchant/business 및 buyer/personal 별도 생성 확인, 지역 제약 충돌 시 바로 중단.
2. 사전 확인: `node --test tests/payment_contract.test.mjs`. 별도 안전 환경에서 `curl --silent --show-error --fail-with-body -X POST 'https://api-m.sandbox.paypal.com/v1/oauth2/token' --user "$PAYPAL_CLIENT_ID:$PAYPAL_CLIENT_SECRET" -H 'Content-Type: application/x-www-form-urlencoded' -d 'grant_type=client_credentials'` 호출. **이 예시는 인증 명령 구조 설명**이며 터미널/프로세스 목록에 인증 인자가 노출될 수 있으므로 공유 머신 금지; 실제 자동화는 서버 secret binding/비공개 단독 실행에서 구현. 전체 토큰 본문 로그/스크린샷 저장 금지.
3. 성공하면 access token을 서버 프로세스 메모리에만 둔다. 승인된 합성 견적 `USD 15.00`·별도 `PayPal-Request-Id`로 위 순서에 따라 주문 생성. 반환된 **실제** `rel=approve`/`payer-action`만 브라우저 Sandbox buyer에게 연결.
4. 사람(테스트 사용자)이 Sandbox buyer로 승인 후 server-side GET으로 `APPROVED`, quote 금액/판매자 ID 일치 확인. **명시적인 테스트 캡처 승인 후에만** CAPTURE 1회, GET 재조회.
5. 증거에는 비밀 없이 `UTC/KST 시각, 단계, HTTP status, 응답 name/issue/debug_id(가능 시), order/capture ID는 필요한 경우만 일부 마스킹, 승인/취소 경로의 안전한 요약, GET의 order/capture status, 테스트 계정 국가 조합` 기록. HTTP 실패도 정확히 기록; 결제/구독 성공 표현 금지.
6. Negative testing(선택): Sandbox `PayPal-Mock-Response`로 `INSTRUMENT_DECLINED`·`DUPLICATE_INVOICE_ID` 등을 각각 한 번 검증. 실패를 잦은 재시도로 덮지 않음. 무료 AI API도 먼저 무료 과금 여부/계정 활성/제한을 확인하고 합성 텍스트 1회만 요청.

참조: https://developer.paypal.com/api/handle-api-responses/ · https://developer.paypal.com/negative-testing/request-headers/ · https://developer.paypal.com/api/rest/requests/

## 7. 결론·차단·총괄 결정 필요사항

- **지금 가능한 것**: 공식 문서 조사, 아키텍처 2안, 데이터/실패 계약 v0, 합성 offline 11/11 PASS, 기술 문서+코드 브랜치 커밋.
- **지금 불가능/미검증**: 사용자 본인의 PayPal Developer Sandbox 앱 발급/연결(자격증명 없음), 구매자 브라우저 승인/캡처, Cloudflare 계정 배포, Gemini/Workers AI 무료 계정 실제 호출, Production.
- **대안**: A의 계정 접근 허가 후 실증(공개 심사 유리, 무료 한도 변동 리스크), B 로컬 합성 결제 계약 재현(즉시 재현 가능, 실제 PayPal E2E 대체 불가). 두 경우 모두 **실 Sandbox Gate 1은 계정 접근 필요**.
- 총괄에 요청: `A 조건부 우선` 설계 승인 및 한국 판매자↔해외 Sandbox buyer 실증 준비 절차 승인. 무료 AI 모델은 실제 계정에서 가용성 확인 전 **보류**. 계정/지역 차단 시 공식 개발자 지원 문의와 안전한 로컬 데모 대안 판단.
- 이 단계는 **PPL-001 — READY_FOR_REVIEW (실 API BLOCKED_BY_ACCESS)**. 총괄 검수·새 활성 작업 지시 이전에 `PPL-002`나 타 feature 이동 없음.
