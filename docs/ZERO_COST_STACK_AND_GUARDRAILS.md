# PayPal — 추가 현금 지출 0원 운영·아키텍처 계약

> 사용자 승인 **2026-10-24 KST**. 예산 목표 **신규 지출 0원**은 확정. API·무료 계정 발급/국가 제한/심사 기간 접속 안정성은 검증 전이다. [실행 일정](PAYPAL_EXECUTION_PLAN_20261024.md)과 함께 읽는다.

## 1. 비용 하드캡

- **추가 현금 지출 목표/허용 상한: ₩0.** 추가 결제 승인 전까지 유료 구독, 사용량 초과 과금, 카드 등록/선불 크레딧 충전, 새 도메인 구매, 유료 API, PayPal **Live** 결제 금지.
- 사용자가 이미 갖고 있는 노트북/인터넷/ChatGPT 구독은 증분 비용 산정에서 제외. ChatGPT 앱 구독이 자동으로 별도 모델 API 사용료를 면제하지 않음.
- 무료 한도 도달/요청 거절 시 **Fail Closed**: 더 호출하지 않고 UI에 `FREE_TIER_LIMIT` 및 재시도 가능 시점/테스트 제한 안내. 자동 유료 전환·무제한 재시도·카드 등록 금지.
- 10/26 계정/무료 사용량 실증, 10/27 실제 API 샌드박스 1회 이상, 11/07~09 부하·사용량·복구 점검. 계정 접근이 불가하면 2개 무료 대안을 비교해 총괄에 보고하고, 비용/범위 변경은 별도 사용자 승인.

## 2. 기본 기술 선택

| 구성 | 1순위 | 0원 성립 조건 | 주의 |
|---|---|---|---|
| UI | React + Vite, Cloudflare Workers Static Assets | Cloudflare Free 계정과 무료 기본 URL 가능 | 무료 정적 배포/요청 제한 확인 |
| 백엔드 | Cloudflare Workers Free | Worker 요청 일 한도 이내 | **CPU 10ms/request**. AI 생성 연산은 Worker에서 직접 처리하지 않고 외부 AI API 호출을 비동기로 대기·검증. 타임아웃/제한 점검 |
| DB | Cloudflare D1 Free | 일 읽기/쓰기 및 총 저장 한도 이내 | 영속 저장·API 간 중복 처리·일별 백업 계획 |
| AI | Gemini API 계정에서 **현재 활성화된 무료 3.x 모델** (우선 후보 `gemini-3.5-flash-lite`) | 무료 입력/출력, 계정별 활성화·rate-limit 확인 | 2.5 계열은 신규 계정 접근 제한 안내. 무료 티어 데이터는 제품 개선에 사용될 수 있으므로 합성 데이터만 입력 |
| AI 예비 | Workers AI **결제수단이 필요 없는 무료 모델** | 10,000 Neurons/day 안에 수행 | 일부 모델은 결제수단 필요, 이를 사용하지 않음 |
| 결제 | PayPal Developer **Sandbox**, Orders v2 | 개발자 계정/국가·권한 접근 가능 | 주문 승인/캡처 실제 Sandbox HTTP 증빙만 성공 처리 |
| 구독 | PayPal Subscriptions + Webhooks Sandbox | Sandbox에서 사용자 계정/앱 권한, 서명 검증 가능 | 실패/취소 이벤트 실현성 검증 전; 합성 이벤트는 명시 |
| Git/CI | Public GitHub + GitHub Actions 공개 저장소 무료 런 | 무료 공개 저장소·액션 사용 | 보안 비밀값 GitHub 공개 커밋 금지 |
| 영상/제출 | OBS·무료 편집 + YouTube·Devpost | 공개 업로드 가능 | 영문 자막/작동 화면 3분 미만 |

## 3. 무료 한도 참고(서비스 공식 문서·2026-10-24 조회)

- Cloudflare Workers Free: **100,000 요청/일**, **10ms CPU/요청**; 외부 요청은 별도 subrequest 제한과 지연/타임아웃이 있다.
- D1 Free: **5,000,000 rows read/일, 100,000 rows written/일, 저장 5GB(전체)**. 실제 각 DB/쿼리 구조에도 한도가 있으므로 계정 개설 시 최신 문서를 확인한다.
- Workers AI: **10,000 Neurons/일** 무료. 유료/카드 필요 모델 제외.
- Gemini API: 무료 모델마다 지역·계정·요청 횟수 제한 변동. **2.5 접근을 기본 가정하지 말고 최신 무료 모델 실제 호출**로 최종 결정.
- PayPal Sandbox: 실제 자금 이동 없는 개발용 거래; 상용 거래·실결제는 이번 해커톤 실행 범위 밖이다.
- 무료 서비스 제공 기간·한도는 언제든 바뀔 수 있으므로 심사 전/심사 중 점검하고, 외부 의존성 없는 README 로컬 실행 경로도 준비한다.

## 4. 실용 예산·과금 방지 구현

- API 호출 사전 검사: `MAX_AI_CALLS_PER_DAY`, `MAX_REQUESTS_PER_SESSION`, `MAX_RETRIES=1` 등 보수적 값으로 시작(정확 값은 실제 무료 한도 확인 후 수정). 한도 DB 기록 시각 UTC/KST 변환 주의.
- 금액과 PayPal 결제 승인 상태는 백엔드만 판단. 명시적 사용자 승인 없는 결제/캡처 불가. Sandbox 모드 환경변수 고정; 프로덕션 PayPal 엔드포인트 접근 거부.
- AI 프롬프트 내 실제 개인/고객 이름, 이메일, 비공개 계약/카드/계정정보 사용 금지. 가상 프리랜서 요구사항과 테스트 계정만 허용.
- 일반 웹 방문자가 무료 한도를 소진하지 않도록 요청 rate-limit, 접근 통제/데모 시나리오, 오남용·무제한 호출 방지.
- DB 원본 보존. GitHub는 소스/스키마·합성 fixture만, 실제 비밀키·.env·실거래는 저장하지 않음.
- 11/11 제출 후~12/16 01:00 심사 기간 접속·사용량·오류 코드 점검 계획. 이 문서 자체는 자동 점검 작업을 실행하지 않는다.

## 5. 외부 제약 발생 시 무료 대안 순서

1. Gemini 무료 모델 API 미접근/한도 초과: 무료 Workers AI 대상 모델 호환성·품질·카드 불필요 여부 검증.
2. Cloudflare 무료 CPU/요청 제한: Worker 책임을 인증·DB·외부 API 연동으로 축소. 여전히 실패하면 로컬 앱+재현 가능한 가이드(공식 규정 허용)를 비교. 다른 무료 호스트로 이전 시 계정/제약 검증 및 사용자 통지.
3. Sandbox API 실패: 원인(계정/한국 지역/인증/권한/SDK/테스트계정)을 구분하여 운영진 공식 Discord 지원; 실제 성공이라고 주장 금지.
4. 구독 기능에 API 제약: 전체 사용자 목표 변경 전, 계약상 의미가 유지되는 로컬 구독 상태 시뮬레이터(실 API와 명확히 구분) vs 적용 가능한 무료 API 대안 2개 제시 후 승인.
5. 무료 계정 등록에 카드/결제 요구: 가입을 진행하지 않고 대안을 먼저 제시.

## 6. 참고 링크

- [PayPal 공식 Rules](https://paypalaihackathon.devpost.com/rules)
- [PayPal FAQ](https://paypalaihackathon.devpost.com/details/faqs)
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API Model Access](https://ai.google.dev/gemini-api/docs/models)

**주의:** 0원 **설계**가 0원 **실사용 성공**을 뜻하지 않음. 아직 API 키 발급, 실제 청구 상태, 첫 Sandbox 호출, 무료 AI 호출, 배포, 최종 제출 검증은 없다.
