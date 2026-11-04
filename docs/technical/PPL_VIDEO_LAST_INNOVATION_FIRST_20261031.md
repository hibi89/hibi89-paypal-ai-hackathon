# Video-last / innovation-first engineering rule (2026-10-31 KST)

Decision: one final under-3-minute video with TWO balanced parts, goal 2:45.
- 0:00–1:15 Part 1: live-click marketplace, shortlisting, quote/contract and verified PayPal status
- 1:15–2:35 Part 2: buyer/seller A2A offer/counter/accept, scoped delegation proof, shopping, retention and invoice/dispute
- 2:35–2:45 final PayPal/API/evidence summary

No production footage is authorized and none is newly created by this instruction. Build and verify first. Any external API or payments require explicit separate consent. The video cannot imply real autonomous PayPal Checkout where only local policy is implemented.

First backend milestone after this decision: create isolated pluggable Buyer/Seller protocol. Each model adapter returns a strict typed offer/counter/accept/reject envelope. Server enforces alternating actors, time/turn caps, exact acceptance of opposing offer, buyer maximum and seller floor. Fail closed for malformed/unavailable model output. Agreement is only an OFFLINE contract event, never a financial entitlement; transaction authority remains independently verified. Preserve existing Part 2 fixture UI until adapter is safely integrated and browser-tested. Source path: src/agentic_a2a_protocol.mjs.
