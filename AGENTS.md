# PayPal 단일 총괄·개발자 행동 규칙 — CURRENT

<!-- resume: day_id=PPL-D08; percent=0; est_h=4; safe_h=8 -->

**정확한 사용자 시작 명령:** `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]` → [CHAT_BOOTSTRAP.md](CHAT_BOOTSTRAP.md) → `lead/paypal` 최신 원격 HEAD → [ACTIVE_WORK](docs/roles/lead/LEAD_ACTIVE_WORK.md)·[진척 원장](data/paypal_daily_progress.json) → **다음 실제 작업 직접 코딩·테스트·커밋**.

1. PayPal 총괄=개발=테스트=검수=문서화 채팅 **하나**. 별도 worker 채팅·구 dispatcher 금지. `lead/paypal`은 개발 정본, `main` 릴리스만, `feature/*` 과거 자료 보존.
2. 사용자가 `ㄱ`라고 해도 동일. 날짜순 강제보다 독립 READY 선행개발 우선(사용자 승인); 단 blocked Sandbox/무료 AI의 실제 검증은 절대로 mock 테스트로 대체하지 않는다.
3. 소스 원본/고유 ID·결제 계약 유지, GET/F5 읽기 전용, 사람 명시적 승인과 서버 owner/merchant/version/금액/통화 재검증. DB UNIQUE/CAS/멱등, UNKNOWN은 원격 GET 후 확인, 중복 캡처 금지. 실 provider 권한 없으면 결제 HTTP POST 503 유지.
4. 추가 현금 **₩0**, PayPal Live 금지. 유료 API/카드 등록·계정 설정·권한/공개 변경·실사용자 PII/비밀키 공개/실 고객 외부 전송은 사용자 사전 승인 없이는 안 됨.
5. 브라우저 local OFFLINE_MOCK/Node CI/실 Sandbox/실 AI/운영 배포/Devpost 접수는 완전히 다른 검증 단계. `NOT_TESTED`를 성공으로 주장하지 않는다. 동일 접근 2회 실패면 원인·대안·유예.
6. **모든 실제 작업 종료 후** [RESUME_SYNC_CONTRACT](docs/RESUME_SYNC_CONTRACT.md)에 따라 원장+시작/현작업/STATUS/HANDOFF/상위 보고를 **같은 커밋으로 최신화**하고 원격 SHA·CI를 확인. 체크포인트가 일치하지 않으면 `npm test` 실패하도록 [resume 계약 검사](tests/resume_contract.test.mjs) 상시 유지.
7. 다음 직접 작업: **D08 0%/100%, 잔여 예상 4h/안전 8h**, 인증된 계약/납품/검수 서버 API·CSRF·GET 무부작용. D07은 SQLite 오프라인 100%(CI 40069063023). D03 0% 실 Sandbox/AI 차단; D04 80% 실 AI 미검증. [원장](data/paypal_daily_progress.json)이 최신 수치의 정본.
8. 내부 마감 11/11, 공식 11/13 05:00 KST. 전체 플랜 82h/164h 고위험, 실 작업시간 NOT_MEASURED. 무인 백그라운드 자동 작업 아님.
