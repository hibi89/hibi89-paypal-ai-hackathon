# PayPal — lead/paypal developer and safety contract
<!-- resume: day_id=PPL-D15; percent=20; est_h=5; safe_h=10 -->
> **최신 D15 (2026-10-24):** `src/offline_sandbox_d1_harness.mjs`로 Sandbox transport + D1 CAS + 주입된 신원 확인을 **네트워크 없는 합성 HTTP**에서 결합. 신규 13테스트, [Actions #40084869412](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40084869412) @ `b308fad345c8`: **Node 232/232, 로컬 Chromium, 18일 원장 PASS**. 최초 2개 테스트 비교 오류는 수정 후 재검증. **실 PayPal/AI/D1/Cloudflare 미실행**. D15 **20%** / 잔여 기본 **5h**·안전 확보 **10h** / 실측 NOT_MEASURED. [상세](docs/technical/PPL_D15_OFFLINE_TRANSPORT_COMPOSITION_20261024.md).


**원격 기준:** `hibi89/hibi89-paypal-ai-hackathon` / `lead/paypal` · 2026-10-24 KST.

**진도:** 18일 DONE 12 / PARTIAL 2 / BLOCKED 1 / NOT_STARTED 3. D15 **20% PARTIAL**, 기본 작업 잔여 **5h**, 예비 포함 안전 총량 **10h**, 실측 NOT_MEASURED. D15 예정일 2026-11-08, 작업 선행일 2026-10-24.

**최근 소스 검증:** `b308fad345c810917bd4736bc9d4b24f87cf2b79`, Actions [#40084869412](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40084869412) — Node 232/232 PASS, localhost Chromium PASS, 18일 진행표 PASS. 실제 PayPal/D1/AI/외부 호스팅 증거 아님.

**외부 차단:** D03 실제 Business/Personal PayPal Sandbox·무료 AI 계정 0% BLOCKED, D04 실 AI 20% 미완료, D15 Cloudflare Free·D1/운영 인증/공개 URL 미검증. 카드/유료 API/Live/실 고객 데이터/외부 배포 별도 사용자 승인 전 금지.

**다음 기술작업:** 사용자 승인 전까지 사설 session/merchant 권한 계약과 OAuth 안전 경계만 오프라인 점검. 실제 PayPal Business/Personal Sandbox 및 무료 AI 확보가 P0 차단; 추가 모의 테스트를 실 API 성공으로 기록하지 않음.

1. 사용자의 [페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈] 또는 `ㄱ`에 GitHub 원격 최신 `lead/paypal`을 읽고 실제 개발·테스트·커밋한다. 일반 개발 작업은 재승인하지 않되 외부 계정·배포·운영 인증·자금·Live/카드·비밀값은 명시 승인 필요.
2. 제품 범위: 실제 AI 견적 → 명시적 인간 승인 → PayPal Sandbox Orders/캡처 → 계약·마일스톤·검수 → 구독·서명 검증 웹훅. Mock PASS는 실 API 성공이 아니다.
3. PayPal POST는 GET/refresh/F5에서 절대 호출하지 않는다. quote version/owner/merchant/amount/currency를 서버에서 검증하고 멱등 원장 최초 점유 후에만 검토한다. UNKNOWN 뒤 재POST 금지·원격 GET 우선.
4. 현재 `src/offline_demo_server.mjs`는 127.0.0.1용 합성 신원·Node SQLite. Cloudflare 공개 Worker에 그대로 배포 금지. D1 스키마/GET·복구 코드는 Node SQLite shim에서만 검증됨.
5. [안전 규칙](docs/ZERO_COST_STACK_AND_GUARDRAILS.md) · [스케줄](docs/DAILY_CAPACITY_PLAN_20261024.md) · [활성 작업](docs/roles/lead/LEAD_ACTIVE_WORK.md) · [인수 규약](docs/RESUME_SYNC_CONTRACT.md)을 지킨다.
6. 매 세션 `npm test`, `python render_master_progress.py --check`, GitHub Actions Chromium 검증. JSON→`MASTER_PROGRESS.md` 자동재생성, `resume:` 동기화, 실측 없는 작업시간 부풀리기 금지. `expected_sha` 안전 커밋; force push 금지.

[현재 지시](docs/roles/lead/LEAD_ACTIVE_WORK.md) · [D15 GET/CAS 설계](docs/technical/PPL_D15_SANDBOX_GET_CAS_20261024.md) · [D15 DB/복구](docs/technical/PPL_D15_D1_RECOVERY_AUTH_20261024.md) · [원장](data/paypal_daily_progress.json) · [18일 표](MASTER_PROGRESS.md) · [인수 규약](docs/RESUME_SYNC_CONTRACT.md)
