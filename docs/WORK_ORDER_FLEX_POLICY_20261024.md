# PayPal 날짜/순번 유연화·선행 개발 운영 규칙

사용자 승인일: 2026-10-24 KST. [상위 통합 규약](https://github.com/hibi89/hackathon-command-center-2026/blob/main/docs/WORK_ORDER_FLEX_POLICY_20261024.md)이 공통 기준이다.

## 매번 `ㄱ` 실행 때
1. `lead/paypal` 최신 HEAD → `LEAD_ACTIVE_WORK.md` → `DAILY_CAPACITY_PLAN_20261024.md` → `DAILY_PROGRESS_REPORTING.md` → `data/paypal_daily_progress.json` → 최신 테스트/CI를 읽는다.
2. 오늘 목표를 검증 완료했다면 이후 날짜/순번 중 **독립적으로 실행 가능한 READY 과제**를 선택해 선행 코딩/테스트/원격 커밋할 수 있다. '무조건 D02 다음 D03'식 달력 제한은 폐기하되 필수 의존성은 지킨다.
3. **PayPal Sandbox OAuth/Orders/approve/capture/GET 및 무료 AI API 접근이 없는 한 LIVE 게이트는 BLOCKED/NOT_TESTED**. 오프라인 UI·안전 상태 저장·중복/재시도/브라우저 사용자 흐름 검증은 범위 구분해서 수행할 수 있다. 결제 요청 차단(fail-closed) 해제 금지.
4. 합성 테스트 100%가 Sandbox/실 배포/공식 제출 100%가 아님. 현재 원장의 일차별 원래 **100점 분모·당일 완료율·남은 예상 h/안전 확보 h**를 바꾸지 않고, 미래 과제 선행 완료 시 `planned_day`와 `execution_day_kst`·테스트·CI·SHA 기록. 동일 결과를 두 날짜에 이중 계상 금지.
5. BLOCKED 계정·API가 해결되면 원래 실검증을 복구해 개발 상태 재판정. 실제 시도 없는데 `TESTED` 표시하거나 전체 완성률 추정 금지.
6. 진행률/시간의 최신 정본은 `data/paypal_daily_progress.json`와 일별 담당 보고에 기록; `STATUS.md`, `HANDOFF.md`, `TO_HACKATHON_LEAD.md`에 순서 변경 이유·근거·잔여 단위작업·차단 항목 링크 동기화.
7. 기존 공식 제출 **2026-11-13 05:00 KST**, 내부 11/11, 계획 82h + 별도 확보 82h, 신규 현금 지출 0원·계정/Live 승인 정책은 불변. 외부 인증 대기는 `UNKNOWN`.

**작업 순서는 자유롭게 바꿀 수 있지만, 안전 게이트를 우회하거나 검증 완료를 꾸며내는 것은 허용되지 않는다.**
