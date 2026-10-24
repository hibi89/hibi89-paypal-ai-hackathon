# PayPal English reviewer local preflight vs submission gate (2026-10-24 KST)

## Defect and why it matters
The English reviewer copy/paste runbook previously ran \`npm run preflight:submission\` before \`npm run demo\`. Its **intentional exit 2** (correctly requiring PayPal, real free AI, video and Devpost receipts) could stop automated shell scripts or be mistaken for a broken app. This is a contest-reproduction usability issue, not a security reason to weaken the official submission gate.

## Chosen solution and alternatives
- A. Make \`preflight:submission\` exit 0 when local assets exist: **rejected**, would falsely conflate offline quality with entry eligibility.
- B. Add a separate \`preflight:reviewer\` with a narrowly scoped loopback-only GET smoke and document the two independent meanings: **selected**.
- C. Trigger real PayPal/Gemini using reviewer preflight: **rejected**, unauthorized secret/network/cost implications.

## Independent exit contracts
\`npm run preflight:reviewer\`: requires Node >=22.5 (Node 22.0–22.4 lacks experimental built-in SQLite), needed demo assets, approved MIT LICENSE and the expected no-package local server scripts. It then actually boots \`startOfflineDemo()\` on 127.0.0.1 at an ephemeral port, performs **exactly four GETs** (\`/\`, \`/demo/session\`, \`/api/quotes/sample-project\`, \`/api/demo/integration\`) using fixed internally provided loopback URL, checks offline mode + quote seed, and closes the isolated SQLite-backed test server. It has **no POST, provider transport, user credential read, account access, public listener or external network request**. Returns \`REVIEWER_LOCAL_READY\`, exit 0 on local success; \`REVIEWER_LOCAL_BLOCKED\`, exit 1 if local smoke fails. Reports explicitly \`submissionEligible:false\`, \`providerNetworkCalls:0\`, \`externalProviderEvidence:false\`.

\`npm run preflight:submission\`: **unchanged**; will return \`SUBMISSION_BLOCKED_EXTERNAL_EVIDENCE\`, exit 2 until genuine independently authenticated PayPal Sandbox / free AI / reviewer access / video / Devpost evidence. A local green smoke check NEVER overrides this gate.

## Reviewer commands
Windows/macOS/Linux: \`npm run preflight:reviewer\`, \`npm test\`, \`npm run demo\`, open printed http://127.0.0.1:PORT on the same computer. Check submission eligibility separately (expected blocked). Optional progress check requires Python 3.

## Limits
No actual PayPal Sandbox OAuth/Orders/capture/GET, Gemini Free Tier/generated output, Cloudflare, real secure browser identity, public demo or Devpost submission is verified. D03 0% BLOCKED, D04 80% PARTIAL, D15 20% PARTIAL; D15 remaining estimated 5h/base and 10h/safe, actual elapsed null. D16-D18 NOT_STARTED. No user-side PC interaction required for this GitHub work.
