# PayPal 해커톤 — 한 문장 재개 프로토콜 (CURRENT)

<!-- resume: day_id=PPL-D11; percent=0; est_h=5; safe_h=10 -->

> **사용자 고정 호출 한 문장:** `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]` 또는 `페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈`
>
> 이 문장은 **이 PayPal 대회 총괄이 직접 개발자 역할로 즉시 다음 작업을 실행하라**는 뜻이다. 채팅을 추가로 나누지 않는다. 반복 질문·프롬프트 작성·계획만 보고하고 종료하지 않는다. GitHub 연결과 필요한 권한이 있으면 바로 읽고 실제 코드·테스트 작업을 시작한다.

## 정확한 저장소 및 시작 위치
- GitHub: [hibi89/hibi89-paypal-ai-hackathon](https://github.com/hibi89/hibi89-paypal-ai-hackathon)
- **반드시 원격 `lead/paypal` HEAD** 읽기. `main`은 과거 릴리스 스냅샷이어서 최신 구현이 아니다. 과거 `feature/*` 브랜치·`WORKER_START_HERE.md`·`docs/dispatch/*`는 실행하지 말 것.
- 이 채팅방은 **PayPal 총괄 + 개발 + 테스트 + 검수 + 문서화**를 하나로 담당한다. KIC/UGREEN, 통합 상황실 작업은 별도 프로젝트다.
- 이전 ChatGPT 채팅 내용·기억·문서에 적힌 고정 SHA보다 **새로 확인한 원격 코드와 진행률 원장**이 우선한다.

## 이 한 문장만 입력되었을 때 의무 실행 순서
1. GitHub로 `lead/paypal` **현재 SHA, 커밋 시각, 원격 파일**을 직접 조회. 접근 불가 시 코딩/커밋 성공을 날조하지 않고 `BLOCKED_BY_ACCESS` 기록.
2. 반드시 이 파일 → [오늘 작업 포인터](docs/roles/lead/LEAD_ACTIVE_WORK.md) → [일일 진척 JSON](data/paypal_daily_progress.json) → [HANDOFF](HANDOFF.md) → [STATUS](STATUS.md) → [AGENTS](AGENTS.md) → [확정 요구](REQUIREMENTS.md) → [날짜별 시간표](docs/DAILY_CAPACITY_PLAN_20261024.md) → [작업 순서 규정](docs/WORK_ORDER_FLEX_POLICY_20261024.md) → [작업·CI 동기화 계약](docs/RESUME_SYNC_CONTRACT.md) 순으로 최신 원격 문서를 읽고, 소스·테스트·CI를 확인한다.
3. 원장 `active_day_id` 및 체크항목을 확인하고, **검증 가능한 다음 READY 작업을 직접 개발**한다. `ㄱ`와 같은 의미. 차단된 날은 상태를 보존하고 독립 가능한 선행 작업을 택한다.
4. 시작과 종료에 GitHub 최신 HEAD 재조회. 기존 작업·다른 동시 작업자의 커밋을 보존하고, 최신 소스에 기반해 수정. 원격 브랜치 SHA가 바뀌면 현재 HEAD를 기준으로 재검토하고 조건부 ref 업데이트; 절대 force push/덮어쓰기 금지.
5. 코드·테스트·CI/브라우저 실증을 수행한다. 오프라인 mock과 실제 PayPal Sandbox·실 AI·Production·Devpost는 구분. 테스트 실패·차단을 숨기거나 일차별 진행률 100%로 부풀리지 않는다.
6. **매 작업 종료 직전 (새 채팅 이관 전 포함)**: [일별 JSON](data/paypal_daily_progress.json)의 100점 가중치 상태·완료/차단·남은 예상/안전시간·미실측·이월을 수정하고, 이 파일(활성 포인터), `docs/roles/lead/LEAD_ACTIVE_WORK.md`, `STATUS.md`, `HANDOFF.md`, `docs/roles/lead/TO_HACKATHON_LEAD.md`를 **일치시켜 GitHub에 커밋**. 완료 검증 상태를 바꿨다면 증거 있는 SHA/테스트/CI 기록. 새로운 채팅에 구술로만 인수인계 금지.
7. [인수인계 자동 무결성 테스트](tests/resume_contract.test.mjs)가 전체 문서의 `resume:` 포인터와 JSON 일차 값을 검증한다. `npm test` + 실제 GitHub Actions 성공 확인, 최신 리모트 SHA 재조회 후 사용자에게 당일 **X%/100%·남은 예상 Yh·안전 Z h·차단·다음 작업·링크**를 보고한다. GitHub CI 실패 시 고치거나 FAIL/PENDING으로 명시한다.

## 최신 확정 재개 위치 (수치는 원격 원장이 우선)
- **현재 NEXT `PPL-D11` (11/04 배정분 선행):** 검증된 Webhook ingress/원문 서명 확인·event ID SQLite dedup·역순/재전송 GET-first·거짓 금전 상태 차단의 로컬 오프라인 개발. **0%/100%, 남은 예상 5h/안전 10h**. D10 공식 API/한국 계정 제한 조사+pure 계약 CI 146 Node+Chromium PASS (run 40072332710). 실 PayPal/AI/한국 merchant 접근 미검증.
- D01/D02/D05/D06: 각 **그날 검증된 오프라인 범위 100%**. D03: **0%/100%, 실 PayPal Sandbox Business/Personal·무료 AI 접근 차단 (잔여 예상 3h/안전 8h, 외부 기다림 UNKNOWN)**. D04: **80%/100%, 실제 AI 호출 20% 차단 (잔여 예상 2h/안전 4h)**.
- **최신 D10 기능/브라우저 CI:** `lead/paypal@1c852b75b6841eeee0cd2968c234d69fedaa9e0a`, [Actions 40072332710](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40072332710) **146/146 Node PASS + 기존 실제 로컬 Chromium E2E PASS**. D10은 PayPal 공식 문서와 pure planner만, 실제 구독/서명 검증 아니다. 문서 동기화 커밋의 Actions도 별도 확인.
- PayPal HTTP 결제 POST는 **503 fail-closed**. 실제 PayPal OAuth/주문/캡처/GET, 실 AI API, 운영 로그인·호스팅, Devpost 접수증은 **NOT_TESTED/미완료**. 로컬 `OFFLINE_MOCK` + Chromium 성공을 실거래/실제품 성공으로 대체 금지.
- 비용 **₩0 추가**, PayPal Live·실고객 PII·토큰 GitHub/채팅 게시·자동 결제 금지. 사용자 승인 없이 금전·유료·공개 설정 변경 금지.
- 제품: AI 견적 → **사람의 명시적 승인** → PayPal Sandbox Orders → 계약·마일스톤·납품/검수 → 구독·실패·Webhook. 내부 2026-11-11 제출 목표 / 공식 2026-11-13 05:00 KST 마감. 실제 제출 증거가 없으면 완료 주장 금지.

## 작동 한계
- 이 규칙은 **다음 채팅이 GitHub에 접근해 작업을 시작하는 절차**다. 아무도 메시지를 보내지 않은 동안 백그라운드 개발/자동 커밋이 일어나는 것은 아니다.
- 과거 상세 변경 내역은 git history 및 `docs/technical/*`와 [기존 작업 문서 아카이브](docs/archive/LEAD_ACTIVE_WORK_HISTORY_20261024.md)에 보존한다. 현재 실행의 진실은 **이 파일 + ACTIVE_WORK + 진행률 JSON**이다.
