# Proofline — final owner submission handoff

Status: **NOT SUBMITTED — OWNER ACTIONS REQUIRED**. Prepared 2026-10-29 KST. This is a checklist, not authorization to publish, deploy, merge, replay payments or submit.

## Official contest requirements (verified)

Official rules: https://paypalaihackathon.devpost.com/rules

- **Official deadline:** November 12, 2026 at 12:00 PM Pacific Standard Time = **November 13, 2026 at 05:00 KST**. Aim to submit earlier because last-minute upload or time zone errors are possible.
- Deliver a functional application judges can run **from a clear public repository checkout**; no hosted production URL is strictly required when repository setup and run instructions are sufficient.
- Repository must be public, with source and **visible open-source license on its main/default page**.
- Provide a **public YouTube** demonstration video shorter than 3 minutes showing the actual working application, and a project description in English.
- The working project must meaningfully use **PayPal Sandbox / developer tooling and AI**. The fact that the default browser demo is offline/mock while historical provider calls were owner-observed is a **genuine first-round evaluation risk**, not something to conceal.

## Already confirmed (source-specific)

| Gate | Grounding | State |
| --- | --- | --- |
| Two service categories | AI Work and Global Services selected in real Chromium synthetic walkthrough | CI VERIFIED |
| Human quote, contract and review | Local end-to-end synthetic demo, SQLite history | CI VERIFIED |
| Linux Node tests | 564/564 success at `96a6f89`, later `0061d278` CI green | CI VERIFIED |
| Windows owner recorder | First-run private recording command in GitHub Actions | CI VERIFIED |
| Default-speed synthetic WebM | GitHub Actions [40876399546](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40876399546) `ffprobe` 148.72 seconds, SHA-256 manifest PASS | CI VERIFIED — ephemeral only |
| Historical real Gemini classification and PayPal Sandbox buyer → capture → GET | Oct 28 private owner-operated run | OWNER-REPORTED — NOT independently replayed by CI |
| `lead/paypal` root MIT license | Existing development-branch LICENSE | PRESENT |
| `main` MIT license at default repo page | Absent; [PR #16](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/16) draft and mergeable | OWNER RELEASE DECISION NEEDED |
| Final owner-PC video review and public YouTube | No approved public video URL | NOT DONE |
| Public final Devpost submission and confirmation | No submitted receipt or URL | NOT DONE |

## Owner-PC safe final preparation (NO payment replay)

From PowerShell in the local repository:

```powershell
git switch lead/paypal
git pull --ff-only
npm run video:record:owner
npm run submission:candidate:local
```

The first recording may install **free** local Python Playwright tooling and requires installed Chrome/Chromium, Python 3 and Node.js 22.5+. It **does not** call Gemini or PayPal. The resulting file is private under `output/videos/paypal-synthetic-review-*.webm`; the latest manifest is adjacent. `output/submission/submission_candidate.md` is an unpublished draft only. Never upload `~/.paypal-ai-mvp-private/`, private SQLite, credentials, Sandbox IDs, or private screenshots.

## Actual owner review gates — in order

1. Watch the **entire new video**; check AI Work, Global Services, quote/approval, historical proof attribution, synthetic review and close. Confirm the clip is readable, English captions accurately reflect the on-screen actions, and the actual encoded owner-PC file lasts **less than 180 seconds**. CI's 148.72-second result is not proof of the owner-PC file's exact duration.
2. Review the English Devpost description and the short README judge route. Confirm no language implies the browser calls live Gemini/PayPal, that real buyers or sellers exist, that PayPal has partnered with the owner, or that escrow/fees/transactions are deployed.
3. Decide whether to authorize merging the isolated **PR #16** so the **default `main` page** exposes an MIT license and the judge start instructions. Do not automatically merge all unfinished development branches.
4. Review any repository security scan and source rights before release. A public GitHub branch already exists; **publication of the final video** remains a separate owner decision.
5. **Only after explicit owner approval**: upload the reviewed under-three-minute WebM to a **public YouTube video**, obtain the actual URL, and insert it in the Devpost submission.
6. **Only after explicit owner approval**: submit the English project description, public repo link, functional demo instructions and YouTube video on Devpost. Save the actual submission receipt/link.

### First-round technical caveat

The judges may require stronger evidence that PayPal/AI are central to the **runnable** product. Current reproducible browser interactions are offline synthetic, and the historical owner-operated Sandbox + Gemini evidence is separate. No amount of green CI, confident copy or simulated approvals should be presented as independent provider integration.

Possible judge-safe options to consider **only with appropriate owner control**: a sanitized proof transcript tied to historical local evidence; or a clear optional owner/judge-controlled provider walkthrough using their **own** Sandbox credentials with affirmative payment authorization. Do not run additional Capture, call billable APIs, upload secrets, or imply that authorization has already occurred.

**Final acceptance:** the project is only officially submitted after the Devpost platform provides an actual submission confirmation, not after code, tests or a local packet complete.
