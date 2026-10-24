> **[통합 총괄 공식 대회정보 공시 연동 — 2026-10-24]** 사용자의 직접 요청으로 [PayPal 2026 공식 대회정보·제출요건·심사·마감·교육/개발 링크](https://github.com/hibi89/hackathon-command-center-2026/blob/main/docs/contests/PAYPAL_2026_OFFICIAL_REQUIREMENTS.md)를 `hibi89/hackathon-command-center-2026@main`에 게시(검수 기준 중앙 커밋 `25c877616ede`). **상위 총괄의 `README/START_HERE/CHAT_BOOTSTRAP/HANDOFF/projects/PAYPAL`에서 이 문서를 우선 열도록 공시함.** 필수 실 PayPal+AI, 공개 루트 MIT+작동 데모, 공개 YouTube 3분 미만 영상, 최종 Devpost Submitted 증빙 및 11/13 05:00 KST 마감. 실제 Provider OAuth/Orders·AI 호출·배포·영상·최종 접수는 여전히 미검증/미제출. 기존 D03 0% BLOCKED·D04 80%·D15 20% 유지. 통합 총괄은 자신의 새 채팅에서 GitHub를 읽을 때 확인 가능하나, 자동 메시지/실시간 알림은 아님.

# PayPal AI Hackathon — Official Devpost links and six-screenshot verification
Date: 2026-10-24 KST · Source: user-provided public Devpost screenshots, verified against public official resources · Reviewer: PayPal lead

## Confirmed official rules (source of truth)
- Competition: https://paypalaihackathon.devpost.com/rules
- Main overview: https://paypalaihackathon.devpost.com/
- FAQs: https://paypalaihackathon.devpost.com/details/faqs
- Official resources: https://paypalaihackathon.devpost.com/resources
- Schedule: https://paypalaihackathon.devpost.com/details/dates
- Official update and recording: https://paypalaihackathon.devpost.com/updates/46851-the-paypal-build-session-recording-is-up
- Devpost help, **Start project** vs **Import from portfolio**: https://help.devpost.com/article/122-how-to-enter-a-submission

### Crucial verified requirements
1. Theme: PayPal free Sandbox developer platform **AND** meaningful working AI (any AI model/platform; sponsor AI tools optional). An offline PayPal-shaped payment mock plus deterministic `OFFLINE_MOCK` text does **not** satisfy the integration requirements. Sponsor prizes have separate eligibility requirements.
2. A functional build must be runnable/testable by judges. **Public hosting is NOT required** if the public repository contains sufficiently complete build/run instructions and the judges can actually exercise the real application. Static prototype/wireframe alone fails.
3. Required submission content: descriptive English text, AI tools used/how, public open-source code repository with a LICENSE visible at repository top/about, runnable functional demo or hosted URL, public **YouTube** demo under **3 minutes** showing the app working, appropriate rights for any third-party material, and completed Devpost entry. All supplied materials must be English or accompanied by English translations.
4. For judging the running project must be **free of charge and accessible without restrictions through Dec 15 judging end**; if special access is needed, set up a safe reviewer test method/instructions. Official rules mention test credentials/keys when needed but **NEVER store live access tokens, client secrets, private Sandbox account passwords or production credentials in a public GitHub repository**. Prefer a separately approved sandbox-scoped reviewer environment; ask organizers for permitted secure access flow when unsure.
5. First-stage judging is pass/fail on theme/required developer API/SDK appropriateness; stage two evaluates **technological implementation, design, impact, innovation and presentation** at equal weight. Presentation/video is not optional.
6. Deadline **2026-11-12 12:00 PST = 2026-11-13 05:00 KST**; internal deadline 2026-11-11 is a self-imposed target. Contest allows saving Draft project and editing before deadline; 'Draft' does **not** mean submitted. Do not claim an entry exists until Devpost confirms Submitted and supplies receipt/link.
7. Eligibility: individuals above legal age; multi-team and solo permitted, no team-size maximum. Exclusion rules explicitly name **North Korea**, not South Korea; individual legal eligibility still subject to the rest of section 3. Having a PayPal account is a **separate** issue from eligibility. If a country/telephone number isn't available, the FAQs route to organizer PayPal Discord.
8. Existing project modal: 'Submit an existing project / You haven't added any projects to your portfolio yet' is an **empty portfolio**, not an application error. Devpost's help says **Start project** creates new Untitled draft; **Import from portfolio** only lists existing portfolio projects. From the hackathon page select Start project/Enter a submission instead of importing a nonexistent item.

## Screenshot links independently inspected
| Item | Verified destination or description | Use now |
|---|---|---|
| Official Rules | https://paypalaihackathon.devpost.com/rules | P0 gate and submission validation |
| FAQs | https://paypalaihackathon.devpost.com/details/faqs | No team cap; account geography; optional sponsor tools; inviting teammates |
| Resources | https://paypalaihackathon.devpost.com/resources | Sandbox, REST API, Postman, AI Toolkit, agent quickstarts |
| Updates / session recording | https://paypalaihackathon.devpost.com/updates/46851-the-paypal-build-session-recording-is-up | The update links to a video on sandbox setup, toolkit and rules |
| Oct 6 recorded webinar | https://www.youtube.com/watch?v=FFJfCW9z3Do | **High priority**: sandbox and AI toolkit setup |
| Oct 7 APIMatic webinar | https://www.youtube.com/watch?v=zRWixN68tDg | Optional sponsor only; not required for entry |
| Oct 13 Start building with PayPal | https://www.youtube.com/watch?v=ck_zyB66p_Y | Reference material |
| Official AI Toolkit GitHub | https://github.com/paypal/AI-Toolkit | Compatible with Codex / Claude / Cursor. **Do not install or set token without owner approval.** |
| Official API REST/permissions | https://developer.paypal.com/api/get-started/ | Access token, API credentials, Sandbox account roles |
| Sandbox accounts | https://developer.paypal.com/sandbox-testing/accounts | Business merchant + Personal buyer; sandbox synthetic funds |
| Postman guide | https://developer.paypal.com/api/rest/postman/ | REST API exploration is possible without a developer account; **real linked app test still needs credentials** |
| Node.js checkout example | https://github.com/paypaldev/example-node-express | Sample client order approval + server create/capture architecture |

### Practical corrections based on public PayPal developer docs
- On a newly registered PayPal Developer account, **default Sandbox Business and Personal accounts may already exist**. Check Testing Tools → Sandbox Accounts before creating duplicates. The PayPal developer API docs also note that testing outside the US may require a PayPal Business account. Confirm access on the owner's actual account rather than assuming it is automatically usable in Korea.
- The developer dashboard and screenshot alone do not prove account creation or test authorization. No credentials or personal information were accessed in this audit.
- **Do not conflate PayPal AI Toolkit developer plugin with required competition integration.** Installing documentation tooling does not replace a PayPal Sandbox order/approval/capture plus real AI response in the app.

## Direct consequences for current lead/paypal
- Root MIT LICENSE is present and English guide exists. **Before final entry, anonymous browser-check the repo and its license** and decide whether to point Devpost explicitly to `lead/paypal` or promote a verified release to public default branch `main`. A top-level README on old default branch can mislead reviewers.
- P0 real PayPal Sandbox+AI remains blocked; **do not allocate additional mock Cloudflare/D1 work ahead of this gate**. If owner has only a phone, keep all actual credential and enrollment actions deferred.
- Public hosting isn't mandatory and Cloudflare isn't a substitute for real provider integration. A reproducible fully functional localhost build is acceptable **only if judges can run the real PayPal+AI combination** without access problems.
- Demo video, final Devpost text, stable reviewer access and actual Submit confirmation have separate acceptance gates. A Draft cannot be counted as submitted.
- DO NOT change D03/D04/D15/D16/D17/D18 percentages because this is external documentation verification only. No real PayPal or AI calls made.

## Supervisor status
**ACCEPTED**: P0 real provider/AI and judge reproduction outrank more synthetic infrastructure.
**IMPLEMENTED_VERIFIED**: official public rules, FAQ, reference links, Devpost Start project behavior and requirements cross-checked and documented.
**BLOCKED_EXTERNAL**: PayPal Business/Personal Sandbox sign-in, actual OAuth/order/capture, free-tier AI availability/call, production reviewer access, filming/YouTube, Devpost submitted receipt.
**NEXT**: owner-side confirmation of account access and scoped authorization, then a genuinely working integration and runnable judge flow. Owner must not paste client secrets, sandbox buyer passwords, AI keys or tokens in GitHub or chat.
