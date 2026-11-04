# PayPal 단일 총괄 개발 브랜치 규칙 — 2026-10-24
- `lead/paypal`: 총괄이 **직접 설계·소스·테스트·검수·문서·제출** 관리하는 유일한 신규 작업 브랜치.
- `main`: 검증된 릴리스만 PR/승인 통합. 현재 운영 개편에서는 변경 금지.
- `feature/quote-payment`, `feature/delivery`, `feature/subscriptions`: **과거 역할/코드 이력 보존, 신규 개발하지 않음**. 삭제/force push/재설정 불가.
- 사용자 `ㄱ` → [LEAD_ACTIVE_WORK](roles/lead/LEAD_ACTIVE_WORK.md) 직접 실행. 과거 ACTIVE_TASK/worker/메시지함 왕복 폐기. 기능별 경계는 코드 모듈 단위.
- 운영 A(1인 lead 브랜치) vs B(1인이 기능 브랜치 순회) 비교: A는 브랜치/보고/merge 왕복 최소, 유지보수·공통 CI 효율, B는 격리성은 높으나 시간·도구 호출 과다. **A 사용자 변경 지시 아래 채택**, `main` 안정 릴리스/이전 SHA 보존으로 위험 완화. 둘 다 신규 지출 0원.
- 보안: Public repo에 비밀/민감정보 금지, 실제 API/브라우저/Production 성공은 실증 후만.
