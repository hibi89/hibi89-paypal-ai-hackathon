# PayPal — D09 완료, D10 재개 인수인계 (2026-10-24 KST)
<!-- resume: day_id=PPL-D10; percent=0; est_h=3; safe_h=7 -->

> 고정 한 문장: **`[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]`**, 또는 `ㄱ` / `r`. 최신 `lead/paypal` → [ACTIVE](docs/roles/lead/LEAD_ACTIVE_WORK.md) → [진척 JSON](data/paypal_daily_progress.json)에서 **D10 직접 작업**. 무인 백그라운드 개발 기능은 아니다.

## ① 목표/확정 요구/기술
AI 견적→인간 승인→PayPal Sandbox Orders/GET/capture→계약/마일스톤/납품 검수→구독/Webhook, 단일 출품작. Node >=22, 로컬 SQLite/loopback HTML, 향후 Cloudflare Workers/D1 Free 후보. 신규 지출 0원·Live/실고객/카드/API 비밀 공개 금지. 내부 목표 **11/11**, 공식 **11/13 05:00 KST**.

## ② D09 완료/설계/변경 근거
- 계약·납품·검수 로컬 UI, 승인 견적 기반 계약 생성, 소유자 제출/검수자 반려/소유자 재제출/검수자 승인. 계약 `ACCEPTED` 와 지불 `NOT_CAPTURED`를 분리 표시.
- 신규 `web/contract_client.js`, HTML·quote UI 수정, `src/offline_demo_server.mjs`의 별도 reviewer synthetic 세션. 권한은 서버가 발급한 32-byte random 테스트 쿠키로만 판별(브라우저 role/actorId 전환 불가), test opt-in, 임시 파일 0600 처리 후 정리.
- 기존 단일 synthetic owner만 사용하는 설계는 reviewer 브라우저 검증 불가. 위험한 공개 role selector 대신 opt-in server-issued reviewer 세션/별도 Playwright context를 택함. 실제 Production 인증으로 사용해서는 안 됨.
- PayPal 결제 POST 503 유지; GET/F5 조회 전용. 원본 데이터/기존 API/서버 보호 구조 유지.

## ③ 테스트·성공/실패/미검증
- **기능 증거 SHA `9e3ee79aab9e7b2326360fd165c9bb12a575efe2`**, [GitHub Actions 40071015803](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40071015803) `completed/success`, **Node 133 PASS / 0 FAIL + 실제 로컬 Chromium D09 브라우저 E2E PASS**.
- E2E: 기존 견적 생성·승인·수정 회귀, 계약 생성, 조회·F5 무 POST, 중복 제출 방지, review 거절→다시 제출→review 승인, `NOT_CAPTURED` 유지, 결제 POST 0. Node tests: 쿠키 위조/role 쿼리·헤더 무시, owner accept 403, reviewer 검수, append-only events.
- **Sandbox 실제 거래, PayPal Subscriptions/실 Webhook 서명, 실제 AI, 사용자 계정, Production/D1, Devpost 제출 미검증**. 로컬 브라우저 합격을 실제 금융 API 성공으로 표시 금지.

## ④ 완료/진행/대기/차단
- D01/D02/D05/D06/D07/D08/**D09** 각 정의된 오프라인 일차 목표 **100%**.
- **D03 0% 예상 3h/안전 8h + 계정 접근 대기 UNKNOWN**, 실 PayPal·무료 AI 차단. **D04 80% 예상 2h/안전 4h**, 실 AI 20% 미완료.
- **NEXT D10 0%/100%, 예상 3h/안전 7h**, 구독/Webhook 공식 가능성 조사·상태 계약 설계. 전체 프로젝트 완료율과 일차 % 혼동 금지; 실 투입시간 `NOT_MEASURED`.

## ⑤ 오류 근거/원인/시도/금지/대안
- D09 기능 CI 성공. reviewer test cookie는 loopback에서만 신뢰; 임의 공개 사용하면 인증 위험. 공개 로그인 연동 전 reviewer 기능 공개 금지.
- 실 Sandbox/무료 AI는 계정 접근 부재로 차단. 시크릿을 GitHub/채팅에 붙이는 방식 금지. 외부 승인 이후 별도 실증 수행.
- 실제 PayPal POST 결과 `UNKNOWN`이면 GET 검증 없이 재캡처 금지. 기존 원장 CAS/unique 보존.

## ⑥ 저장소/브랜치/SHA/주요 경로
[GitHub](https://github.com/hibi89/hibi89-paypal-ai-hackathon) `lead/paypal` 현재 개발 정본. D09 기능 SHA `9e3ee79aab9e7b2326360fd165c9bb12a575efe2`; 문서 동기화 커밋 SHA는 이 파일 포함 최신 HEAD로 재조회. 소스 `web/contract_client.js`, `src/offline_demo_server.mjs`, `src/contract_api.mjs`; 브라우저 `tests/browser_offline_e2e.py`; 원장 `data/paypal_daily_progress.json`.

## ⑦ Production/실행 명령/환경
**Production URL/Vercel/Cloudflare 배포 미적용**. 로컬 `npm test`, `npm run demo` (Node22). CI Ubuntu runner Node+Chromium E2E; real network provider/운영 React 검증 없음. 더 큰 권한 변경/계정 연결은 승인 필요.

## ⑧ 원본/백업/비밀·금지
D09 이전 `c0d9afe5b8f6257ee61f1b72d8faf8e672fadcc1`가 소스 기준 복구 가능 커밋; Git history가 백업. 실제 사용자 DB는 업로드/변경되지 않았고 실제 SQLite 백업 작업은 수행하지 않음. `main`, feature/* 무변경, force push 금지. 임시 reviewer 쿠키는 test 시에만 사용/미공개; 실 키·개인정보·PayPal Live 금지.

## ⑨ 다음 우선순위/완료 기준/승인
**D10**: 최신 PayPal 공식 Subscriptions·Webhook/서명 문서 및 국가/한국 계정 지원/무료 제한 확인; 상태 계약·전이/중복 이벤트 정책을 테스트 가능한 구조로 설계. 원장 25/25/20/20/10. 미확인 실 계정은 차단 표시. 이후 선행 READY 수행 가능. 외부 결제·신규 비용·공개 URL/권한 변경은 사전 승인.

## ⑩ 갱신 시각/검증 범위
2026-10-24 KST 작성. 실제 확인한 원격 D09 Actions 40071015803 완료 성공, 133 Node PASS+Chromium. 시간 `NOT_MEASURED`, 유료/실 API/운영 배포 없음. 문서 포함 후 최신 HEAD/Actions 추가 확인. [RESUME_SYNC_CONTRACT](docs/RESUME_SYNC_CONTRACT.md).
