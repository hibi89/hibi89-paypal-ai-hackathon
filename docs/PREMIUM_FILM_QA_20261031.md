# Proofline — premium film production and PQG-100 gate (2026-10-31 KST)

**State: DRAFT / NOT A FINAL DEMO VIDEO.** This is an offline cinematic editing and reviewer plan, not proof of actual Gemini/PayPal calls. No public upload, submission, source release, external TTS, PayPal CREATE/CAPTURE, or new provider API requests are approved here.

## Production decisions

- Approach A (chosen now): preserve the tested real DOM, accessible controls, synthetic backend and provenance. Layer a cohesive dark product design; capture browser-driven pointer moves, typed text and UI responses in Playwright. It is cheaper, reversible and reduces regression risk.
- Approach B (deferred): rebuild React/component hierarchy and frontend UX. More flexibility but higher functionality, schedule and security regression risk; requires separate scope approval.
- Design source: `web/offline_demo.html`. Original state/control logic, security and original `main` are untouched.
- Optional recording source: `scripts/record_judge_demo.py --premium` / `npm run video:record:premium:owner`. Recording remains private, **silent** WebM. No artificial post-edit camera shake or fabricated payment action.
- Existing `npm run video:record:owner`, `owner:final:local` and default CI capture behavior remain unchanged.

## English narration script (editorial draft; NOT synchronized or voiced)

0. Opening / first opportunity:
> Talent is everywhere. Access to opportunity isn't. What if an AI-powered marketplace helped people find their first project—and kept every important decision in human hands?

1. Discovery / two service categories:
> Meet Proofline. From AI engineering and automation to design, writing and translation, buyers explore two markets through one workflow. These profiles and transactions are fictional examples.

2. Matching:
> Describe the work. The marketplace identifies matching skills and makes limitations visible, so a buyer can compare specialists instead of trusting a black box.

3. Human quote approval:
> A proposal becomes a versioned quote. The buyer chooses the amount and explicitly approves the terms. Changing the quote invalidates the prior approval.

4. Technical integration evidence:
> The local demo tests Gemini and PayPal integration logic through injected fake responses. No Gemini request, PayPal order, capture or payment is made here.

5. Historical attribution:
> Separately, the project owner reported an October twenty-eighth Gemini classification and a PayPal Sandbox approval, capture and verification. That is historical owner-reported evidence—not a transaction reproduced in this film.

6. Independent review:
> A synthetic delivery moves through submission, review, rejection, revision and acceptance. Each decision leaves a local audit trail, while payment status remains separate.

7. Closing:
> Proofline is an opportunity-first marketplace concept. Technology supports the process. People remain responsible for approval, work and trust.

**Editorial requirement:** Narration must be actual speech, not music-only. Background music must remain below narration. No fabricated provider calls or pseudo-live claims. Narration TTS/provider choices require separate cost/privacy review; do not upload a private receipt or secret to a voice service.

## PQG-100 evaluation — not yet graded

| Dimension | Maximum |
| --- | ---: |
| Frontend visual hierarchy, typography, contrast, accessibility | 25 |
| Natural actual pointer, typing, click and UI response | 20 |
| Stable camera/framing, restrained transitions | 15 |
| English spoken narration, mix, caption timing | 15 |
| First 10-second hook and clear value proposition | 15 |
| Truthful source labels: synthetic vs owner history | 10 |
| **Total** | **100** |

**Pass target >=90/100 only after independently watching the rendered video.** Automatic hard fails: noticeable unmotivated camera shaking; illegible critical text; click/UI response mismatch; absent narration; black screens; leaked owner-private details; misleading fake-vs-real transaction wording; or video duration >=180 seconds.

## Verification plan and acceptance

1. `npm test`, Windows offline suite, Chromium AI Work/Global Services/approval/protocol and default recording must stay green at the **exact commit**.
2. Optional `--premium --pace-ms 250` CI capture checks that guided cursor mode genuinely runs, preserves zero provider/payment calls and writes a private synthetic WebM.
3. Owner machine, clean isolated clone: `npm run video:record:premium:owner`. Review the generated WebM before continuing. This command installs only pinned local free tooling if needed; it does **not** generate narration.
4. Improve storyboard, add voiced English narration after editorial approval and check synchronized full encoded duration, color/contrast and six scoring categories. A successful render or CI test is not sufficient for PQG pass.
5. Explicit separate owner authorizations for PR merging, public YouTube and Devpost. Never reset original videos or private Sandbox evidence.

**Current release status:** implementation in separate Draft PR #29 targeting unmerged Draft PR #28 release preview. No released or owner-approved final film.
