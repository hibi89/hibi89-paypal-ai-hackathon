# PayPal 단일 총괄 — CURRENT ACTIVE WORK (2026-10-24 KST)
<!-- resume: day_id=PPL-D11; percent=0; est_h=5; safe_h=10 -->

> 정확한 시작 `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]`, `ㄱ` 또는 `r`. 정본 GitHub `lead/paypal`. [CHAT_BOOTSTRAP](../../../CHAT_BOOTSTRAP.md) → [진척 JSON](../../../data/paypal_daily_progress.json) → 본 지시. 과거 worker 디스패처 사용 금지.

## D11 READY — 공식 2026-11-04 예정, 10/24 선행
- **0%/100%, 잔여 예상 5h, 안전 확보 10h; 실제 소요 시간 NOT_MEASURED.**
- 목표: 실제 PayPal Webhook 형태에 대한 *오프라인* HTTP ingress, raw original bytes 보존, cryptographic signature verification 경계/부적절 cert_url SSRF 차단, SQLite UNIQUE eventId+transmissionId dedup, 역순·동일 timestamp·재전송/미등록 resource GET-first, 감사 trail. **서명 검증 전 2xx 승인/처리 금지**, 미검증 webhook으로 결제 상태 수정/PayPal POST 호출 금지.
- 공식 소스 우선: [PayPal REST Webhooks](https://developer.paypal.com/api/rest/webhooks/rest/)에 raw original body CRC32 *decimal*, 등록 webhook ID·PayPal certificate/verify-webhook-signature POST; simulator postback 불가·mock special WEBHOOK_ID. `src/subscription_contract.mjs` pure planner는 유효 event/중복 상태 계획만, 보안 경계/원장 아님. [공식 연구](../../technical/PPL_D10_SUBSCRIPTIONS_FEASIBILITY_20261024.md).
- 100점 체크리스트: `AUTHENTIC_WEBHOOK_BOUNDARY_AND_PARSER` 25, `SIGNATURE_VALIDATION_NEGATIVE_TESTS` 25, `DURABLE_EVENT_ID_DEDUP_ATOMICITY` 25, `ORDERING_REPLAY_AND_GET_FIRST_GUARDS` 15, `CI_DOCS_HANDOFF` 10.
- **중요:** developer Sandbox webhookId/실 cert/한국 merchant 구독 entitlement/HTTPS public listener는 계정이 없어 `NOT_TESTED`. 실제 PayPal API 서명 검증을 성공했다고 주장하지 말고 synthetic key/cert 서명은 offline-only로 보고. 실 계정 연결·지출·외부 공개 권한 변경에는 사용자 승인이 필요. PayPal 결제 HTTP POST 503 그대로.

## 지난 D10 완료 / 차단
- D10 연구 및 상태 계약 **100%**: REST subscriptions/products/plans 존재, 웹훅 이벤트·상태·검증·KR 일반 REST 코드 등재 확인. 사용자 KR merchant 구독 권한은 미검증. 코드 `src/subscription_contract.mjs`와 13 테스트. [Actions 40072332710](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40072332710): **Node 146/146 PASS, 기존 Chromium PASS**, 근거 SHA `1c852b75b6841eeee0cd2968c234d69fedaa9e0a`.
- D03 실제 PayPal/무료 AI **0% BLOCKED**, 잔여 3h/8h+외부 대기 UNKNOWN. D04 80% 실 AI 20% BLOCKED, 잔여 2h/4h. D01/D02/D05~D09 오프라인/합성 각각 100%.
- Production/Cloudflare D1/실 PayPal OAuth/Live·Orders/Subscriptions·실 AI/Devpost는 NOT_TESTED.

## 다음 채팅 종료 계약
직접 개발·테스트→Actions 확인→JSON 100점/시간/차단 보존→`CHAT_BOOTSTRAP.md`, `AGENTS.md`, `STATUS.md`, `HANDOFF.md`, 본 파일, `TO_HACKATHON_LEAD.md` 동일 resume 마커/원장으로 같은 커밋→CI/원격 HEAD 검증. [RESUME_SYNC_CONTRACT](../../RESUME_SYNC_CONTRACT.md).
