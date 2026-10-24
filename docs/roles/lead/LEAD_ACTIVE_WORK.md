# PayPal 총괄 단일 작업 포인터 — CURRENT (2026-10-24 KST)

<!-- resume: day_id=PPL-D07; percent=0; est_h=4; safe_h=8 -->

> **다음 PayPal 새 채팅 명령:** `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]` → [CHAT_BOOTSTRAP](../../../CHAT_BOOTSTRAP.md) → 이 파일 → [일일 원장](../../../data/paypal_daily_progress.json). 바로 코드/테스트. 별도 worker 채팅 없음.

## ACTIVE READY — PPL-D07 (7일차, 2026-10-31 배정분 선행 가능)
- **상태:** NOT_STARTED. **0% / 100%**. **남은 예상 4시간 / 안전 확보 8시간**. 실제 경과시간 NOT_MEASURED.
- **다음 구현:** `src/sqlite_ledger.mjs` 구조·기존 SQLite WAL/transaction/owner 가드와 호환되게 **계약·마일스톤·납품/검수 관련 SQL 스키마와 테스트**를 만든다.
- **완료 기준 (합계 100점, 원장 그대로):**
  1. CONTRACT_MILESTONE_SCHEMA **25점** — 계약·마일스톤 독립 PK/FK·금액·단계·순서·제약.
  2. PAYMENT_VS_DELIVERY_STATE **25점** — 결제/캡처 상태와 납품/검수 승인 상태를 혼동하지 않고 별도 전이.
  3. OWNER_AND_VERSION_GUARDS **20점** — 서버 인증된 소유자/merchant/quote version·원자 CAS 검사.
  4. APPEND_ONLY_HISTORY_TESTS **20점** — 감사/상태 변경 기록 보존, 중복/재시작/잘못된 전이 테스트.
  5. CI_DOCS_HANDOFF **10점** — `npm test`, 원격 GitHub CI, 진행률/잔여/차단 보고 및 현재 파일 재작성.
- **실행 순서:** 최신 HEAD/관련 소스·`tests/*`·[개발 원칙](../../../AGENTS.md)을 읽고 구현. 최소 기능 구현 후 실제 자동테스트·commit·CI 확인. D07을 완료한 경우 원장에서 다음 READY/차단 과제를 확인하고 앞당겨 진행 가능.
- **금지:** 실 PayPal 결제 검증 없이 유료/Live 요청, 운영 인증·은행·카드·계정 통제 변경, 테스트되지 않은 mock을 real로 공시.

## 기존 일별 완료/차단 현황
| 일차 | 완료율 | 남은 예상 | 안전 여유 | 정확한 증거 수준 |
|---|---:|---:|---:|---|
| D01 견적 API | 100% | 0h | 0h | 오프라인 |
| D02 SQLite 결제 원장 | 100% | 0h | 0h | 오프라인 |
| D03 실제 Sandbox·무료 AI | **0%** | **3h** | **8h** | 접근 차단, 외부 대기 UNKNOWN |
| D04 AI 견적/승인 UI | **80%** | **2h** | **4h** | OFFLINE_MOCK, real AI 차단 |
| D05 Sandbox 전송/재조회 모의 검증 | 100% | 0h | 0h | 오프라인 |
| D06 로컬 실제 Chromium 브라우저 | 100% | 0h | 0h | 로컬 E2E, Production 아님 |
| **D07 계약·마일스톤 스키마** | **0%** | **4h** | **8h** | NEXT READY |

## 최근 검증과 미검증
- 최종 기능 근거: `8cb714a21196336d6f28e3487f76dc04f9f38708`, [Actions 40066974668](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40066974668) **103 Node PASS + Chromium PASS** (local synthetic demo).
- Payment API POST 503, PayPal Sandbox 실접근/실 AI/운영 배포/심사 접수 **NOT_TESTED**. D03은 재개 가능한 사전 점검이 있으나 외부 인증은 현재 차단으로 정확히 보존.
- 브랜치 `lead/paypal`만 업데이트하고, `main` 릴리스 및 `feature/*` 원본은 그대로 보존.
- 이 파일은 **실행 포인터**다. 과거 내역은 [아카이브](../../archive/LEAD_ACTIVE_WORK_HISTORY_20261024.md)와 Git history를 보라. 이전의 날짜순/worker router 'NEXT PPL-002'는 역사적 서술이며 현 지시가 아니다.

## 매 작업 종료 강제 인수인계
[RESUME_SYNC_CONTRACT](../../RESUME_SYNC_CONTRACT.md)에 따라 `CHAT_BOOTSTRAP.md`/이 파일/`STATUS.md`/`HANDOFF.md`/`TO_HACKATHON_LEAD.md`의 `resume:` 포인터·현재 작업, 원장, 실제 CI 상태를 같은 커밋에서 동기화. 새 채팅이 한 문장으로 시작할 수 있는 상태까지 직접 검수.
