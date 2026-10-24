# PayPal AI 역할 및 공통 운영 규칙

> **[2026-10-24 최신 운영] PayPal 통합 개발자 채팅 1개 / 현재 지시 기반 동적 브랜치 전환.** 이 브랜치는 역할 소유용이지 별도 작업자 채팅을 뜻하지 않는다. 항상 총괄 `lead/paypal`의 [WORKER_START_HERE.md](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/WORKER_START_HERE.md) → [ACTIVE_TASK.md](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/docs/dispatch/ACTIVE_TASK.md) → [PROTOCOL.md](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/docs/dispatch/PROTOCOL.md)를 원격 조회. **현재 ACTIVE_TASK의 target_branch가 `feature/delivery`가 아니면 이 브랜치 개발·수정 금지.** 같은 작업자 채팅이 총괄 검수 후 다음 브랜치로 이동한다. 비용 0원/Sandbox only/민감정보 공개 금지. 초기 ACTIVE_TASK는 quote-payment 대상으로 발행되었으나 **최신 원격 지시 재확인이 필수**.

- 실제 참가자: 사용자 **1명**. AI 담당자들은 각자 독립 대화와 GitHub 브랜치에서 작업한다.
- 대회 총괄(`lead/paypal`)이 제출·아키텍처·검수·통합·개발 지시 책임을 진다. 기능 담당자는 `feature/quote-payment`, `feature/delivery`, `feature/subscriptions`만 수정한다. 최상위 해커톤 총괄은 전체 일정·위험·공식 성과만 감독한다.
- 다른 브랜치의 소스/메시지/기능은 사용자 승인 없이 수정하지 않는다. `main`은 검증된 통합 기준이다.
- 시작: **자기 브랜치** `HANDOFF.md` → `STATUS.md` → `AGENTS.md` → `REQUIREMENTS.md` → 역할별 `docs/roles/<role>/OPERATIONS.md`. 최신 GitHub HEAD·실제 소스와 대조한다.
- 작업 종료: 기능/실행/테스트/실패·검증·미검증 구분 → `STATUS`·`HANDOFF`와 메시지함/상위 보고 갱신 → 자기 브랜치에 커밋, 원격 SHA 검증. 단순 질의에는 불필요한 커밋 금지.
- 총괄은 새로운 기능 지시 전에 세 기능 브랜치의 최신 `TO_PAYPAL_LEAD.md`를 전수 확인하고 `MESSAGE_REVIEW.md`에 기록한다. 채팅 간 자동 전송·실시간 동기화 없음.
- 원본·기존 정상 기능·데이터 보존. 설계 2안 비교 후 사용자 승인. 유료 API/결제·개인정보 외부 전송·권한/공개 설정 변경·기존 원본 변경은 승인 필요.
- 토큰·.env·비밀번호·개인정보·비공개 원본 업로드 금지(**저장소 Public**). API Sandbox 성공/합성 테스트/CI/Production 실제 동작을 구분한다.
- 이 운영 문서는 코드 개발 완성의 근거가 아니다. 대회 공식 규정은 https://paypalaihackathon.devpost.com/rules.
