> **PayPal 새 채팅 한 문장 실행:** `페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈` → [CHAT_BOOTSTRAP.md](CHAT_BOOTSTRAP.md) → `lead/paypal` 최신 원격 HEAD → 현 작업 직접 개발·테스트·GitHub 최신화. 별도 작업자 채팅 없음.

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

## 일별 시간·완료 가능성 안전 계약 (2026-10-24)
- [DAILY_CAPACITY_PLAN_20261024.md](docs/DAILY_CAPACITY_PLAN_20261024.md)의 날짜별 순작업 예상·약 2배 지연 확보시간·검증 완료 조건을 매 `ㄱ` 확인한다. 과거 '4시간→8~20시간' 과소견적을 감안해 **동시에 세 해커톤을 하는 경우 일정 불안전/조건부**임을 숨기지 않는다.
- 실 경과시간이 안전 예산을 초과/외부 계정 불가라면 당일 완료 단정 없이 조기 위험·이월·재산정. 실제 측정값·가정·미검증을 엄격히 분리하고 증거 없는 시간을 창작하지 않는다. 기능축소/유료/권한 변경은 승인 필요.

## 2026-10-24 KST — 일차별 100% 진행률·남은 시간 필수 기록 규칙
- [일일 진척/잔여시간 정책](docs/DAILY_PROGRESS_REPORTING.md) / [검증 근거 JSON 원장](data/paypal_daily_progress.json). **앞으로 매 실제 작업 종료 보고에 '그날 X%/100%, 남은 예상 Y시간, 남은 안전 확보 Z시간, 실측 여부, 완료·미완료·이월' 필수**. 분모는 당일 인수 기준만; 프로젝트 전체와 다름.
- 1일차(10/25 작업을 10/24 조기 실행) **100%/100%, 잔여 예상 0시간·안전 잔여 0시간** (오프라인 quote API 부분 범위만). 2일차(10/26 계획) **0%/100%, 잔여 예상 5시간·안전 잔여 9시간** (현재 NOT_STARTED). 실제 경과시간 NOT_MEASURED.
- 퍼센트는 근거 확인된 항목의 가중치 합계로 계산한다. 예상보다 오래 걸려도 시간을 쓴 것만으로 완료% 상승하지 않는다. 새 회귀 검증 테스트를 추가했다. PayPal 실 Sandbox·AI·Production·Devpost 제출 미검증 유지.
