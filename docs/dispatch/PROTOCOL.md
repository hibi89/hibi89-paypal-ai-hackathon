> **ARCHIVED — NO LONGER EXECUTABLE (2026-10-24 KST):** Participant combined PayPal lead and developer into the SAME chat. Former PPL-001 worker task and any `IN_PROGRESS`/READY markers below are historical; this file DOES NOT authorize a separate worker or a new feature-branch implementation. Go to `docs/roles/lead/LEAD_ACTIVE_WORK.md` and `LEAD_FULLSTACK_PROTOCOL.md` on `lead/paypal`. Do not duplicate prior work.

# PayPal 총괄↔단일 순환 작업자 프로토콜 v1.0

기준일: **2026-10-24 KST**. 사용자 승인: **PayPal 담당자 채팅방 1개**에서 현재 할당된 작업을 수행하며, 총괄이 GitHub의 **단일 활성 지시서**를 갱신하면 같은 작업자 채팅이 다음 브랜치로 이동한다. 과거 '세 담당자 각각 별도 채팅' 운영 규정은 이 프로토콜로 대체한다.

## 0. 단일 진실 공급원

- **총괄만 쓰는 파일**: `lead/paypal:docs/dispatch/ACTIVE_TASK.md` — 현재 활성 작업 **정확히 1개**. 명시적 `task_id`·`status`·`target_branch`·완료 조건·제약·next_condition 기록.
- **공유 예정 큐**: `lead/paypal:docs/dispatch/QUEUE.md` — 미래 후보일 뿐. **작업자는 큐를 읽어도 바로 수행 금지**.
- **작업자 입구**: `lead/paypal:WORKER_START_HERE.md`와 `docs/dispatch/WORKER_CHAT_PROMPT.md`. 작업자 채팅은 매번 `ACTIVE_TASK`의 최신 내용을 다시 조회.
- **작업자만 쓰는 보고**: 현재 feature 브랜치의 `STATUS.md`, `HANDOFF.md`, `docs/roles/<role>/TO_PAYPAL_LEAD.md`.
- **총괄의 검수·상위 보고**: `lead/paypal:docs/roles/lead/MESSAGE_REVIEW.md`, `STATUS.md`, `HANDOFF.md`, `TO_HACKATHON_LEAD.md`.
- **데이터 혼동 금지**: `main`은 검수 병합용. 총괄 `lead/paypal`의 문서만 읽고 작업자가 그 브랜치에서 구현하거나 결과를 쓰지 않는다. 전체 해커톤 상황실이나 다른 대회 브랜치는 수정하지 않는다.

## 1. 상태 머신

| 상태 | 누가 설정 | 담당자 행동 | 전환 조건 |
|---|---|---|---|
| `READY` | 총괄 | 작업 ID/브랜치/범위 확인 후 **한 채팅에서 작업 시작 가능** | 자기 브랜치에 STARTED 보고 |
| `IN_PROGRESS` | 총괄(보고 기반) | 동일 작업 계속. `ㄱ`도 동일 작업을 이어가는 것 | 작업자가 결과/증빙 게시 |
| `BLOCKED` | 총괄(실패 보고 기반) | 다른 브랜치 자동 이동 금지. 블로커와 무료 대안 2개 보고 | 사용자/총괄 결정 |
| `IN_REVIEW` | 총괄 | 새 개발 중지. 검수 질문만 답변 | 총괄 PASS 또는 수정 요청 |
| `DONE` | 총괄 | 추가 개발 중지. 다음 READY 공시만 대기 | 총괄이 새 작업 발행 |
| `HOLD` | 총괄 | 어떤 새로운 코드·API 작업도 시작하지 않음 | 총괄이 READY 재발행 |

작업자는 `ACTIVE_TASK.md`를 직접 바꾸거나 `IN_PROGRESS`/완료 상태를 자체 선언할 수 없다. **같은 문서에 `READY`가 남아 있어도 feature 보고가 이미 STARTED일 수 있으니 같은 작업 ID를 이어서 수행**한다. 총괄이 수시로 이를 맞춰 기록한다.

## 2. 정확한 라우팅·권한 규칙

1. 한 번에 **단일 active task ID / 하나의 target_branch / 하나의 담당자 채팅**만.
2. `target_branch`는 반드시 `feature/quote-payment`, `feature/delivery`, `feature/subscriptions` 중 하나. 초기에 `quote-payment`; 이후 총괄이 순차 이동 지시.
3. **계획 날짜만으로 자동 전환 금지.** 이전 작업자 보고·총괄 테스트/보안 검수·브랜치 결과와 공통 코드 인수 확인 후에만 총괄이 ACTIVE_TASK의 task_id+target_branch를 교체한다.
4. 기능 간 공용 코드가 필요한 경우 대상 브랜치에서 먼저 구현/검증 → 총괄에게 merge/PR 요청. **총괄이 PR 통합을 승인/수행한 뒤** 다음 브랜치가 새 공통 코드에 접근할 수 있게 한다. 작업자는 다음 브랜치로 임의 cherry-pick/force push 금지.
5. 다음 단계가 일정/기술적으로 막힌 경우 총괄은 `BLOCKED` 또는 대체 실행 방침을 문서로 발행하고 사용자에게 범위/비용 변경 승인을 요청한다.
6. 결제/API 권한 계정이 없다면 코드 검증(오프라인)과 실제 Sandbox 검증을 분리 보고. 키 노출·Live 결제·유료 API로 우회 금지.

## 3. 작업자 작업 시작·종료 보고 필드

자기 feature `TO_PAYPAL_LEAD.md`의 마지막에 다음을 명시한다. 민감정보는 입력하지 않는다.

```md
## TASK PPL-001 — [STARTED | READY_FOR_REVIEW | BLOCKED]
- 조회한 lead 지시서: lead/paypal/docs/dispatch/ACTIVE_TASK.md
- 실제 작업 브랜치 / 작업 시작·종료 확인시각(KST):
- 시작 HEAD / 종료 HEAD:
- 수정 코드/파일:
- 테스트 명령과 결과: PASS / FAIL / NOT_TESTED (실제 로그)
- PayPal Sandbox/AI API: REAL_SANDBOX / OFFLINE_MOCK / NOT_TESTED
- 추가 지출: 0원 / 미검증
- 기존 기능/데이터 보존 여부:
- 남은 오류/차단 원인 / 필요한 사용자 입력:
- 총괄 검수 요청: YES/NO
```

## 4. 총괄 검수·다음 지시 발행 규칙

1. 작업자의 `TO_PAYPAL_LEAD.md` 최신 HEAD/원문·코드·실제 테스트 근거 확인 → `MESSAGE_REVIEW.md` 기록.
2. 완료 조건별 `PASS/FAIL/NOT_TESTED`와 **Sandbox 실증 여부** 판정. 실 API/브라우저 증명 없는 오프라인 구현은 실동작 PASS가 아니라 일부 진행.
3. 완료면 `STATUS/HANDOFF` 최신화 및 필요 공통 코드 PR/통합 진행. 미완료면 같은 task_id를 유지한 채 재작업 요청.
4. 이전 작업을 수락하고 현재 활성 슬롯이 완전히 종료된 뒤 **새 ACTIVE_TASK 하나만** 새 ID/branch로 발행. `QUEUE.md` 진행 상태와 `TO_HACKATHON_LEAD.md`를 갱신.
5. 매번 GitHub 원격 HEAD와 실제 문서 내용 확인. **파일이 있다고 자동 실행/알림되는 것은 아니다**. 사용자가 담당자 채팅에서 `ㄱ`을 입력해야 작업이 수행된다.

## 5. 보안·예산·충돌 처리

- 0원 추가 현금 지출 하드캡. 실결제 금지, Sandbox만, 유료 계정/카드 등록/도메인 구매 금지.
- `lead/paypal` 운영 문서와 feature 소스·메시지 기록은 각 브랜치에서만 수정. 역할 권한을 장비 자동화로 강제하는 별도 GitHub Branch Protection은 **아직 설정하지 않음**(문서 기반 제어).
- 사용자가 한 번에 두 개의 작업자 채팅을 열거나 오래된 지시를 재사용하면 **현재 원격 ACTIVE_TASK**가 우선한다. 오래된 task ID는 중단.
- 사용자 메시지가 명시적으로 새 방향을 요구해도 작업자 단독으로 범위·비용 변경하지 않음; 총괄 판단/승인 후 지시서 변경.
