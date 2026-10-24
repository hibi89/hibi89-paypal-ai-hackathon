# PayPal AI Hackathon — 한 문장 새 채팅 복원

**사용자 고정 명령:** `[해커톤총괄 깃헙 레포지토리 확인하고 작업하셈]`

**전담 저장소** `hibi89/hibi89-paypal-ai-hackathon` · **브랜치** `lead/paypal`. **실제 채팅 4개 체계 중 PayPal 총괄=직접 개발자 1명**, 별도 기능별 AI 채팅 없음. [통합 상황실 진입점](https://github.com/hibi89/hackathon-command-center-2026/blob/main/CHAT_BOOTSTRAP.md).

## 새 채팅에서 바로 실행할 순서
1. Github 원격 `lead/paypal` 최신 HEAD → 이 `CHAT_BOOTSTRAP.md` → `HANDOFF.md` → `STATUS.md` → `docs/roles/lead/HANDOFF.md`·`STATUS.md`(있으면) → **`docs/roles/lead/LEAD_ACTIVE_WORK.md`** → `docs/roles/lead/LEAD_FULLSTACK_PROTOCOL.md` → `docs/roles/lead/TO_HACKATHON_LEAD.md` → 실제 소스/테스트/CI 순서로 확인. `main`과 구형 `ACTIVE_TASK.md`를 현재 지시로 착각하지 않는다.
2. `LEAD_ACTIVE_WORK.md`에 적힌 **첫 승인된 미완료 업무를 직접 검수/개발·테스트/커밋**한다. `lead/paypal`에서 신규 개발 및 안전하게 검토한 구 feature 산출물 이관. 과거 기능 브랜치 3개 원본 보존. 결제 Live·신규 현금 지출·키/PII 공개·무단 권한 변경 금지.
3. **이전 작업 인계 기준(게시 시점)**: `feature/quote-payment` PPL-001 READY_FOR_REVIEW 및 오프라인 Node 테스트 11 PASS는 **기존 작업자 보고**, 총괄 독립 테스트/병합은 별도 확인 필요. PayPal Sandbox OAuth/Orders/capture 실제 호출은 접근권한 없어 미검증. 이미 완료된 결과를 재개발하지 말고 새 HEAD와 실증을 비교해 검수하라.
4. **작업 종료 또는 채팅 이전 직전**: 현재 `LEAD_ACTIVE_WORK.md`, 루트·총괄 `STATUS.md`/`HANDOFF.md` 중 유효한 파일 및 `TO_HACKATHON_LEAD.md`, 코드/테스트/CI/차단을 최신화하고 GitHub 커밋·원격 HEAD 확인. 이 파일은 역할/경로/규칙 변경 시만 수정; 이슈·SHA는 동적 작업 포인터에 기록한다.

**마감:** 내부 2026-11-11, 공식 2026-11-13 05:00 KST. 실제 제출 영수증 별도 필요.

**역할 모호성:** 새 채팅에 대회 지정이 없다면 단문만으로 PayPal 담당 여부를 알 수 없다. 명확한 PayPal 총괄 채팅 역할이 있을 때 이 문서를 사용하며, 구분 불가 시 통합 총괄을 기본으로 한다.
