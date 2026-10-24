# PayPal AI Hackathon — 승인된 단독 실행계획 v3.0

> 결정일: **2026-10-24 KST** | 의사결정권자: 사용자 | 실행 관리: PayPal 총괄 `lead/paypal`
>
> **확정된 관리 기준:** ① 추가 현금 지출 **0원**, ② **B안: PayPal 결제 코어 실증 → 3명 병렬 개발/조기 통합**, ③ 3개 기능을 갖춘 **통합 작품 1개** 목표, ④ 다른 해커톤 일정/자원은 본 계획의 입력값으로 사용하지 않음. 플랫폼 가입·실 API 접근·서비스 실행·Devpost 최종 제출 성공은 **아직 미검증**. 유료 전환·라이브 결제·외부 민감정보 전송·요구범위 변경은 **별도 사전 승인**.

## 1. 제출과 공식 규정

- 주최: [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) / [Rules](https://paypalaihackathon.devpost.com/rules) / [Dates](https://paypalaihackathon.devpost.com/details/dates)
- **공식 마감: 2026-11-13 (금) 05:00 KST** (미국 11/12 목 12:00 PST). **우리 조기 제출: 11/11 (수) KST 중**, 서류·영상·무료 재현 수단을 실제 검증하고 Devpost 접수 근거 남기기.
- 2026-12-02 07:00 ~ 12-16 01:00 KST 심사 기간에도 무료로 테스트 가능한 실행 접근 유지. 결과 발표 12/22 KST 예정(공식 Dates/Rules 간 정확한 시간 상충).
- 필수: PayPal Sandbox의 핵심 통합 + 실질적 AI 기능; 심사위원이 실행할 수 있는 기능 앱(공개 URL **또는** 충분한 설치·실행 가이드); 공개 소스 및 저장소 최상위 오픈소스 LICENSE; 영어 설명; 실제 기능이 나오는 **3분 미만 공개 YouTube**. 허위 Mock을 Sandbox 성공으로 표시하지 않는다.
- 출품 전략: 프리랜서의 의뢰 → AI 견적 제안 → **사람의 명시적 승인** → PayPal Sandbox 주문/승인/캡처 → 납품 상태 확인 → 유지보수 구독/청구 예외 대응. 세 개의 별도 출품작이 아닌 **하나의 통합 제품**.

## 2. 프로젝트 범위·작업 구조 확정

| 역할/브랜치 | 사용자 승인된 목표 범위 | 마감 증빙 |
|---|---|---|
| **PayPal 총괄** `lead/paypal` | 데이터 계약·아키텍처, 실제 API 검증 지휘, 인터페이스 통합, PR 리뷰/회귀·보안, 영문 영상/Devpost 제출 | 각 Gate 결과·원격 SHA, STATUS/HANDOFF/상위 보고 |
| **담당 1** `feature/quote-payment` | AI 요구 분석·견적 초안 → 사람이 금액/조건 승인 → 실제 Sandbox Orders create/approve/capture·멱등 조회 | Sandbox API 응답/결제 상태 증거, 정상/오류/중복 테스트 |
| **담당 2** `feature/delivery` | 프로젝트 마일스톤·납품 검수·상태 추적; 결제와 납품 상태 별도 저장·연결 | DB 재조회/새로고침/거절·재검수 테스트 |
| **담당 3** `feature/subscriptions` | PayPal Subscriptions / Webhook 가용성 검증 → 정기 계약/실패·취소·중복 이벤트 대응 | 실 API 또는 모의 여부 구분 및 기능별 테스트 |

- **B안 시행:** 공통 상태/스키마 계약과 실제 결제 POC를 먼저 검증한 뒤 각 작업자가 승인된 범위를 병렬 개발한다. 통합은 마지막 날 한 번이 아니라 매일 가능한 부분부터 PR 단위로 점진 진행한다.
- 3개 기능은 **개발 목표로 확정**. 국가/API 지원·무료 한도 등 외부 제약으로 구현 불가하면 보고 후 사용자 승인으로 범위 변경한다. 세 기능이 완료되었다고 사전 주장하지 않는다.
- 작업자 채팅은 아직 개설/배정 확인 전. 각 작업자의 실제 착수는 독립 채팅에서 위 역할·브랜치·계약을 전달받은 후만 인정. 채팅/GitHub 문서만으로 자동 실행하지 않는다.
- 제품명/세부 UX·데이터 필드는 기술 검증 과정에서 설계하며 핵심 목표/0원 정책을 바꾸지 않는다.

## 3. 20일 실행표 — 모두 한국시간(KST)

| 날짜 | 총괄 검수·공통 기반 | 담당 1: 견적·결제 | 담당 2: 납품 | 담당 3: 구독 |
|---|---|---|---|---|
| **10/24 토** | 0원/B안/통합1작품 기준 확정, 일정 GitHub 공시, 3명 메시지 확인 | 역할 확인 준비 | 역할 확인 준비 | 역할 확인 준비 |
| **10/25 일** | 공통 상태 모델/계약 v1, 에러 코드·API 계약, 보안 및 테스트 전략 정의 | 견적→승인→Order 계약 검토 | Milestone 모델 설계 | Subscriptions/Webhook 제약 검토 |
| **10/26 월** | 무료 계정/모델/Sandbox 접근·국가별 지원 확인, Cloudflare D1·Workers 적용성 POC, 무료 한도 측정 | Sandbox OAuth/Orders v2 탐색 | 영속 DB/상태 API 설계 | Sandbox Subscriptions/API 이벤트 접근 검증 |
| **10/27 화** | **GATE 1: 실제 Sandbox create→approve→capture 및 주문 조회, 무료 AI 실제 1회 이상 호출 검증** | 결제 POC 최우선 | 독립 상태 모델 준비 | 이벤트 계약 준비 |
| **10/28 수** | 계약 v1 동결, 무료 서비스 범위 재확인, 작업자별 PR 기준 배포 | AI 견적·human approve 구현 | 마일스톤 CRUD | 구독 상태·웹훅 핸들러 |
| **10/29 목** | 최초 중간 PR 리뷰/상태 DB 통합 | 검증된 가격만 주문 생성 | 납품/검수 UI | API 권한 검증 기반 구독 흐름 |
| **10/30 금** | 인수·회귀 테스트 초기화 | 주문 캡처·조회/에러 분기 | 결제와 작업 상태 링크 | 취소·실패·이벤트 중복 방지 |
| **10/31 토** | 첫 브라우저 UI 결합·로그 증빙 | AI 견적→결제 연동 | 마일스톤 승인 시연 | 가능한 구독 플로우 개발 |
| **11/01 일** | 통합 스모크·새로고침 영속성·CI 검수 | 최종 결제 POC 정비 | 상태 분리 검증 | 웹훅·타임아웃 검증 |
| **11/02 월** | **GATE 2: AI 견적→사람 승인→Sandbox 결제→납품 상태까지 첫 실제 E2E 브라우저 데모** | 결제 로그·증빙 제출 | UI E2E 제공 | 구독 기능과 상태 보고 |
| **11/03 화** | 2차 PR 리뷰, UX·복구 통합 | 거절·재시도·중복 주문 | 보완·작업 상태 복구 | API 확인된 기능 연동 |
| **11/04 수** | 종단 테스트·무료 쿼터 관측 | 서버 승인 검증 | 데이터 정합성 점검 | 웹훅 서명·중복 수신 점검 |
| **11/05 목** | 사용 가능 범위/미지원 범위 분리, 기능 동결 후보 확인 | 결함 정리 | 결함 정리 | 실 API 미지원 시 원인·대안 보고 |
| **11/06 금** | **GATE 3: 기능 동결. 새 기능 금지, 보안/오류 수정만** | 릴리스 후보 검수 | 릴리스 후보 검수 | 릴리스 후보 검수 |
| **11/07 토** | Sandbox+웹 실제 테스트 2회·중복 결제·보안 및 회귀 검사 | 결제 안전성 입증 | 재접속 후 상태 복구 | 이벤트 안전성 입증 |
| **11/08 일** | LICENSE·영문 README·설치/테스트 절차·무료 호스팅/심사 접근 검증 | API 단계 문서화 | 이용 시나리오 정리 | 지원/미지원 표기 |
| **11/09 월** | **GATE 4: 제출 후보 확정·독립 재현 테스트·데모 영상 리허설** | 최종 결제 데모 | 최종 납품 데모 | 최종 구독 데모 |
| **11/10 화** | 2:55 이내 실제 앱 시연 영상·영어 자막/설명·YouTube 공개, Devpost 문안/URL 점검 | 데모 검증 | 데모 검증 | 데모 검증 |
| **11/11 수** | **Devpost 조기 제출·접수 화면/URL/영문/영상/오픈소스 확인**, 증빙 보관 | 긴급 장애 대응 | 긴급 장애 대응 | 긴급 장애 대응 |
| **11/12 목** | 제출 누락/무료 배포 접근 점검만, 긴급 수정 | 필요 시 오류 수정 | 필요 시 오류 수정 | 필요 시 오류 수정 |
| **11/13 금 05:00** | **공식 제출 마감** | — | — | — |

### 강제 판정 기준
- **Gate 1 실패**: 신규 주변 기능 통합 확대를 멈추고 Sandbox 원인/국가·계정·권한을 1회 진단 후 대안/지원 문의를 보고. 성공 여부 위장 금지.
- **Gate 2 실패**: 기능 늘리기보다 결제 E2E 복구. 남은 모듈은 합성/실제 범위를 분리하여 테스트.
- **Gate 3 일부 미달**: 미달과 대안/비용·일정 영향 명시. 범위 삭제·축소는 사용자 별도 승인.
- **Gate 4 미달**: 11/10은 새로운 기능이 아니라 심사원 실행·영상·서류 오류 수정에 집중.
- **조기 제출 실패**: 11/12를 버퍼로 사용하되 11/13 05:00의 공식 마감을 연장된 것으로 간주 금지.

## 4. 0원 목표 기술·비용 명세

세부 정책: [`docs/ZERO_COST_STACK_AND_GUARDRAILS.md`](ZERO_COST_STACK_AND_GUARDRAILS.md)

| 영역 | 우선 기술 | 추가 예산 | 사용자 승인 전 실제 상태 |
|---|---|---:|---|
| 프론트·서버 | React/Vite + Cloudflare Workers Free/Static Assets | ₩0 목표 | 호스팅·계정 미개설/미검증 |
| 데이터 | Cloudflare D1 Free | ₩0 목표 | DB 미개설/미검증 |
| AI 견적 | Gemini 무료 API **계정에 제공되는 최신 무료 모델**(후보 3.5 Flash-Lite), 필요 시 무료 Workers AI 대상 모델 | ₩0 목표 | 모델/계정/호출 한도 미검증 |
| PayPal | Developer Sandbox, Orders v2/Subscriptions | ₩0 | 사용자 계정/지역별 실제 호출 미검증 |
| Git·CI | GitHub Public + 공개 리포지토리 Actions 무료 실행 | ₩0 | 코드·CI 미실행 |
| 도메인·HTTPS | Cloudflare 기본 `workers.dev` 주소 | ₩0 | 공개 URL 미생성 |
| 영상·제출 | OBS/무료 편집 + YouTube + Devpost | ₩0 | 시연 영상·최종 제출 미완료 |

**추가 현금지출 = 0원 하드캡.** 카드 등록/유료플랜/API 자동 결제/도메인 구매/실결제(라이브) 금지. 무료 한도 초과 시 **fail-closed(추가 호출 중단/오류 메시지)**; 무단 유료 전환 불가. 무료 계정 생성 시 신용카드 요구 여부 확인. 사용자 기존 인터넷/컴퓨터/기존 유료 구독은 증분 지출에 포함하지 않는다.

**무료 플랜의 조건부 한도 (재확인 10/24):** Cloudflare Workers Free 100,000 req/day, CPU 10ms/request; D1 5M rows read/day·100K written/day·총 5GB; Workers AI 10,000 Neurons/day(모델에 따라 유료 결제수단 필요); Gemini 무료 접근·rate limit은 계정/모델별 변동. Google은 **Gemini 2.5 모델의 신규 프로젝트 접근을 제한**한다고 공식 안내하므로 2.5 계열에 고정하지 않고 3.x 무료 모델의 계정 실제 접근 검증이 우선. 무료 API에 실제 고객/개인/비공개 자료를 넣지 말고 **가상 계약·테스트 주문 데이터**만 사용.

## 5. 데이터 계약과 제품 안전성

- 스키마 초안: Quote {id, amount_minor, currency, quote_status, approved_at}; Payment {quote_id, paypal_order_id, capture_id, provider_state, idempotency_key}; Milestone {project_id, stage, delivery_status}; Subscription {project_id, paypal_subscription_id, billing_status}; WebhookEvent {event_id, type, verified, processed_at}.
- 결제/납품/구독 상태 각각 분리하고 PayPal의 실제 응답과 서버 저장 상태를 대조. **AI가 PayPal을 무단으로 결제/캡처하는 기능 금지**; human approval과 백엔드 금액검증 필수.
- 새로고침/조회 시 재결제 불가; 캡처 요청 멱등 키; Webhook 서명 검증 및 이벤트 dedupe; 토큰은 서버 secret/환경변수에만 저장.
- 공개 저장소에는 API 키·비밀번호·실계정·개인정보·고객 계약을 넣지 않음. 공개 데모에는 합성 데이터·사용량 제한·무료 접근 방어 적용.

## 6. 증거·인수인계

- **검증과 계획을 구별:** Gate PASSED는 API HTTP 응답/서버 상태/브라우저 캡처/테스트 로그·커밋 SHA로 검증할 때만. 그렇지 않으면 NOT TESTED/BLOCKED/FAILED.
- 총괄은 새 개발 지시 전 세 feature 브랜치의 최신 SHA + `TO_PAYPAL_LEAD.md`를 읽고 `docs/roles/lead/MESSAGE_REVIEW.md` 기록.
- 3개 작업자들은 각자 feature 브랜치에서 STATUS/HANDOFF/메시지함을 갱신. 총괄은 `lead/paypal`의 STATUS/HANDOFF 및 `docs/roles/lead/TO_HACKATHON_LEAD.md`를 주요 마일스톤마다 갱신. 코드 통합은 검증 PR로만.
- 승인 내용 기록은 **제품 개발 착수 완료/계정 개설 완료/영상 생성/Devpost 접수 확인**을 의미하지 않음.
- 무료 사용량 및 액세스 점검을 11/11 이후부터 심사 종료(12/16 KST)까지 수행할 **운영 점검 가이드**를 남김. 본 일정 문서가 자동 운영/알림을 생성하지는 않음.

## 7. 공식 가격·규정 근거 (2026-10-24 재확인)

- [PayPal AI Hackathon Rules](https://paypalaihackathon.devpost.com/rules)
- [PayPal AI Hackathon Dates](https://paypalaihackathon.devpost.com/details/dates)
- [PayPal Developer Sandbox FAQ](https://paypalaihackathon.devpost.com/details/faqs)
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API Models](https://ai.google.dev/gemini-api/docs/models)
