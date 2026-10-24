# PayPal 단일 총괄 — ACTIVE WORK (2026-10-24 KST)
<!-- resume: day_id=PPL-D08; percent=0; est_h=4; safe_h=8 -->

> 한 문장 재개: `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]`. **개발 정본: `lead/paypal`**, `main` 릴리스·옛 worker 디스패처 사용 금지.

## ACTIVE READY — PPL-D08 (2026-11-01 배정분 선행)
- **상태 NOT_STARTED / 0%/100%, 남은 예상 4h·안전 확보 8h, 실측 NOT_MEASURED.**
- 구현 대상: `src/quote_api.mjs`, `src/offline_demo_server.mjs` 또는 별도 서버 contract handler, `src/sqlite_ledger.mjs`, `src/contract_milestones.mjs`, 기존 tests 전부 최신 HEAD 확인.
- 계약 생성/조회와 마일스톤 납품/검수 서버 API. 결제 HTTP POST 503, 읽기 전용 GET/F5 유지. `resolveSession`을 통해 인증된 actorId/merchantId만 신뢰하고 프런트 제공 role/owner/merchant를 권한으로 인정하지 말 것. 소유자 SUBMITTED, 등록된 검수자 ACCEPTED/REJECTED. 별도 계약 version CAS/eventId, 401/403/404/409, CSRF 및 Origin, 유효 입력 검증.
- 도메인 D07 `createContract`, `transitionMilestone`, `getContract`, `listContractEvents`는 backend-only. 서버 API 경로는 existing route와 충돌 없게 설계하고 테스트해야 한다.

## 체크리스트 (원장 분모 합계 100)
1. **CONTRACT_READ_AND_CREATE_API 25점** — owner/merchant/version 승인 검증, GET side-effect 0, 계약 생성 POST 보호.
2. **DELIVERY_SUBMISSION_API 25점** — 소유자 납품 제출, 필수 증거 메모, 중복/충돌 테스트.
3. **REVIEWER_DECISION_API 20점** — 명시적 승인/반려, 검수자 바인딩, 잘못된 상태 거부.
4. **AUTH_CSRF_IDEMPOTENCY_TESTS 20점** — 사용자 세션·Host/Origin/CSRF/버전/이벤트 ID 검증, GET/F5 무부작용, HTTP 503 결제 가드.
5. **CI_DOCS_HANDOFF 10점** — npm test / Actions 완료, 원장·현재 문서 원자적 갱신/인수인계.

## 완료/차단 요약
- **D07 100%**: 로컬 SQLite 계약 snapshot, PK/FK/CAS, 독립 납품 상태, append-only 이벤트 및 legacy migration; GitHub Actions **40069063023, 121 Node + Chromium PASS**. 근거 [상세](../../technical/PPL_D07_CONTRACTS_20261024.md) · SHA `e682d6dd`.
- D01/D02/D05/D06 각 오프라인 100%; D03 실 PayPal/AI 0%+외부 대기 UNKNOWN; D04 mock 80%/실 AI 20% 차단.
- 실제 PayPal Sandbox, 무료 AI, D1/Production, Devpost는 **NOT_TESTED**. 실 결제·카드·Live·유료비용·PII 공개 금지. 인증된 Production identity 미연결, mock 기능을 실제 결제로 표현 금지.

## 다음 채팅 종료 의무
원격 HEAD 확인 → D08 구현·테스트 → 일자별 100점 VERIFIED 증거/잔여/미검증 갱신 → `CHAT_BOOTSTRAP.md`, `AGENTS.md`, `STATUS.md`, `HANDOFF.md`, 이 파일, `TO_HACKATHON_LEAD.md` 같은 `resume:` 포인터와 원장 **동일 커밋** → CI/원격 SHA 재조회. [RESUME_SYNC_CONTRACT](../../RESUME_SYNC_CONTRACT.md) · [시간표](../../DAILY_CAPACITY_PLAN_20261024.md).
