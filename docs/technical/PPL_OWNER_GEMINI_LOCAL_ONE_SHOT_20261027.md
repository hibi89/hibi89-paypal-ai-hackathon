# PPL — Owner-only Gemini local one-shot API proof, 2026-10-27 KST

## 1. Goal and scope
A concrete, separately owner-triggered way to run the existing Gemini skill classifier against a genuine provider once, in a private terminal, without placing any secret, fake login or provider authority in the public demo. Submission product remains one AI-assisted fictional freelancer marketplace workflow plus true PayPal Sandbox. This tool is a **local external proof**, not a public app route or a real production session.

## 2. Implementation and design alternatives
Chosen: native Node.js CLI composing the existing `createGeminiMarketplaceSkillProvider`, `createOwnerMarketplaceAiService`, and `createMarketplaceAiBudgetStore` with fixed synthetic brief. No dependency or platform change. Alternative: expose Gemini behind the existing synthetic loopback web demo; rejected because fixed mock identity isn't authenticated and might invite unwanted network/API usage or falsely label a real service. The CLI is lower cost, less attack surface and easier to verify privately. No claim of production auth is made.

## 3. Trigger and security boundary
Default `npm run pilot:gemini` exits safely with no network or disk writes. For an *individually authorized future call* only, on the owner's own machine with a previously verified **Free-tier project** and private environment `GEMINI_API_KEY`, run:

```powershell
npm run pilot:gemini -- --execute --owner-authorized --free-tier-confirmed
```

The CLI must have a real interactive TTY and requires typing `GEMINI ONE CALL` as a second consent. This is an explicit local **operator** gate, not independently verified web identity. Passwords, API keys and account identifiers must never be pasted to ChatGPT, added to GitHub or printed in screenshots/logs. Do **not** run until the owner separately approves external calls. Do not link billing or use a paid tier to force the call.

## 4. Data flow / state
Only `Build a fictional ecommerce website with PayPal checkout and QA testing.` is transmitted, through the existing fixed `gemini-3.5-flash-lite` REST adapter using the private key (fixed endpoint; no URL fallback). Result strictly validates the enum `web/design/payments/automation/data/qa`, matches three fictional profiles and records only a digest of the brief, validated skills, result hash and reservation in `~/.paypal-ai-pilot-private/gemini-one-shot.sqlite` (home-relative; no repo file). After first durable attempt, a second request cannot POST again even if the first transport result is UNKNOWN. A successful response prints bounded skills and hypothetical profile IDs, **never** key, raw model content, prices, payment state as paid, account billing ID or token.

## 5. Tests and evidence
- PR [#5](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/5) verified the new code head `3d729c91882c462341f17b089602758c49d8352e`.
- [Actions #40520693835](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40520693835): completed/success, **425/425 Node**, **0 failures**, `MASTER_PROGRESS CHECK PASS 18 calendar entries`, `CHROMIUM_BROWSER_E2E_PASS`. The browser journey is still **offline** and did not call AI/payment providers.
- Five new Node tests check exact CLI flags, 0 side effects without any approval, private budget path and key gating, one offline injected provider response with durable replay prevention, and UNKNOWN/no-repeat on a simulated transport failure.
- The real CLI was **NOT** run with external flags, real key, real provider or any payments in this session. CI fake fetch is *not* provider evidence. Production URL NOT VERIFIED.

## 6. Repository and checkpoint
Repo `hibi89/hibi89-paypal-ai-hackathon`, branch `lead/paypal`; code SHA `3d729c91882c462341f17b089602758c49d8352e`, previous lead `baa76a70ba02389b37468e9f9ccdf45b948552fd`; `main` unchanged. Paths: `src/owner_gemini_local_pilot.mjs`, `scripts/run_owner_gemini_pilot.mjs`, `tests/owner_gemini_local_pilot.test.mjs`, `package.json`. Existing root MIT, reviewer demo and core payment files remain unchanged. No separate project/deployment was created.

## 7. Limitations, security and costs
No account/key has been read from the owner environment; public Free-tier pricing is NOT proof that this account qualifies or that model access is enabled. Official Gemini Free Tier may allow using prompts to improve products: **synthetic input only**. Host principal in CLI is a private process-local test capability, not a production identity provider. Private database only stores one-shot proof metadata, no actual real order, buyer, approved quote or authentication. No Live PayPal, real money, or public HTTP route.

## 8. Errors and recovery
Model failures, quota/JSON errors, and ambiguous network responses consume the durable one-shot reservation and return sanitized UNKNOWN/no-auto-retry; do **not** delete or reset the budget file to bypass this without separate incident review and explicit user approval. Pre-call missing input / flags / key / budget path returns 0 network requests. Git history is the source backup; no force push or DB migrations.

## 9. P0 next actions / acceptance
Owner-only approval required to check private Free-tier eligibility and run one authentic synthetic Gemini classification; success criterion: provider response, validated source, persisted skills, no key leaks, no hidden paid use. That proves CLI integration only. Separately owner-authorized real Sandbox merchant/REST app + distinct Personal buyer + secure HTTPS callback + one virtual USD 1-2 create→approval→capture→GET verification are still blocking D03. Then wire host auth and true Gemini/PayPal results into judge-reproducible UI, screen capture authentic under-3min demo and Devpost submission before 2026-11-13 05:00 KST. NO automatic paid/provider calls while awaiting owner decision.

## 10. Update metadata
Evidence and code inspected in connected GitHub on 2026-10-27 KST; Actions #40520693835 and all workflow job logs checked. Documentation-only sync follows tested SHA and is **not** a separate runtime code test. Check actual remote HEAD, updated handoff, CI and PR on subsequent sessions. Do not change D03/D04/D15 or claim whole-product percentage from static local proof.
