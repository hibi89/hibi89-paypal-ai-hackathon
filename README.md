# Proofline — PayPal + AI Hackathon judge entry (STAGED, NOT RELEASED)

**Current consolidated QA candidate (public source branch, NOT released):**
[`work/paypal-video-integrity-hardening-20261030`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/work/paypal-video-integrity-hardening-20261030).
This branch includes both service categories, the safe private video/manifest checks, and
one-command owner-local final verification in
[unmerged draft integration PR #26](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/26).
Older overlapping [QA PR #23](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/23)
and [integration PR #24](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/24)
overlap with PR #26; review only one approved integration route.
This [draft LICENSE/default-entry PR #16](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/16)
only updates the release landing, **not** the application source on `main`.

**Reproduce the offline synthetic browser (Node.js >=22.5; no credentials):**

```bash
git clone https://github.com/hibi89/hibi89-paypal-ai-hackathon.git
cd hibi89-paypal-ai-hackathon
git switch work/paypal-video-integrity-hardening-20261030
npm run preflight:reviewer
npm run judge:reproduce
npm run demo
```

Open the printed `http://127.0.0.1:PORT` locally. AI Work and Global Services
use fictional sellers, approved local SQLite quotes, contract and reviewer
screens, and fake PayPal-domain planning. **No Gemini or PayPal API is contacted
by this demo.** The owner's October 28 Gemini + Sandbox one-shot remains
**owner-reported historical private evidence**, not independently replayed
by GitHub CI, a production payment, or a live judge-facing integration.

[Reviewer reproduction guide](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/work/paypal-video-integrity-hardening-20261030/docs/JUDGE_REPRODUCTION_EN.md) ·
[Integration evidence boundaries](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/work/paypal-video-integrity-hardening-20261030/docs/JUDGE_PAYPAL_AI_INTEGRATION_TRACE_EN.md) ·
[Owner release checklist](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/work/paypal-video-integrity-hardening-20261030/docs/FINAL_OWNER_SUBMISSION_CHECKLIST_20261030.md)

**CI boundaries (2026-10-30 KST):** The last fully green 3-job run
[#41002555640](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41002555640)
tested an *older* SHA `5c07333` (613 Node tests; browser/Windows/video).
The latest consolidated candidate source `92afae7` has separate
[full CI #41018496987](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41018496987)
**QUEUED at last check, NOT PASS**. Independent P20 helper behavior tests
do not replace Node, SQLite, Chromium, Windows or full video CI.
Before any owner-authorized merge/release, revise this landing's source
URL to the final *validated* release branch/commit.

**Submission status:** No owner-authorized public video URL, default branch
source release or Devpost receipt has been verified. A CI-private synthetic
WebM is not the owner's released YouTube submission. No PayPal partnership,
fee-sharing, real seller population, production payment or user traction is
claimed.

---

> **[현재 운영 안내 — 2026-10-24] 새 ChatGPT 채팅방에는 다음 한 문장만 입력:** `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]`.  
> **PayPal 총괄 겸 개발자는** [`lead/paypal` 최신 시작 문서](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/CHAT_BOOTSTRAP.md) → [현재 작업 포인터](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/docs/roles/lead/LEAD_ACTIVE_WORK.md) → [검증·진행률 원장](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/data/paypal_daily_progress.json)을 보고 해당 NEXT 작업을 직접 구현·검수·GitHub 기록한다.  
> **`main`은 과거 릴리스/문서 스냅샷이며, 아래 오래된 4채팅/기능별 worker 구조 및 작업 미착수 설명은 역사적 기록이다.** 작업용 지시는 반드시 `lead/paypal`을 우선한다. 최근 확인 기준 NEXT D07 0%/100%·잔여 예상 4h/안전 8h, D03 Sandbox/AI 접근 차단·D04 실제 AI 미검증. 배경 자동 개발/커밋은 아니다.

> **2026-10-24 새 채팅 한 줄 재개:** `[해커톤총괄 깃헙 레포지토리 확인하고 작업하셈]`  
> `PayPal AI Hackathon`의 현행 총괄 겸 직접 개발자 업무는 [lead/paypal 브랜치의 CHAT_BOOTSTRAP.md](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/CHAT_BOOTSTRAP.md)에서 복원한다. **현재 작업은 `main`이 아닌 `lead/paypal`의 `docs/roles/lead/LEAD_ACTIVE_WORK.md`가 기준**이다. 통합 상황실: [CHAT_BOOTSTRAP.md](https://github.com/hibi89/hackathon-command-center-2026/blob/main/CHAT_BOOTSTRAP.md). 별도 작업자 채팅/옛 디스패처는 이력만 보존.

# PayPal AI Hackathon
> **3개 대회 전체 일정·충돌·제출 마감:** [docs/COMPETITION_SCHEDULE.md](docs/COMPETITION_SCHEDULE.md) (**2026-10-24 KST 공시**). 이 브랜치에서 작업을 시작할 때 마감과 내부 조기 제출 목표를 확인하며 공식 변경 시 대회 총괄에게 보고한다.


> 참가자는 **1명**, 개발 역할은 독립된 AI 채팅방 4개(대회 총괄 1 + 기능 담당 3). **2026-10-24 KST 초기 구조**. 이 저장소는 사용자가 생성한 **Public** 저장소다.

- 대회 목표(잠정): **AI 프리랜서 계약·결제 자동화 Agent (잠정)**. 주제와 기능 범위는 사용자 승인 전 확정하지 않는다.
- 제출 마감: **2026-11-13 05:00 KST**.
- 전체 일정·상위 보고: [2026 통합 해커톤 상황실](https://github.com/hibi89/hackathon-command-center-2026/blob/main/START_HERE.md).
- 초기 단계: **브랜치 5개·운영 문서 구축 및 원격 존재 검증 완료**, 코드·실 API·제품·제출물 구현은 미착수.

## 역할 브랜치
- `main`: 검증된 코드·최종 통합 기준.
- `lead/paypal`: 대회 총괄, 설계/검수/기획/제출/상위 보고.
- `feature/quote-payment`: 기능 개발 담당 1.
- `feature/delivery`: 기능 개발 담당 2.
- `feature/subscriptions`: 기능 개발 담당 3.

## 역할별 새 채팅 진입점
**[docs/ROLE_COORDINATION.md](docs/ROLE_COORDINATION.md)**에서 총괄 및 기능 담당 3명의 전담 브랜치·인수인계·메시지함을 바로 연다. 이 안내서는 `main`에만 존재하며 역할별 최신 상태는 각 기능 브랜치에 있다.

## 읽을 문서
새 AI 담당자는 자기 **브랜치**에서 `HANDOFF.md` → `STATUS.md` → `AGENTS.md` → `REQUIREMENTS.md` → 역할별 `docs/roles/<role>/OPERATIONS.md`를 읽는다. 역할별 문서가 다른 브랜치에도 있다고 가정하지 않는다.

- [공통 규칙](AGENTS.md)
- [요구 사항](REQUIREMENTS.md)
- [진행 현황](STATUS.md)
- [브랜치 운영](docs/BRANCH_WORKFLOW.md)

**중요:** 어떤 비밀값·고객 개인정보도 공개 저장소에 저장하지 않는다. 개발·범위·권한·비용 확장은 사전 승인 대상이다.
