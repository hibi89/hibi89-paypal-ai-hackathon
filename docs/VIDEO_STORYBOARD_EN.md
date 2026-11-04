# Proofline — two-part, five-skill judging video storyboard

**Status:** Two-part V3 recorder now exercises both marketplace categories and all five innovation skills. The new final video is NOT yet independently verified or released. OWNER-OBSERVED external provider evidence is historical only. Owner review draft. The video recording script now traverses both service categories. No new owner-PC video, public video upload, or Devpost submission is claimed by this document.

**Key message:** AI should help people access their first freelance opportunities, not simply automate existing work.

## Screen sequence (target under 3 minutes)

| Scene | Actual demo behavior | Judge takeaway |
| --- | --- | --- |
| 1. Opening | Synthetic local browser, opportunity-first English caption | New freelancers need a path to first opportunities |
| 1a. Evidence map | Four on-screen source classes: offline browser, injected fake APIs, owner-reported history and not-yet-submitted release | The video never passes simulated results off as PayPal/Gemini transactions |
| 2. AI Work | Select AI Work, match three fictional specialists, show skills and gaps | Marketplace vertical one: AI agents, automation, development |
| 3. Global Services | Switch to Global Services, enter the prefilled design brief, show three fictional profiles | Marketplace vertical two: design and related digital services; one shared product |
| 4. Quote | Return to AI Work, choose fictional specialist, create versioned draft, approve exact amount | AI assistance never replaces human consent |
| 5. Historical evidence | Three clearly attributed cards: owner-observed Gemini, owner-observed PayPal Sandbox, provenance limits | Historical owner-local provider evidence is NOT current browser provider calls |
| 6. Delivery | Create synthetic contract; owner submits; separate demo reviewer rejects; owner revises; reviewer accepts | Clear work verification and separate human decisions |
| 7. Records | Show local SQLite audit, review evidence, quote/payment status | Current synthetic browser never creates or captures a PayPal order |
| 8. Delegate & Consent | Open the real Part 2 browser route, create fictional scoped delegation | Explicit role, amount, expiry, no payment |
| 9. A2A negotiation | Click to generate four-turn deterministic buyer/seller transcript | Offline negotiation != real Gemini API or payment |
| 10. Gift-finder | Configure bounded gift mandate, select fictional catalog item | Static catalog and no PayPal order |
| 11. Churn saver | Compute a fictional subscription retention proposal | Real PayPal plan is unchanged |
| 12. Invoice / dispute copilot | Supply contract, delivery and review evidence for human assessment | No invoice is sent to PayPal |
| 13. Closing | Both parts visible, release hold and provenance explicit | Product architecture and five local skills are demonstrated, not externally deployed |

**Time rule:** Default caption pace is 6.5 seconds to make space for the five actual innovation interactions. The recorder enforces elapsed-time below 178 seconds; **independent encoded WebM duration is a separate acceptance test** and reviewer readability needs human assessment. The evidence-map and Global Services scenes are capped at 4.5/5.5 seconds. Video target 165 seconds, hard limit strictly under 180 seconds. Do not claim duration until ffprobe succeeds on the exact generated file.

## Disclosure and scope

- The local browser is **OFFLINE SYNTHETIC**. Sellers, matching, quotes, contracts, review and SQLite data in the recording are fictional samples.
- The October 28 Gemini skill-classification and PayPal Sandbox buyer approval → Capture → provider GET are separately attributed **historical owner-observed** evidence. The clip does not independently reproduce external provider activity.
- If the private saved owner receipt is unavailable on the recording machine, display **OWNER REPORT ONLY**, not a verified local result.
- No live PayPal payment, real seller enrollment, escrow, fee-sharing partnership, lower-cost guarantee, production hosting or current buyer transactions are claimed.
- Do not reveal API keys, OAuth tokens, buyer identity, merchant information, private IDs or databases. Do not replay Capture to produce a fresh shot.
- Do not publish footage, merge a release branch or submit to Devpost until the owner has reviewed and explicitly authorized it.

## Owner recording and gate

From `lead/paypal` on the owner computer:

```powershell
git pull --ff-only
npm run video:record:owner
npm run submission:candidate:local
```

Review the latest ignored `output/videos/paypal-synthetic-review-*.webm`, its `.manifest.json`, and the local candidate. The new video manifest records `storyboard_version=TWO_PART_FIVE_SKILLS_V3`, `demonstrated_categories=[ai_work,general_services]` and `demonstrated_skills=[delegate,a2a,gift,churn,invoice]` only after the automated browser scene assertions succeed. This records synthetic browser actions, not AI/PayPal provider proof. This does **not** independently attest to PayPal or Gemini or certify a final public submission.

**Final video: not yet recorded and reviewed with the new two-category storyboard. Public YouTube link and Devpost receipt: not yet provided.**
