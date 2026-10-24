# PayPal — 새 채팅용 최신 인수인계 (2026-10-24 KST)

<!-- resume: day_id=PPL-D07; percent=0; est_h=4; safe_h=8 -->

> 새 채팅에서 정확히 `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]`만 보내면, PayPal 총괄 개발자는 **이 GitHub 인수인계를 조회한 뒤 다음 작업을 직접 수행**한다. 설명만 하거나 다시 사용자에게 지시문을 만들지 않는다.

## 1. 반드시 복원할 실행 상태
- 저장소 `hibi89/hibi89-paypal-ai-hackathon`, **개발 브랜치 `lead/paypal`**. `main` 릴리스 스냅샷과 feature/구 worker 라우터는 **현재 개발 정본 아님**.
- 최신 완료: **D06 로컬 Chromium E2E 100% / 남은 예상 0h·안전 0h**. 기능 검증 근거 `8cb714a21196336d6f28e3487f76dc04f9f38708`, [CI 40066974668](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40066974668) **Node 103 PASS, Chromium PASS**.
- **CURRENT NEXT: D07 (10/31 배정일, 선행 승인)**. 계약·마일스톤 DB. **0%/100%, 남은 예상 4h/안전 8h**; `data/paypal_daily_progress.json` 체크리스트 25/25/20/20/10을 그대로 유지.
- D03 실 Sandbox/무료 AI **0%, 잔여 3h/안전 8h+외부 대기 UNKNOWN**. D04 실 AI 차단 **80%, 잔여 2h/안전 4h**. D01/D02/D05 각 offline 목표 100%.
- **실 Sandbox/AI/운영 계정/호스팅/Devpost 출품 NOT_TESTED**. 결제 POST 503. Node 로컬 SQLite·OFFLINE_MOCK·로컬 Chromium 검증을 실제 PayPal 거래로 표시하지 않는다.

## 2. D07 즉시 구현 요령
- `src/sqlite_ledger.mjs`, `src/payment_contract.mjs`, `tests/sqlite_ledger.test.mjs`를 최신 HEAD에서 읽는다.
- 계약·마일스톤·납품/검수 이벤트 테이블을 오프라인 DB 마이그레이션 호환 방식으로 추가한다. 승인된 견적 snapshot/version/owner와 계약 연계, 결제와 납품 별도 상태 전이, 감사 기록 append-only/외래키·unique/트랜잭션.
- 기존 API 안전 가드·미결제 UNKNOWN·무단 POST 금지 불변. `npm test` 및 CI에서 통과 확인, 새 테스트·증거가 없는 완료% 상승 금지.
- D07이 끝나면 최신 원장·독립 과제 기준으로 D08 이후 선행 가능. 실 Sandbox/AI 접근은 차단 항목 유지·수시 점검.

## 3. 매 작업 후 저장해야 하는 GitHub 체크포인트
1. 실제 소스·테스트 변경 및 CI/브라우저 실증 결과와 원격 SHA 확인.
2. `data/paypal_daily_progress.json`: 당일 목표 100점의 VERIFIED 점수%, 남은 **예상/안전** 시간, 실측/미계측, 차단 및 이월.
3. **같은 커밋**에서 `CHAT_BOOTSTRAP.md`, `docs/roles/lead/LEAD_ACTIVE_WORK.md`, `STATUS.md`, 이 `HANDOFF.md`, `docs/roles/lead/TO_HACKATHON_LEAD.md`의 현재 `resume:` 포인터와 설명 일치. 기술 문서/일정 필요시 동시 수정.
4. `npm test` → GitHub push → Actions 결과 조회 → 원격 SHA 재확인. Actions 대기/실패는 PENDING/FAIL로 정확히 기록; 인수인계 완결이라고 속이지 않음.
5. 새 채팅에서 사용자에게 **이번 작업 진행 X%/100%, 남은 예상 Yh/안전 Zh, 다음 READY, 외부 차단, 최종 검증된 SHA·CI URL** 보고.

## 4. 기타
- 새 채팅은 [CHAT_BOOTSTRAP](CHAT_BOOTSTRAP.md), [ACTIVE](docs/roles/lead/LEAD_ACTIVE_WORK.md), [STATUS](STATUS.md), [원장](data/paypal_daily_progress.json), [동기화 계약](docs/RESUME_SYNC_CONTRACT.md), [시간표](docs/DAILY_CAPACITY_PLAN_20261024.md)를 읽어야 한다.
- 11/11 내부 목표, 11/13 05:00 KST 공식 마감. 실제 Devpost 제출·브라우저 공개 데모·영문 영상 미완료. 결제 Live·신규 돈·실고객 PII 유출 절대 금지.
- 이전 상세 작업 이력은 [직전 Git commit](https://github.com/hibi89/hibi89-paypal-ai-hackathon/commit/8cb714a21196336d6f28e3487f76dc04f9f38708)과 [archive](docs/archive/LEAD_ACTIVE_WORK_HISTORY_20261024.md). ChatGPT가 무인 백그라운드 자동 개발하는 기능은 아니다.
