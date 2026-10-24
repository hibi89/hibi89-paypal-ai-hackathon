# ACTIVE TASK — PayPal 단일 담당자 실행 지시 (현재 단 한 건)

> **총괄 전용 수정** · 2026-10-24 KST 발행 · **작업자 채팅에서 매번 원격 최신 본문 재조회** · 계획 발행과 실제 작업 시작/완료는 다름.

| Key | Value |
|---|---|
| `task_id` | **PPL-001** |
| `status` | **IN_PROGRESS** |
| `owner` | PayPal 총괄 `lead/paypal` |
| `worker_chat_count` | **1개** (기능 전환 때도 같은 채팅 재사용) |
| `target_repo` | **`hibi89/hibi89-paypal-ai-hackathon`** |
| `target_branch` | **`feature/quote-payment`** |
| `role` | 견적·PayPal Sandbox 결제 (첫 담당 역할) |
| `other_feature_branches` | `feature/delivery`, `feature/subscriptions` — **대기, 수정 금지** |
| `started` | **2026-10-24 12:58 KST — 원격 STARTED 보고 검증** (`feature/quote-payment` HEAD `621612bd906d191c3f68cf708b9940315cb18894`) |
| `target_window` | 2026-10-24~10-26 KST (내부 목표) |
| `next_candidate` | PPL-002 — 총괄 검수 후에만 별도 발행 |

## 총괄 지시 — PPL-001: PayPal 무료 Sandbox 실행 가능성 + 결제 모듈 설계안 검증

### 작업 목적
후속 코딩을 시작하기 전에 **대한민국 사용자 + PayPal Sandbox + 비용 0원** 조건에서 실제 가능한 결제 경로를 확인하고, 10/27 목표인 Orders v2 실증을 위한 기술 계약을 확정 가능한 형태로 제출한다. 저장소에는 현재 기능 코드가 없으므로, **문서 수집이 아닌 구체적인 실행·재현 가능한 기술 검증/초기 설계 산출물**이 1차 목표다.

### 반드시 수행
1. `lead/paypal`의 [WORKER_START_HERE](../../WORKER_START_HERE.md), [PROTOCOL](PROTOCOL.md), [실행계획 v4](../PAYPAL_EXECUTION_PLAN_20261024.md), [0원 정책](../ZERO_COST_STACK_AND_GUARDRAILS.md) 최신 내용을 원격 조회. 지금 파일에 쓰인 `task_id`와 `target_branch`를 재확인.
2. `feature/quote-payment` HEAD·루트 `HANDOFF.md`, `STATUS.md`, `AGENTS.md`, `REQUIREMENTS.md`, 역할별 `docs/roles/quote-payment/{OPERATIONS,STATUS,HANDOFF,TO_PAYPAL_LEAD}.md`를 확인하고 실제 파일 트리 확인. 오래된 feature 역할 문서와 새 사용자 결정이 충돌하면 **현재 `lead/paypal`의 명시된 활성 지시**를 운영 우선 기준으로 적용.
3. 공식 PayPal Developer 문서 기준 Sandbox OAuth2→Orders v2 `create`→`approve`→`capture`→`GET order/capture state` 절차와 필요한 Sandbox business/personal 테스트 계정·Client ID/Secret·redirect·webhook 권한·한국 계정/국가 제약을 표로 정리. **문서상 가능/실제 계정에서 검증됨을 분리**한다.
4. **서로 다른 구현안 2개 비교**: (A) React+Cloudflare Workers Free+D1 Free+가용 무료 AI API+PayPal Sandbox, (B) 로컬 재현 가능한 서버/DB+정적 프론트+Sandbox (무료). 호출 한도·CPU·키 보안·인증·중복 캡처·유지보수·심사 재현성·총 비용을 검토해 **권고 1안과 보류 위험** 작성.
5. 공통 데이터 계약의 첫 버전을 **Quote / Payment / Approval / Idempotency / Error**로 정의. 결제 상태는 PayPal 응답이 진실 값. AI 제안 가격은 승인 전 결제 생성 불가, 중복 클릭/새로고침/네트워크 재시도/승인 취소 동작 명시.
6. 계정에 **이미 안전하게 접근 가능한 Sandbox 인증 정보가 있고 사용자가 승인한 테스트 상황**이면 최소 Sandbox 실 요청을 수행해 HTTP 코드, 리다이렉트 경로 및 캡처 상태를 **비밀 제외**하고 기록. 접근권한 없으면 **실 API 미검증(BLOCKED)**으로 남기며 API 키를 Public GitHub·채팅에 올리라고 요구하지 않는다. 무료 AI 모델도 별도 인증/접근 여부 기록. 코드 구현이 가능하면 **안전한 비밀 미포함 오프라인 단위 테스트**까지 진행해도 되지만 본 Gate 1 실제 API 성공으로 혼동 금지.
7. `feature/quote-payment`에 `docs/technical/PPL_001_FEASIBILITY_AND_ARCHITECTURE.md`를 작성·커밋. 포함: 실행명령·실행결과/미실행 사유, 공식 참조, 설계 A/B, 상태 계약 v0, 비용, 10/27 Gate1 바로 수행하기 위한 다음 최소 명령과 검증 절차.
8. **반드시 결과 보고**: `feature/quote-payment:docs/roles/quote-payment/TO_PAYPAL_LEAD.md`에 `PPL-001 — READY_FOR_REVIEW` 또는 `BLOCKED`, 검사 명령/결과·실 Sandbox 여부·테스트 여부·원격 HEAD·다음 장애 기록. 루트·역할 `STATUS.md`·`HANDOFF.md` 적절히 최신화.

### 명시적 금지
- `main`, `lead/paypal`, 다른 feature 브랜치 수정 금지. GitHub 파일 생성/수정 시 **`branch=feature/quote-payment` 명시**.
- PayPal **Live 실결제**, 유료 API·호스팅·도메인·신용카드 등록, 실제 개인정보 노출 금지. 추가 지출 상한 ₩0.
- 진단 없이 인가 실패 반복, 자격증명 공개 저장, 실 API 성공 주장(오프라인/모의 테스트만 있을 때), 다음 예정 큐의 임의 선행 실행 금지.
- 총괄의 검수·승인 없이 **PPL-002나 delivery/subscriptions로 이동 금지**.

### 수락·전환 조건 (총괄이 검수)
- [ ] `docs/technical/PPL_001_FEASIBILITY_AND_ARCHITECTURE.md`가 **`feature/quote-payment` 원격**에 있음.
- [ ] 두 구현안과 비용 0원·보안·호환성/한국 접근 제약을 근거로 비교.
- [ ] PayPal Orders 실제 Sandbox 실행이 성공/실패/미접근 중 정확하게 보고되고 재현 절차 있음.
- [ ] 공통 Quote/Payment/Approval 데이터·오류·멱등 계약 v0 및 다음 검증 단계 구체화.
- [ ] `TO_PAYPAL_LEAD.md`, STATUS/HANDOFF 최신, 테스트 PASS/FAIL/NOT_TESTED·원격 SHA 검증.
- [ ] 총괄이 인수 승인하고 필요 공통 코드를 PR 통합한 후에만 다음 작업 지시 발행.

**현재 상태 = IN_PROGRESS.** 작업자 `STARTED` 커밋 `621612bd906d191c3f68cf708b9940315cb18894` 확인, 개발 산출물/테스트/실 API 성공 보고는 아직 없음. **동일 PPL-001 계속 수행, 총괄 검수 전 PPL-002 발행 금지.**

## 2026-10-24 KST — 실제 작업 착수 확인 후 총괄 상태 변경
- 작업자 원격 변경: `feature/quote-payment` `621612bd906d191c3f68cf708b9940315cb18894`, 메시지함 `PPL-001 — STARTED (12:58 KST)` 확인.
- 변경 내용은 `TO_PAYPAL_LEAD.md` 착수 기록 1파일뿐. 기능 소스/설계 문서/실 API 로그/자동 테스트 결과 없음. 작업자 검수 요청 `NO`.
- 총괄 공식 상태를 `READY` → `IN_PROGRESS`로 동기화. target/task ID/범위·비용 0원/승계 금지 조건 불변.
