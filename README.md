# Proofline — PayPal + AI Hackathon reviewer entry (STAGED, NOT RELEASED)

**Current most recent QA source (public branch, still unmerged):**
[`work/paypal-final-qa-20261030`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/work/paypal-final-qa-20261030).
The latest verified source for this entry is **NOT** a public release: the QA PR
[#23](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/23)
and this default-page/LICENSE PR
[#16](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/16)
are both **DRAFT and not merged**. This page is a staged reviewer redirect,
not evidence that `main` runs the final application.

**Reproduce the offline synthetic browser (Node.js 22.5+; no credentials):**

```bash
git clone https://github.com/hibi89/hibi89-paypal-ai-hackathon.git
cd hibi89-paypal-ai-hackathon
git switch work/paypal-final-qa-20261030
npm run preflight:reviewer
npm run judge:reproduce
npm run demo
```

Open the locally printed `http://127.0.0.1:PORT` address. AI Work and
Global Services use fictional seller data. Quote approvals, local SQLite,
contract/reviewer screens and PayPal-domain quote-bound plans are runnable
offline; Gemini and PayPal APIs are **not contacted by this browser**.
Any illustrated PayPal create/approval/capture/GET sequence is FAKE unless
clearly labeled otherwise. The owner's October 28 Gemini + Sandbox exercise
is **historical owner-reported private evidence**, not independent CI
attestation or a judge-accessible live provider checkout.

[Full reviewer guide on QA branch](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/work/paypal-final-qa-20261030/docs/JUDGE_REPRODUCTION_EN.md) ·
[PayPal + AI integration provenance](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/work/paypal-final-qa-20261030/docs/JUDGE_PAYPAL_AI_INTEGRATION_TRACE_EN.md) ·
[Owner release checklist](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/work/paypal-final-qa-20261030/docs/FINAL_OWNER_SUBMISSION_CHECKLIST_20261030.md)

**Verification boundary (2026-10-30 KST):** QA functionality source
`e24bd0ec9413a0f2cb628ac73f9730fd27599cef` was committed; its
[full GitHub CI #41012416698](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/41012416698)
was **PENDING at last check**. Earlier independent V8 function-level
checks (6/6 PASS) do not replace Node, SQLite, Chromium, Windows or
full-duration video CI. The current default `main` remains older;
this MIT-license/landing PR does **not** merge QA code.

**Submission status:** No owner-approved public video URL, public platform
release or Devpost receipt has been confirmed. An English-captioned private
synthetic WebM from CI is not the owner's public YouTube demonstration.
No PayPal affiliation, fee-sharing deal, real seller population or
production payment is claimed.

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
