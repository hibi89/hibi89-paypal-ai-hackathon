# PayPal 단일 총괄 — CURRENT ACTIVE WORK (2026-10-24 KST)
<!-- resume: day_id=PPL-D10; percent=0; est_h=3; safe_h=7 -->

> 정확한 시작 문장 `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]` 또는 `ㄱ`/`r`. GitHub `lead/paypal` 최신 HEAD → [진척 원장](../../../data/paypal_daily_progress.json) → 이 파일 → 직접 개발·테스트. 옛 worker 라우터 사용 금지.

## D10 READY — 2026-11-03 계획분 선행
- **0%/100%, 남은 예상 3h / 안전 확보 7h, 실측 NOT_MEASURED.**
- 공식 PayPal Subscriptions/Plans·Webhooks·서명 검증 API 문서와 계정/국가·무료 Sandbox 가능성/Rate limits를 **최신 공식 출처**로 조사하고, 확인 가능·실계정 차단·미검증을 명확히 구분. 서비스 실제 사용 가능 여부를 추정으로 승인하지 않는다.
- D10 100점 체크리스트 원장 그대로: `OFFICIAL_SUBSCRIPTIONS_REGION_FEASIBILITY` 25, `WEBHOOK_VERIFICATION_OFFICIAL_RESEARCH` 25, `SUBSCRIPTION_STATE_CONTRACT` 20, `FREE_ACCOUNT_COST_AND_ACCESS_GATES` 20, `CI_DOCS_HANDOFF` 10.
- 실 계정이 없어도 독립적인 공식 문서 검증/상태 모델·테스트를 수행할 수 있다. D03 실 PayPal Sandbox·무료 AI API 접근 **0% BLOCKED** (3h/8h + 외부 대기 UNKNOWN), D04 실 AI 20% **BLOCKED** (2h/4h) 그대로 유지. 실거래 OAuth/Subscriptions/한국 계정 검증을 했다고 주장하지 말 것.
- 기존 결제 POST 503, Live·유료/카드·비밀·고객자료 공개/전송 금지. GitHub Public 소스 변경 전 최신 HEAD/CI 확인, 원본 이력 보존.

## 이전 작업 D09 완료 (오프라인/로컬만)
- `web/offline_demo.html`, `web/contract_client.js`, `web/demo_client.js`와 `src/offline_demo_server.mjs` 수정; local 테스트 `scripts/run_demo.mjs`, `tests/browser_offline_e2e.py`, `tests/offline_demo_server.test.mjs`.
- 승인 견적→명시 계약 생성, 납품 제출/검수 반려·재제출·승인, 금전 `NOT_CAPTURED`와 검수 `ACCEPTED` 독립 표시. 계약 생성·납품/검수 POST 모두 클릭 발생 때만.
- 검수자 신원은 테스트 전용 서버 생성 random cookie, CI harness 별도 브라우저 context에만 주입, Browser actor/role payload 신뢰 안 함. 외부/운영 로그인으로 사용 금지.
- [D09 CI 40071015803](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40071015803) **Node 133/133 PASS / Chromium PASS**, 기능 SHA `9e3ee79aab9e7b2326360fd165c9bb12a575efe2`. [기술 메모](../../technical/PPL_D09_CONTRACT_BROWSER_20261024.md).

## 종료/인수인계
`npm test`→실제 Actions→원장/현재 포인터 `CHAT_BOOTSTRAP.md` `AGENTS.md` `STATUS.md` `HANDOFF.md` 이 파일 `TO_HACKATHON_LEAD.md` 동일 SHA/동일 resume 포인터로 커밋 → 원격 새 Actions 검증. [RESUME_SYNC_CONTRACT](../../RESUME_SYNC_CONTRACT.md). 기능 미증명은 VERIFIED 금지, 차단·이월 명시.
