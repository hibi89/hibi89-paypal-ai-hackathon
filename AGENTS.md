# PayPal — lead and developer instructions
<!-- resume: day_id=PPL-D15; percent=20; est_h=5; safe_h=10 -->
> **D15 로컬 복구·신원 경계 신규 실증 (2026-10-24):** `src/d1_recovery.mjs`·`tests/d1_recovery.test.mjs` 11건 추가. [Actions #40082429683](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40082429683) @ `949eb8b25645`: Node **204/204**, 로컬 Chromium 및 18일 진행표 PASS. 조회 SELECT-only/내부 복구 권한/5분 경과 IN_FLIGHT→UNKNOWN/멀티테넌트 404 보존. **D15 20% 유지, 기본 5h/안전 10h**, 실측 NOT_MEASURED. 실 PayPal GET·운영 세션·D1·외부 배포 NOT_TESTED. [근거](docs/technical/PPL_D15_D1_RECOVERY_AUTH_20261024.md).

> **D15 2026-10-24 후속 기술 검증:** D1 후보 스키마 `migrations/d1/0001_payment_claims.sql`, 단일 점유 함수 `src/d1_claim.mjs`, 9개 로컬 SQLite/D1-형상 검증(`tests/d1_claim.test.mjs`) 추가. [GitHub Actions #40081717845](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40081717845) @ `0d8497a69b5`: **Node 193/193, 로컬 Chromium, 18일 일정 검사 PASS**. 실제 D1/Cloudflare 계정·실 PayPal/AI·공개 URL은 **NOT_TESTED**. 진척률 **D15 20%/100% 그대로**, 잔여 기본 **5시간**·안전 확보 **10시간** (계획, 실측 NOT_MEASURED). 외부 배포·계정 승인 전 실행 금지.
> **D15 진행 기록 (2026-10-24 KST):** `lead/paypal`의 사전 검사 코드 `src/hosting_preflight.mjs`·CLI·4개 테스트와 [D15 설계](docs/technical/PPL_D15_HOSTING_PREFLIGHT_20261024.md)를 추가. 실제 GitHub Actions [#40080872405](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40080872405) @ `18875d360b21`: **Node 184/184, 로컬 Chromium E2E, 18일 진척 검사 PASS**. D15 **20%**(설계·의존성 확인만 검증). 남은 기본 5h/안전 총량 10h, 실측 NOT_MEASURED. 공개 URL/Cloudflare 계정/운영 인증/D1/실 PayPal·실 AI는 **NOT_TESTED**. `npm run preflight:hosting`는 차단 증거 출력 후 종료 코드 2(예상 동작). 사용자 별도 승인 없이는 배포 금지.


**원격 기준:** hibi89/hibi89-paypal-ai-hackathon, 개발·총괄 lead/paypal. 사용자 명령 [페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈] 또는 ㄱ.

**D14 완료:** 사용자 승인 MIT LICENSE·package.json·라이선스 테스트, 오프라인 보안/영문 재현 초안. 검증 SHA d45b8d5a055cdf236a9a004e165a090d21d467db, Actions https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40079691820 — Node 180/180, 로컬 Chromium 및 18일 마스터 PASS.

**다음:** PPL-D15(11/08 원래 예정), 20% PARTIAL, 기본 잔여 5h/안전 확보 10h, 실제 투입 NOT_MEASURED.

**외부 차단:** D03 실제 PayPal Business/Personal Sandbox 및 무료 AI 0% BLOCKED, D04 실제 무료 AI 20% 미검증. D15 공개 Cloudflare/D1·실인증·Production, D16 심사위원 실제 브라우저, D17 영상, D18 Devpost 미검증.

**보안:** 신규 지출 0원, 실 결제/카드/Live/유료 API/실 고객 데이터 금지. 사용자 승인 없는 새 호스팅·외부 계정·환경변수·도메인·권한 변경·공개 서비스 실행 금지. D14의 로컬 성공은 실제 PayPal/AI 성공이 아님.

**원본/이력:** 기존 변경 전 HEAD 31a89d12dad680627c0cefd92ce61928dc6fb337 및 이전 Git 커밋에 복구 가능한 전체 기록. 새 문서 동기화 커밋은 별도 CI로 확인.

1. PayPal 총괄 채팅 하나가 lead/paypal에서 직접 개발·테스트·검수·커밋한다. main은 별도 릴리스, 기존 feature 브랜치 보존.
2. 설계 2안 비교·비용·의존성 검토, 사용자 승인 게이트 준수. 변경 전 원격 HEAD·Git 이력 백업 확인, force push 금지.
3. GET/F5는 결제 생성·캡처 금지, 금액/통화/merchant/버전·인간 승인 검증, 멱등/복구. 현재 실제 PayPal POST는 503.
4. 원장 JSON → python render_master_progress.py --write → --check → npm test + GitHub Chromium CI → STATUS/HANDOFF/상위 보고의 동일 resume 메타와 원격 SHA 반영.
5. 별도 사용자 승인 전 Cloudflare/D1 배포·운영 세션/공개 URL 생성 금지. 다음 상세 작업 [PPL-D15](docs/roles/lead/LEAD_ACTIVE_WORK.md), [상위 시정](docs/FROM_HACKATHON_COMMAND.md), [인수 규약](docs/RESUME_SYNC_CONTRACT.md).
