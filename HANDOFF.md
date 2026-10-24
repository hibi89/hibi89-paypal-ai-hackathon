# PayPal D08 종료 → D09 재개 인수인계 (2026-10-24 KST)
<!-- resume: day_id=PPL-D09; percent=0; est_h=5; safe_h=9 -->

> 시작 명령: **`[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]`** 또는 `ㄱ` (영어 키보드 `r` 포함). GitHub 최신 `lead/paypal` 확인 후 이 문서가 가리키는 D09를 직접 개발한다. 자동 백그라운드 개발은 아니다.

## ① 목표·확정 요구·기술
AI 견적(사람 승인)→PayPal Sandbox Orders/GET/capture→계약·마일스톤·납품/검수→구독/Webhook. Node22/로컬 SQLite, 127.0.0.1 HTML 데모, 배포 후보 Cloudflare Workers/D1 Free. 추가 지출 **₩0**; Live·카드·유료API·실고객 PII 무단 사용 금지. 내부 목표 11/11, 공식 마감 **11/13 05:00 KST**.

## ② 완료 기능·변경·근거
D08 **오프라인 100%**: `src/contract_api.mjs` 신규 계약 CREATE/GET/events/submit/accept/reject Fetch handler, `src/offline_demo_server.mjs` 로컬 연결, `src/quote_api.mjs`의 bounded JSON/응답 공통 함수 재사용. Actor/Merchant는 주입된 검증 세션에서만 참조, CSRF/Origin 검사, wrong merchant/owner 404, reviewer role 403, immutable eventId/version CAS 409. 결제 POST 503 유지. 기존 결제 DB와 이력 보존. `main`·feature 브랜치 무변경.
- 방식 비교: 기존 결제·quote API에 계약 분기 직접 통합 vs. 별도 `contract_api.mjs` → 후자가 수정 범위와 회귀 위험이 작아 채택(무상, 백엔드 오프라인 한정).

## ③ 테스트·성공/실패·미검증
- **성공 SHA `17b804eb93d2d36f94a2813b6c002769fdd5b9c2`** — [GitHub Actions 40070199115](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40070199115), **Node npm test 131/131 PASS, FAIL 0, 기존 127.0.0.1 Chromium quote E2E PASS**.
- D08 신규 `tests/contract_api.test.mjs` **10건**: 계약/조회(GET 무부작용), owner submit, reviewer accept/reject, 인증·Origin/CSRF, DB/merchant 권한, 재시도/version, malformed/oversize body, 실제 Node loopback HTTP와 결제 503 가드.
- 1차 [CI 40070147386](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40070147386) **130 PASS / 1 FAIL**: reviewerId===actorId 신원 검증 400을 foreign owner 404로 잘못 예상한 테스트 → 의미별 신원 사례 분리 및 재검증 성공.
- **미검증:** 실제 Sandbox/AI/Production/D1/실 사용자 세션/검수자 실제 브라우저 UI, Devpost. 기존 Chromium 성공은 계약 UI 신규 기능의 E2E가 아님.

## ④ 완료/진행/대기/차단·중단 지점
D01/D02/D05/D06/D07/D08 지정 오프라인 목표 100%. **D03 0%, 예상 3h/안전 8h + 외부 대기 UNKNOWN** (실 PayPal/무료 AI), **D04 80%, 예상 2h/안전 4h**, 실제 AI 차단. **NEXT D09 0%/100%, 예상 5h/안전 9h** (계약·납품 UI 및 상태 분리, 로컬 E2E). 이 퍼센트는 해당 일차 100점 분모이지 프로젝트 전체 아니다.

## ⑤ 오류·원인·재시도 방지·대안
- D08 1차 CI test 기대값 오류는 수정한 상태. 차후 날짜별 원장 D09 업데이트 때 과거 D08 0%를 고정 단언하지 말 것; `tests/daily_progress.test.mjs` 함께 갱신.
- 외부 인증·무료 AI 부재는 로컬 mock으로 대체 불가. 합성 세션을 운영 인증으로 표현하거나 공개 사이트로 배포하지 말 것. 실 Sandbox 접근은 사용자 안전한 계정 로그인/승인 필요, 비밀정보 채팅·GitHub 공개 금지.
- 결제 UNKNOWN/capture 재전송 금지, 서버 재조회(GET) 후 조정.

## ⑥ 저장소·브랜치·SHA·주요 경로
`hibi89/hibi89-paypal-ai-hackathon` **`lead/paypal` 정본**; 기능 SHA `17b804eb93d2d36f94a2813b6c002769fdd5b9c2`; 이 문서를 포함한 HEAD는 새 CI 통과 후 다시 확인. `CHAT_BOOTSTRAP.md`, `data/paypal_daily_progress.json`, `docs/roles/lead/LEAD_ACTIVE_WORK.md`, `src/contract_api.mjs`, `src/contract_milestones.mjs`, `web/offline_demo.html`/`web/demo_client.js`, `tests/browser_offline_e2e.py`.

## ⑦ Production URL·배포·실행
**Production/Vercel/Cloudflare 배포 미적용·미검증**. 개발 실행 `npm test`, `npm run demo` (Node >=22, experimental SQLite). CI 로컬 Chromium 기존 UI 검증 성공, 실 운영 서비스 테스트 없음. 실 공개 인프라 생성·권한 변경 전 사용자 승인 필요.

## ⑧ 원본·백업·인증 관리·수정 금지
GitHub Git history: D08 전 `7ff949c07ab3fd3a36cdbc1f925570f30e7e218d` 백업 기준. 실제 SQLite 사용자 DB는 GitHub에 없음·백업 없이 실자료 migration 금지. 코드/문서 변경 이전 버전 Git history로 복구 가능. `.env`, PayPal Sandbox client secret, 카드, PII, 실제 주문 데이터 공개 금지. `main`, `feature/*` 보존, force-push 금지.

## ⑨ 다음 작업 순서·완료 기준·승인
- D09 단일 READY, 원장 25/25/20/20/10: 계약 조회 UI → 납품/검수 상호작용 → 결제/검수 상태 분리 → 브라우저 E2E 보안 → GitHub CI·진척 원장 갱신.
- reviewer 검증은 **신뢰 가능한 서버 세션 전환/주입으로만** 수행. 브라우저가 임의 role/actorId 지정하는 백도어 금지. D09 local synthetic 가능 범위와 production 제약을 분리 표시.
- 성공 후 더 높은 독립 READY 과제 선행 가능. 외부 금전/실계정/배포 공개/범위 변경은 별도 승인.

## ⑩ 갱신 일시·기준·검증 범위
**2026-10-24 KST** GitHub `lead/paypal` D08 소스 및 Actions run 40070199115 검증. 실제 코딩 소요시간 **NOT_MEASURED**. 문서 포함 HEAD/CI는 새 commit 뒤 조회, 기능 근거 SHA `17b804eb`. 다음 채팅은 `HANDOFF`→`STATUS`→`AGENTS`→`REQUIREMENTS` 및 `ACTIVE`/원장 최신 확인.
[동기화 계약](docs/RESUME_SYNC_CONTRACT.md).
