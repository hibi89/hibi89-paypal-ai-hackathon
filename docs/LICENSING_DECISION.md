# License decision — approved and implemented (2026-10-24 KST)

The repository owner explicitly approved the **MIT License** in the active PayPal hackathon conversation. No new money, remote account, security policy, or deployment action was authorized by that grant.

- **Scope:** GitHub repository `hibi89/hibi89-paypal-ai-hackathon` source code and associated documentation owned/controlled by the licensing contributor. Third-party works retain their own licenses.
- **Root text:** [LICENSE](../LICENSE), standard MIT terms with `Copyright (c) 2026 hibi89` (GitHub owner handle).
- **SPDX:** `MIT` in `package.json`; `private:true` remains to avoid accidental npm publish.
- **Verification:** `tests/license.test.mjs` ensures the required grant, attribution, disclaimer, and matching package field. A succeeding GitHub Actions run for the applicable source commit must be checked before D14 is finalized.
- **Limitations:** this does **not** grant use of PayPal trademarks, third-party brands, or anything not owned by the license holder. Existing public repository remains public.
- **Remaining external gates:** actual Sandbox buyer/merchant flow, real AI provider, reviewer access, video, Devpost receipt remain NOT_TESTED. A license grant does not resolve them.

The decision was reached after comparing MIT against Apache-2.0 in the preceding version of this document; the former was expressly selected by the user.
