# PayPal — D10 완료 → D11 인수인계 (2026-10-24 KST)
<!-- resume: day_id=PPL-D11; percent=0; est_h=5; safe_h=10 -->

**재개 명령:** `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]` · `ㄱ` · `r`. 정본 `lead/paypal`; [원장](data/paypal_daily_progress.json)·[ACTIVE](docs/roles/lead/LEAD_ACTIVE_WORK.md)·[부트스트랩](CHAT_BOOTSTRAP.md). GitHub HEAD 우선, force-push 금지.

**D10 범위 100% 완료:** 공식 문서 검증과 오프라인 순수 구독 이벤트 상태 계약. *이는 실제 PayPal 구독 계정/서명 실증이나 운영 기능 완료가 아니다*. [D10 근거](docs/technical/PPL_D10_SUBSCRIPTIONS_FEASIBILITY_20261024.md): REST Subscriptions/Plans, Webhook original raw CRC32(decimal) or verify-signature postback, 25회/3일 재전송, KR 일반 REST 코드는 있지만 해당 판매자 Subscriptions 가입/기능 권한 NOT_TESTED.

**CI:** [Actions 40072332710](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40072332710) `completed/success` at `1c852b75b6841eeee0cd2968c234d69fedaa9e0a`, **Node 146/146 PASS, Chromium 기존 로컬 계약·검수 E2E PASS**. 첫 D10 [40072290586](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40072290586) 실패 144 PASS/2 FAIL (합성 ID에 '.' 사용) 수정 후 통과. 본 문서 커밋의 별도 CI도 확인해야 함.

**NEXT:** **D11 0%/100%, 예상 잔여 5시간, 안전 확보 10시간, 실측 NOT_MEASURED**. Webhook HTTP ingestion/cryptographic verification boundary/SQLite UNIQUE event id/dedup/역순·재전송·GET-first 검증(오프라인). 실제 PayPal app webhook ID/cert/외부 HTTPS listener·OAuth/merchant/Biz+Personal/무료 AI/Production/D1/Devpost는 NOT_TESTED. 결제 HTTP POST는 503 유지. Live·실금전·유료 API·실고객 정보·secret 공개 금지. 내부 마감 11/11, 공식 11/13 05:00 KST.


## 1. 목적·요구·기술
AI 견적(명시 사람 승인 필수) → PayPal Sandbox 결제 → 계약·납품/검수 → 구독/Webhook. Node >=22, 로컬 SQLite/Chromium/127.0.0.1 synthetic demo. 앞으로 Cloudflare Free/D1 후보(미검증). PayPal 결제/구독 POST **503 fail-closed**, Live·카드·고객 정보·유료비용·token 공개 금지. 사용자 최종 승인권, 단일 PayPal 총괄이 직접 개발.

## 2. 이번 완료·기술 설계 결정
- D10 공식 웹 조사 `docs/technical/PPL_D10_SUBSCRIPTIONS_FEASIBILITY_20261024.md`: Subscriptions v1 제품/요금제/API, event types, 앱 등록 Webhook ID/서명·HTTPS listener, Sandbox/Live 분리·요금 조건. KR 일반 REST 지원만 확인; 실 한국 상점 계정 구독 권한은 **NOT_TESTED**, 가입 실패/차단이라고 추정 금지.
- `src/subscription_contract.mjs`: 오프라인 상태 판정 `UNKNOWN`→`APPROVAL_PENDING`→`ACTIVE`→`SUSPENDED`→`ACTIVE`→`CANCELLED/EXPIRED`; event id replay 무시, old/timestamp/resource/unsupported/terminal contradictions GET-first; **PAYMENT.SALE.* 및 FAILED는 돈·구독 상태 자동 결정 불허**.
- 설계 A: 실제 provider callback/인증 계정 없이 서명 API 구현 시 false confidence·SSRF 위험. 설계 B: 현재처럼 pure contract+negative test 우선, D11 실제 cryptographic input/SQLite boundary 구현. B 채택, D03 실제 credential 대기 유지.
- `trusted:true`는 API Gateway/서명 검증 구현이 아니라 신뢰된 호출자 입력 **전제**다. 절대 HTTP body/쿼리/헤더를 trusted 플래그로 연결하지 말 것.

## 3. 검증·실패·증거
- [Actions 40072332710](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40072332710) `completed/success`, SHA `1c852b75b6841eeee0cd2968c234d69fedaa9e0a`: Node **146/146 PASS**, 기존 실제 loopback Chromium 계약/검수 E2E PASS. 13건 `tests/subscription_contract.test.mjs` 신규.
- 첫 D10 CI 40072290586: 144 PASS, 2 FAIL(합성 webhook eventId에 마침표가 있어 식별자 검증 실패). 실제 domain event 처리 버그 아님, fixture ID canonical 변경 후 재검증 PASS.
- 실제 PayPal Sandbox Subscriptions/한국 merchant entitlements, 인증된 webhook delivery/crypto, Developer API key, 실제 AI/Production/D1/Devpost **NOT_TESTED**.

## 4. 완료/차단 및 현재 중단
- D01/D02/D05/D06/D07/D08/D09/D10 계획된 오프라인/조사 수락기준 **100%**. D03 실 PayPal+AI **0%**, 예상 3h/안전 8h+미정 외부 대기. D04 **80%**, 예상 2h/안전 4h 실 AI 20% 차단.
- **D11 READY 0%/100%, 예상 5h/안전 10h**, raw webhook 서명/입력 보호 + durable unique event + 역순/재전송/GET-first. D11 실제 provider 인증 전까지 mock result와 실 result 반드시 분리.

## 5. 오류/원인·보안·대안
- Official REST Webhooks guide CRC32 original raw body in decimal, registered Webhook ID, certificate signature 또는 verify-webhook-signature postback; 시뮬레이터 postback 방식 사용 불가. 다른 PayPal 제품 페이지의 hash 설명과 혼용 금지. Cert URL SSRF·인증서 탈취, 재전송·중복 events, 외부 부당 결제 POST 차단 필요.
- 실제 Sandbox/AI 외부 접근 아직 불가: 사용자만 허용된 개인 계정 로그인/승인 처리, credential/PII GitHub Public 업로드 금지. 원본 PayPal API 호출 성공으로 표시 금지.

## 6. 저장소·브랜치·원본
`hibi89/hibi89-paypal-ai-hackathon` **`lead/paypal` 최신 HEAD**. D10 기능 SHA `1c852b75b6841eeee0cd2968c234d69fedaa9e0a`, 이전 인수인계 기준 `ceeceed76ab582e356ace3077a11f6b425a0bcf4`. `main`/feature/* 변동 없음, force push 금지. 변경 전후 Git history 복구 가능, 로컬 실제 SQLite 사용자 DB에 접근/수정하지 않았음. Public repo에는 credentials 없음.

## 7. 실행/배포
`npm test` Node22 `--experimental-sqlite`; `npm run demo` synthetic 127.0.0.1. GitHub Actions Ubuntu Node+실 Chromium. **운영 URL/Vercel/D1 없음**, Webhook 실제 공개 HTTPS 리스너 없음, Live 금지.

## 8. 잔여·예상시간
D11 예상 **5h**, 안전 확보 **10h**, D03 예상 3h/안전8h+외부 대기 UNKNOWN, D04 예상2h/안전4h. 실제 경과시간 `NOT_MEASURED`. 전체 일별 진행률과 전체 해커톤 완성률 별개. 82h/164h 기존 전체 계획 추정치는 과거 예산, 미실측. 11/11 내부, 11/13 05:00 KST 공식 마감.

## 9. 다음 과제 기준·승인사항
[ACTIVE](docs/roles/lead/LEAD_ACTIVE_WORK.md)의 D11 25/25/25/15/10 체크리스트 진행. 실제 PayPal certificate/merchant entitlement/real HTTPS delivery, 유료 계정, 외부 공개 설정 변경에 사용자 승인 필요. CI 없이 성공 문구 금지. 같은 commit에 원장·전체 문서 최신화.

## 10. 갱신 날짜·범위
2026-10-24 KST, GitHub D10 기능 CI PASS 검증; 새 문서 포함 HEAD/CI 별도 확인 필요. [연속성 규약](docs/RESUME_SYNC_CONTRACT.md).
