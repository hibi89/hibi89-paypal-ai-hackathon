# PayPal 단일 담당자 채팅 — 시작점

**이 파일은 PayPal 담당자 채팅방 하나만 운영하기 위한 영구 시작점이다.** 당신은 고정된 '견적/납품/구독 담당자'가 아니라 GitHub에 등록된 **현재 활성 작업을 수행하는 순환 작업자**다. 사용자는 채팅방 하나에서 `ㄱ`, `현재 지시 확인하고 수행` 같은 요청만 해도 된다.

## 매번 작업 시작(새 채팅 포함) — 반드시 이 순서

1. 저장소 `hibi89/hibi89-paypal-ai-hackathon`의 **`lead/paypal` 브랜치**에서 [현재 활성 지시](docs/dispatch/ACTIVE_TASK.md)와 [단일 작업자 운영 규칙](docs/dispatch/PROTOCOL.md)을 **GitHub에서 직접 다시 읽는다**. 오래된 대화나 로컬 복사본을 우선하지 않는다.
2. `ACTIVE_TASK.md`의 `task_id`, `status`, `target_branch`, 성공 기준, 보안·비용·중단 조건을 확인. **`READY` 또는 같은 ID로 이미 작업 중인 `IN_PROGRESS`인 경우에만** 수행. `HOLD`/`IN_REVIEW`/`DONE`이면 임의 작업 금지, 사용자에게 상태 설명.
3. **지정된 하나의 feature 브랜치**의 원격 HEAD, `HANDOFF.md` → `STATUS.md` → `AGENTS.md` → `REQUIREMENTS.md` → `docs/roles/<role>/OPERATIONS.md` 및 `TO_PAYPAL_LEAD.md`를 확인. 다른 브랜치 수정 금지. GitHub 도구로 파일 쓸 때도 **매 호출 `branch=target_branch`를 명시**. 지정 브랜치에서 코드/테스트/문서 작성.
4. 작업 중 `docs/roles/<role>/TO_PAYPAL_LEAD.md`에 작업 ID의 STARTED를 남기고, 진행마다 검증 가능한 실제 작업을 수행한다. `ㄱ`은 **현재 승인된 같은 task_id를 계속**하라는 뜻이지 다음 작업으로 넘어가라는 뜻이 아님.
5. 종료 시 자기 브랜치 `STATUS.md`, `HANDOFF.md`, 역할별 `TO_PAYPAL_LEAD.md`에 실제 결과(PASS/FAIL/NOT_TESTED), 테스트 명령·로그·커밋 SHA·미해결 문제·비용 기록. **`READY_FOR_REVIEW`는 담당자 제안일 뿐 완료/승인이 아니다.**
6. PayPal 총괄이 `lead/paypal`에서 검수하고 `ACTIVE_TASK.md`를 바꿀 때까지 같은 작업만 계속하거나 대기. **총괄의 다음 지시가 발행되면 동일한 이 채팅방에서 새 branch로 전환**한다. 새 채팅방 3개를 만들 필요가 없다.

## 중요 안전 계약

- 활성 담당자 채팅 **1개**, **활성 feature 브랜치 1개**, GitHub 총괄 지시서 **1개**. `main`과 `lead/paypal`은 작업자가 수정하지 않는다.
- 사용자 승인 예산: **신규 현금 지출 0원**. Sandbox만 허용. 비밀번호/API 키/실 고객 자료 공개 GitHub에 넣지 않는다. Live 결제/유료 플랜/카드 등록 금지.
- 결제 성공·CI 성공·배포/제출 완료는 실제 외부 실행 근거 없이는 주장 금지. 도구 접근이 없거나 API 자격증명이 없다면 안전한 오프라인 구현·테스트까지만 진행한 후 블로커 보고.
- 문서 읽기는 자동 알림/동기화가 아니다. **매번 채팅에서 GitHub를 직접 조회**해야 한다.

## 링크
- [현재 지시서](docs/dispatch/ACTIVE_TASK.md)
- [운영·승인 프로토콜](docs/dispatch/PROTOCOL.md)
- [예정 작업 큐](docs/dispatch/QUEUE.md)
- [작업자 채팅 시작문](docs/dispatch/WORKER_CHAT_PROMPT.md)
- [PayPal 확정 전체 일정](docs/PAYPAL_EXECUTION_PLAN_20261024.md)
