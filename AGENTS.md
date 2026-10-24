# PayPal AI 역할 및 공통 운영 규칙

- 실제 참가자: 사용자 **1명**. AI 담당자들은 각자 독립 대화와 GitHub 브랜치에서 작업한다.
- 대회 총괄(`lead/paypal`)이 제출·아키텍처·검수·통합·개발 지시 책임을 진다. 기능 담당자는 `feature/quote-payment`, `feature/delivery`, `feature/subscriptions`만 수정한다. 최상위 해커톤 총괄은 전체 일정·위험·공식 성과만 감독한다.
- 다른 브랜치의 소스/메시지/기능은 사용자 승인 없이 수정하지 않는다. `main`은 검증된 통합 기준이다.
- 시작: **자기 브랜치** `HANDOFF.md` → `STATUS.md` → `AGENTS.md` → `REQUIREMENTS.md` → 역할별 `docs/roles/<role>/OPERATIONS.md`. 최신 GitHub HEAD·실제 소스와 대조한다.
- 작업 종료: 기능/실행/테스트/실패·검증·미검증 구분 → `STATUS`·`HANDOFF`와 메시지함/상위 보고 갱신 → 자기 브랜치에 커밋, 원격 SHA 검증. 단순 질의에는 불필요한 커밋 금지.
- 총괄은 새로운 기능 지시 전에 세 기능 브랜치의 최신 `TO_PAYPAL_LEAD.md`를 전수 확인하고 `MESSAGE_REVIEW.md`에 기록한다. 채팅 간 자동 전송·실시간 동기화 없음.
- 원본·기존 정상 기능·데이터 보존. 설계 2안 비교 후 사용자 승인. 유료 API/결제·개인정보 외부 전송·권한/공개 설정 변경·기존 원본 변경은 승인 필요.
- 토큰·.env·비밀번호·개인정보·비공개 원본 업로드 금지(**저장소 Public**). API Sandbox 성공/합성 테스트/CI/Production 실제 동작을 구분한다.
- 이 운영 문서는 코드 개발 완성의 근거가 아니다. 대회 공식 규정은 https://paypalaihackathon.devpost.com/rules.

## 검수 후 확정된 시작 경로 (2026-10-24 KST)
- `main`에서 [ROLE_COORDINATION.md](docs/ROLE_COORDINATION.md)로 각 AI 역할 브랜치를 찾는다. **main에는 역할별 HANDOFF/STATUS가 없으므로** 총괄/작업자 채팅은 반드시 자신의 소유 브랜치 `docs/roles/<role>/HANDOFF.md`부터 읽는다.
- 로컬 코드가 아직 없어 자동 테스트/CI는 미설정이다. 이 사실을 '테스트 성공'이라 기록하지 않는다. 추후 코드 개발 시 최소 테스트·CI·API/브라우저 검증 계약을 대회 총괄이 정한다.
