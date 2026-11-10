# WORKNOVA 170s private film — technical QC / release decision (2026-11-11 KST)

**Scope:** independent technical inspection of an already user-owned private Library video, not video editing, owner audio review, live provider integration, release approval, or public submission. This report contains only non-secret checksums/metadata. **RELEASE HOLD** remains. No provider API, payment, GitHub video upload, YouTube upload, or Devpost submission.

## Source provenance

- Reviewed private Library file: `WORKNOVA_170s_ACTUAL_BROWSER_PRIVATE_REVIEW_20261109.mp4`; byte length **17,670,557**, SHA-256 **`2cd375dde37c914c62f8c92906f09919943c37da055a7cc1793c11471af74dc6`**.
- Original accompanying Library archive `WORKNOVA_STEP27_ACTUAL_UI_PRIVATE_REVIEW_PACKAGE.zip` contains the **same byte-identical MP4**, per independent SHA-256 comparison. All five media/proof entries named in its private index were re-hashed and size-validated: **5/5 PASS**. Provenance manifest status `PRIVATE_REAL_BROWSER_COMMERCE_INSERT_REVIEW_NOT_OWNER_APPROVED`.
- 45–75s footage is actual Chromium screen interaction with a **synthetic loopback-only Node/SQLite** five-stage policy/commercial review. Manifest attests 5 scripted button clicks, no external provider requests, and source capture SHA `d982db015d4f6c16dd780f832881bd5c2372b5a3`. Do **not** conflate this older filming source SHA with latest WORKNOVA app code SHA `5c4f0ba5b5cd5042caea99e3853acd7ab692a7a3`, or claim live Gemini/PayPal AI negotiation/payment.
- The original video/audio bytes were **not modified**. Created a new, separate owner-private review archive `WORKNOVA_OWNER_PRIVATE_REVIEW_QC_20261111.zip`, **17,986,595 bytes**, SHA-256 **`4b7448982bc82d319b0bb7e26aff95b13124b55b16748155c274b07411827b0a`**. This is a temporary chat-delivered download only, **NOT uploaded to GitHub/Library, YouTube, or Devpost**. The original Library file and historical video archives were unchanged.

## Actual media verification (local tools, 2026-11-11 KST)

| Check | Evidence |
| --- | --- |
| Encoded duration | **170.000 seconds**, below the strictly-under-180-second contest video threshold |
| H.264 video | 1920×1080, **25fps**, **4,250 decoded frames** |
| AAC audio | stereo, 48kHz; mean -26.9dB, max -5.9dB via ffmpeg volumedetect |
| Full A/V decode | **PASS**, ffmpeg error-exit 0, no codec error output |
| Long black interval | **0 intervals ≥0.10s** via ffmpeg blackdetect |
| Near-black around 23.0s | Single-frame center of a short smooth fade/transition; source unchanged; **not reported as a prolonged black-screen defect** |
| SHA of MP4 | Independently matches private archive and original manifest, **PASS** |
| Other private ZIP index entries | **5/5 PASS** hash + byte size |

The generated private review ZIP contains the unchanged MP4, HTML local playback page with 15 chapter seek controls, 25-scene contact sheet, 8 unchecked reviewer controls, Korean README, and original provenance records. Its HTML structure was statically checked (15 chapters, 8 controls, no explicit network fetch).

**Browser interaction status: UNVERIFIED.** This runtime Chromium returned `net::ERR_BLOCKED_BY_ADMINISTRATOR` for both `file://` and isolated `http://127.0.0.1`. Two different routes failed due environment access policy; STOP/PIVOT followed, no repeated attempts or product failure inferred. Owner Chrome/Edge playback, UI seek behavior, and audible narration quality **must still be reviewed**.

## Official requirements and uncompromised gates

- Source: https://paypalaihackathon.devpost.com/rules — deadline **Nov 12 2026 12:00 PST = Nov 13 2026 05:00 KST**. The rules require meaningful PayPal Sandbox + AI integration, working judge-accessible build (public hosting **not required** if fully reproducible from public source), visible open-source license, and a **public YouTube demonstration under three minutes**. Video must show functional application and meet rights requirements.
- **Not yet verified:** genuine external same-approved $1.50 OIDC buyer → Gemini A2A → independent merchant PayPal Sandbox CREATE / distinct buyer APPROVED / human CAPTURE / fresh GET, current film narrated audio listen-through, English/Korean subtitle synchronization, music and third-party trademark rights, final public YouTube URL, official Devpost submission receipt.
- Historical user-observed Oct 28 Gemini skill classification + Sandbox purchase is **not** the new same-quote A2A/OIDC external E2E and is **not** independently attested by this film or CI.
- Current app code source **`5c4f0ba5b5cd5042caea99e3853acd7ab692a7a3`**, [full CI #42910551828](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42910551828) SUCCESS Node 1,319/1,319 and Chromium/Windows offline; [smoke #42910551874](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42910551874) SUCCESS. Product **95% provisional / RELEASE HOLD**. No actual production URL; Vercel **N/A**.
- Owner intervention stays consolidated but cannot eliminate explicit approvals: external identity/account provisioning, real Gemini and Sandbox POSTs separately, final film/audio/rights review/public upload, and Devpost submission confirmation. Never retry UNKNOWN provider POST automatically; do GET-only manual reconciliation.
