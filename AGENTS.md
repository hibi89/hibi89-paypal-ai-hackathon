# PayPal 총괄 겸 개발자 운영 — 최신 2026-10-24

1. PayPal **총괄 채팅 하나**가 전략·설계·직접 코딩·테스트·검수·배포·Devpost 제출 준비. 과거 별도 worker chat/ACTIVE_TASK/TO_PAYPAL_LEAD 왕복은 폐기.
2. **`lead/paypal`이 신규 소스와 문서의 정본**. `main`은 검증된 릴리스만. 3 feature 브랜치는 보존·동결, 삭제/force push 금지. 기능 구분은 코드 모듈에서 수행.
3. 사용자 `ㄱ` = 원격 HEAD→HANDOFF→STATUS→AGENTS→REQUIREMENTS→`docs/roles/lead/LEAD_ACTIVE_WORK.md`→소스/테스트를 확인하고 현 미완료 작업을 **직접 구현·검증**. 외부 작업자에게 지시하지 않는다.
4. 구현 전 트리거/데이터 흐름, 읽기/쓰기 분리, API 한도·비용, 실패 복구·멱등·중복 캡처, 보안·인증을 검토한다. 중요한 설계는 A/B 성능·비용·유지보수를 비교하며 승인 없는 핵심 범위 축소·권한/계정/원본·유료 변경 금지.
5. **추가 지출 ₩0**, PayPal Sandbox only, 무료 계정 접근·청구 사전 확인. Public GitHub에 .env·API 키·토큰·고객 개인정보 업로드 금지. 외부 AI에는 합성 데이터만. Live·카드 등록·도메인/유료 플랜 전환은 사용자 사전 승인.
6. AI 견적만으로 결제 금지. 명시적 사람 승인 금액/quote version/소유자 서버 재검증, DB unique/원자 상태전이, 원격 GET 후 reconciliation. 브라우저 F5/GET/redirect가 자동 POST/capture 하지 않음.
7. 합성 테스트/CI/실 Sandbox/AI API/브라우저/Production/Devpost는 **각각 증거로 구분**. 실패 2회 무진전 시 Stop & Pivot. 불가/미검증을 PASS로 표현하지 않는다.
8. 의미 있는 코드·검증 종료에 루트 STATUS/HANDOFF, LEAD_ACTIVE_WORK 및 `TO_HACKATHON_LEAD` 동기화·커밋/원격 SHA 확인. 단순 확인에는 빈 커밋 금지. `main` 통합은 안전한 검증 후. 타 해커톤 저장소는 각 총괄의 소관.

[전체 절차](docs/roles/lead/LEAD_FULLSTACK_PROTOCOL.md)
