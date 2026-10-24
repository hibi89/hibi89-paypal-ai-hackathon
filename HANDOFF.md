# PayPal — 최신 재개 인수인계 (2026-10-24 KST)
<!-- resume: day_id=PPL-D08; percent=0; est_h=4; safe_h=8 -->

> 새 채팅에서 정확히 **`[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]`** 한 줄만 입력하면 GitHub `lead/paypal` 최신 HEAD/원장 확인 후 D08 작업을 직접 구현·검수한다. `ㄱ`도 동일. 채팅이 열려 있지 않을 때 백그라운드 작업은 실행되지 않는다.

## 1. 프로젝트 목적 · 확정 요구 · 기술
AI 프리랜서 견적(사람 승인 필수) → PayPal **Sandbox-only** 주문/캡처/GET → 계약·마일스톤·납품 검수 → 구독/Webhook. Node >=22, SQLite 로컬, HTML demo, 향후 Cloudflare Free/D1 후보. 추가 지출 ₩0, Live/실카드 금지, 공식 마감 **11/13 05:00 KST**, 내부 목표 **11/11**. [REQUIREMENTS](REQUIREMENTS.md)에서 범위 유지.

## 2. 이번 완료 기능 · 설계 결정
- **D07 100% (오프라인 범위)**: `src/contract_milestones.mjs`에 계약 견적 승인 snapshot/금액 합산, 다단계 마일스톤 FK/순서, 소유자 납품 제출·검수자 승인/반려, version CAS/unique eventId/트랜잭션, 감사 DB UPDATE/DELETE 차단. 기존 `src/sqlite_ledger.mjs`에 연결하고 계약 후 견적 수정 차단. 지불 상태 `PAID`가 검수 완료를 자동 의미하지 않음.
- 별도 모듈 방식을 채택하여 기존 결제 가드, UNKNOWN/no retry 및 HTTP 결제 POST 503을 그대로 유지. legacy Day2 스키마 업그레이드·동시 커넥션 테스트 추가.

## 3. 검증 명령 · 근거
- GitHub Actions [40069063023](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40069063023) **completed/success, `npm test` Node 121/121 PASS(실패 0), 로컬 실제 Chromium E2E PASS**. D07 코드 기준 SHA `e682d6dd876cfc1afe9ca7aeec32842ad306d698`. 처음 D07 커밋 `8c15b126`의 CI [40068908347](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40068908347)도 120/120+Chromium PASS.
- 새 문서 동기화 커밋은 별도 Actions 확인 필요. **Sandbox 실결제/AI/운영배포/Devpost 미검증**. 단위 테스트와 실거래 혼동 금지. [기술 보고](docs/technical/PPL_D07_CONTRACTS_20261024.md).

## 4. 완료·진행·대기·차단 및 중단 지점
- D01/D02/D05/D06/D07 각각 지정 **오프라인 범위 100%**. **D03 0%, 3h/8h + 외부 접근 대기 UNKNOWN**; **D04 80%, 2h/4h, 실제 무료 AI 20% 차단**.
- **ACTIVE PPL-D08 0%/100%, 남은 예상 4h/안전 확보 8h, 실측 NOT_MEASURED**. [LEAD_ACTIVE_WORK](docs/roles/lead/LEAD_ACTIVE_WORK.md) → 인증된 계약/납품/검수 서버 API 개발부터 재개. 전체 프로젝트 진행률로 계산하지 않는다.

## 5. 오류 근거 · 원인 · 실패 재시도 방지 · 대안
- 외부 Sandbox Business/Personal 및 무료 AI 계정 접근 부재: 실제 OAuth/Orders/AI 호출 증빙 없음. 계정 비밀을 공개 저장소에 넣지 말 것; 사용자가 안전한 비공개 로그인/권한을 제공할 수 있을 때만 실 API 검증. 그 전에는 **offline local**만 개발.
- 기존 로그인 없는 loopback demo를 공개하지 말 것. D08에서 서버 세션으로 owner/reviewer/merchant를 신뢰 가능한 방식으로 제공해야 한다. 브라우저 제공 actorId로 권한 판단 금지.
- PayPal POST timeout/UNKNOWN은 원격 GET 이후 수동 판단; 동일 capture POST 무작정 재발송 금지.

## 6. 저장소 · 브랜치 · SHA · 주요 경로
- [GitHub](https://github.com/hibi89/hibi89-paypal-ai-hackathon) · **`lead/paypal` 개발 정본**, `main` 릴리스 전용, 옛 feature/* 보존. D07 기능 완료 SHA `e682d6dd...`. 현재 문서 커밋의 최종 HEAD는 GitHub에서 다시 확인할 것.
- 원장 `data/paypal_daily_progress.json`; 소스 `src/sqlite_ledger.mjs`/`src/contract_milestones.mjs`; 테스트 `tests/contract_milestones.test.mjs`; 실행 진입 `CHAT_BOOTSTRAP.md`.

## 7. Production URL · 프로젝트 · 실행 환경
- **Production URL/Vercel: 미적용/미검증**. 배포 성공 증빙 없음. 로컬 `npm test` 및 `npm run demo` (Node >=22 --experimental-sqlite). Chromium GitHub CI만 확인.
- 실제 공개 인증, D1 마이그레이션, 운영 웹훅 및 Devpost 제출은 이후 과제.

## 8. 원본/백업 · 인증 관리 · 수정 금지
- GitHub Git history와 변경 전 SHA `48a88451`가 코드 원본 복구 기준; DB 사용자 데이터는 GitHub 업로드 금지. 실 DB 파일 변경은 실제 DB 원본 백업 후 수행. .env/token/카드/PII 공개 금지. `main`/feature/* 원본 보존, force push 금지. PayPal Live/유료/권한·공개 전환은 사전 승인.

## 9. 다음 작업 · 완료 기준 · 승인 사항
- D08 체크리스트 **25/25/20/20/10**: 계약 생성/조회 API → 납품 제출 → 검수자 승인·반려 → 서버 인증/CSRF/Origin/멱등·GET 검사 → CI·문서 동기화.
- 각 단계는 먼저 기존 API와 테스트를 확인한 뒤 최소 변경한다. 외부 계정 승인·유료/Live·공개 배포는 사용자 동의 없이 진행하지 않는다.
- 작업마다 일자별 VERIFIED 점수와 잔여 예상/안전시간을 원장+6문서에 같은 커밋으로 보존. [동기화 계약](docs/RESUME_SYNC_CONTRACT.md).

## 10. 확인일시 및 검증 범위
- 기록일: **2026-10-24 KST**. 실제 확인: GitHub 원격 `lead/paypal`, D07 Actions 40069063023 Node+Chromium. 실제 작업 소요시간 **NOT_MEASURED**. 문서 기준은 이 핸드오프를 포함하는 다음 원격 문서 커밋, 코드 기능 증거 SHA는 `e682d6dd`로 분리. 새 세션은 HEAD/CI를 먼저 읽을 것.
