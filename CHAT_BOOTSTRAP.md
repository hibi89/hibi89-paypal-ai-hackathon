# PayPal AI Hackathon — 새 채팅 한 문장 자동 복원 진입점

> **고정 시작 명령(사용자 확정):** `페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈`
>
> 앞뒤 괄호·마침표 유무와 관계없이 이 문장은 **PayPal 총괄 겸 직접 개발자 역할을 바로 수행하라는 명령**이다. 역할 재지정/인수인계 프롬프트 작성 요청이 아니다. 기존 포괄 표현 `해커톤총괄 깃헙 레포지토리 확인하고 작업하셈`은 PayPal 총괄 맥락이 분명할 때만 이전 별칭으로 지원한다.

## 저장소·소유 범위

- 정확한 GitHub 저장소: **`hibi89/hibi89-paypal-ai-hackathon`** (https://github.com/hibi89/hibi89-paypal-ai-hackathon)
- **현재 개발/인수인계 브랜치: `lead/paypal`**. GitHub 기본 브랜치 `main`을 최신 작업으로 착각하지 않는다.
- **총괄 채팅 1개 = 기획·코딩·테스트·검수·통합·배포·Devpost 제출 준비 담당.** 별도 PayPal 작업자 채팅은 운영하지 않는다.
- 이전 `feature/quote-payment`, `feature/delivery`, `feature/subscriptions`는 보존된 원본/증거. 이관을 명시적으로 결정하지 않는 한 직접 편집하거나 삭제하지 않는다. 구 `WORKER_START_HERE.md`, `docs/dispatch/*`는 보존된 과거 라우터이며 실행 지시가 아니다.

## 이 한 문장만 있는 새 채팅에서 반드시 수행

1. GitHub 연결 도구로 위 정확한 저장소의 **`lead/paypal` 원격 최신 HEAD SHA·커밋 시각·파일 트리**를 먼저 직접 조회한다. GitHub 접근이 차단되면 성공을 가장하거나 예전 SHA로 수정하지 말고 `BLOCKED_BY_ACCESS`를 보고한다.
2. 원격에서 다음 순서로 읽는다: **`CHAT_BOOTSTRAP.md` → `HANDOFF.md` → `STATUS.md` → `AGENTS.md` → `REQUIREMENTS.md` → `docs/roles/lead/LEAD_ACTIVE_WORK.md` → `docs/roles/lead/LEAD_FULLSTACK_PROTOCOL.md` → `docs/roles/lead/TO_HACKATHON_LEAD.md` → 해당 원본 소스·테스트·CI/배포 증거.** 예전 채팅·과거 스냅샷과 충돌하면 확인된 원격 코드·테스트·최신 명시적 사용자 결정이 우선한다.
3. `LEAD_ACTIVE_WORK.md`에서 **다음 승인된 미완료 실작업을 확인하고 그 자리에서 직접 설계·구현·테스트·검수**한다. 다시 역할을 묻거나 작업자를 호출하거나 지시서를 발행하며 시간을 보내지 않는다. 사용자 `ㄱ`도 같은 의미다.
4. 코드 작업 전 비용/권한·원본 보존·데이터 흐름·저장과 조회 분리·API Rate·결제 서버 검증·멱등/중복·보안을 검토한다. 기존 기능·데이터 보호, 2안 비교 후 최적안. 범위/품질 축소·유료/Live·카드 등록·외부 실고객 데이터 송신·보안/권한 변경에는 사용자 승인 필요.
5. 검증 구분: `OFFLINE_TESTED` (합성), `CI_VERIFIED`, `REAL_SANDBOX`, `BROWSER_VERIFIED`, `PRODUCTION_VERIFIED`, `DEVPOST_SUBMITTED`. 단위테스트만 성공했다고 실제 Sandbox·출품 성공이라고 하지 않는다. 원격 CI·Production이 미확인이라면 정확히 `NOT_TESTED`.
6. **주요 개발/검수/장애 해결/제출 진행을 마칠 때마다, 그리고 새 채팅으로 이관하기 전** 코드·테스트·작업 항목과 함께 **`LEAD_ACTIVE_WORK.md`, 루트 `STATUS.md` 및 `HANDOFF.md`, `docs/roles/lead/TO_HACKATHON_LEAD.md`를 최신화**한다. 실제 테스트 명령·PASS/FAIL/NOT_TESTED·원격 HEAD·차단 원인·다음 우선순위를 일치시키고 GitHub 커밋 후 원격 SHA를 다시 확인한다. 중요한 일정·설계 변경은 `REQUIREMENTS.md` 등 관련 파일도 함께 수정. `CHAT_BOOTSTRAP.md`는 진입 경로나 역할 정책이 바뀐 경우에만 갱신해 중복 작업을 줄인다.
7. 작업 종료는 `저장소/브랜치/최종 SHA · 변경·테스트 근거 · 실 API/CI/배포 검증 구분 · 다음 미완료 작업·승인 필요사항`으로 간결하게 보고. 실제 배포·최종 제출되지 않았으면 명시한다.

## 검증된 마지막 스냅샷 — **새 채팅은 반드시 원격 재조회**

- 2026-10-24 KST 작성 시점의 기준 `lead/paypal@de89be4c2aa9aa2c5db3970102486decdade69eb` (이 스냅샷 이후 커밋이 생기므로 고정 SHA를 최신이라고 가정하지 않음).
- **PPL-001:** 기술설계·quote/payment 계약 가드·Node 합성 테스트 11/11 PASS. 해당 브랜치 Github Actions `40061579087`: `completed/success`. **실제 PayPal Sandbox OAuth/Orders create→approve→capture→GET은 미실행/접근 차단**, 무료 AI·브라우저·Production·Devpost 제출도 미검증/미완료.
- **다음 직접 작업:** `docs/roles/lead/LEAD_ACTIVE_WORK.md`의 **PPL-002 결제 MVP 구현**. 단, 항상 새 원격 HEAD·최신 작업 목록에 따라 바뀔 수 있다.
- 제품은 AI 견적→명시적 인간 승인→PayPal Sandbox 결제→계약/납품·마일스톤→구독 실패·예외 기능 통합 1개. 신규 지출 **0원**, PayPal Live 금지. 내부 2026-11-11 제출 목표, 공식 2026-11-13 05:00 KST.

**중요:** GitHub를 새 채팅 시작과 실제 작업 종료 시 다시 읽고/쓰는 운영 규칙이다. ChatGPT 채팅이 열려 있지 않은 동안의 무인 자동 개발·자동 동기화·자동 커밋을 뜻하지 않는다. 이 한 문장은 **PayPal**을 직접 특정하므로 통합 총괄이나 KIC/UGREEN 역할로 분기하지 않는다.

## 2026-10-24 KST — 예상시간·이월 위험 복원 필수
- 새 채팅의 `페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈` 또는 `ㄱ` 실행 시 `docs/DAILY_CAPACITY_PLAN_20261024.md`를 반드시 `LEAD_ACTIVE_WORK.md`와 함께 읽고 **오늘 날짜별 한 가지 검증 가능한 완료 목표/예상·안전 시간/어제 이월/실제 가능 여부**를 대조한다.
- 일정 추정은 PayPal 전체 82h 예상 / 164h 지연 포함 확보(10/25~11/11). **이 자체로 안전하게 달성 가능하다는 뜻이 아니며** 3개 해커톤 동시 진행 기준 고위험. 구현·API 차단·테스트·실제 경과시간 변경이 확인되면 시간표와 STATUS/HANDOFF/상위 보고도 최신화한다.

## 제출 후 Stage Two 심사 복원
- PayPal 공식 별도 본선 재개발 없음. [제출 후 심사·수상 조건부 작업표](docs/POST_SUBMISSION_JUDGING_PLAN_20261024.md)를 읽어 제출 전 실제 개발 계획(82h/164h)과 구분하라. 11/13 마감 이후부터 심사 종료(12/16 01:00 KST)까지 무료 접속·출품본 불변을 확인. 예정 점검 8h/안전 16h는 완료 보장이 아님; 실제 출품·배포 전에는 실행 단계가 아니다.

## 2026-10-24 KST — Latest PPL-002 Day1 checkpoint (re-query HEAD)
- Source new `src/quote_api.mjs`, tests `tests/quote_api.test.mjs` (23) + 11 original; CI run 40063789450 success, source SHA 9fa2084e27995ec7d77e5907c2390246f13f4150. Quote GET/explicit POST only, no outbound PayPal transport.
- **Day1 OFFLINE_ACCEPTED, NEXT Day2 DB transaction/idempotency**, NOT real Sandbox/AI/browser/deployment. Read latest `LEAD_ACTIVE_WORK.md` and day1 technical doc before work; DO NOT switch to old worker dispatcher.

## 2026-10-24 KST — 일차별 100% 진행률·남은 시간 필수 기록 규칙
- [일일 진척/잔여시간 정책](docs/DAILY_PROGRESS_REPORTING.md) / [검증 근거 JSON 원장](data/paypal_daily_progress.json). **앞으로 매 실제 작업 종료 보고에 '그날 X%/100%, 남은 예상 Y시간, 남은 안전 확보 Z시간, 실측 여부, 완료·미완료·이월' 필수**. 분모는 당일 인수 기준만; 프로젝트 전체와 다름.
- 1일차(10/25 작업을 10/24 조기 실행) **100%/100%, 잔여 예상 0시간·안전 잔여 0시간** (오프라인 quote API 부분 범위만). 2일차(10/26 계획) **0%/100%, 잔여 예상 5시간·안전 잔여 9시간** (현재 NOT_STARTED). 실제 경과시간 NOT_MEASURED.
- 퍼센트는 근거 확인된 항목의 가중치 합계로 계산한다. 예상보다 오래 걸려도 시간을 쓴 것만으로 완료% 상승하지 않는다. 새 회귀 검증 테스트를 추가했다. PayPal 실 Sandbox·AI·Production·Devpost 제출 미검증 유지.
