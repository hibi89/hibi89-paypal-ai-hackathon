# PayPal 작업 종료 시 영구 인수인계 계약 — 필수

사용자 확정일 2026-10-24 KST. 새 채팅의 `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]` 하나만으로 언제든 **현재 미완료 작업을 자동 복원하고 그 턴에서 실제 개발**할 수 있는 문서 상태를 유지해야 한다.

## 유일한 정본과 우선순위
1. GitHub `hibi89/hibi89-paypal-ai-hackathon`의 **`lead/paypal` 원격 최신 HEAD 및 실제 소스/테스트** (절대 `main`의 옛 작업자 지시 사용 금지).
2. `data/paypal_daily_progress.json`의 **active_day_id / day별 100점 체크리스트·시간·차단**. 이는 진행률 숫자의 유일한 정본.
3. `docs/roles/lead/LEAD_ACTIVE_WORK.md`의 READY 작업/구체 작업 지시 및 `CHAT_BOOTSTRAP.md`.
4. `STATUS.md`·`HANDOFF.md`·`docs/roles/lead/TO_HACKATHON_LEAD.md`: 같은 시점의 요약·시도 결과·미검증·최신 다음 작업.

## 모든 개발/테스트/검수 세션 종료 시 반드시
1. 바뀐 코드 및 `tests/*` 실제 검증; CI 완료/실패/대기·실 Sandbox/AI/BROWSER/Production 각각 따로 기록. 시도/실패 이력을 삭제해 완료처럼 꾸미지 않는다.
2. **일별 100점** 분모 고정, 검증한 항목만 VERIFIED. `data/paypal_daily_progress.json`의 percent_complete·estimated_remaining_hours·safe_remaining_hours·actual_elapsed_hours(미계측 null)·이월/차단/테스트 근거를 갱신. 다른 날짜/이름으로 완료실적 중복계상 금지. 연속 선행개발은 독립 READY일 때만 가능.
3. `CHAT_BOOTSTRAP.md`, `docs/roles/lead/LEAD_ACTIVE_WORK.md`, `STATUS.md`, `HANDOFF.md`, `docs/roles/lead/TO_HACKATHON_LEAD.md`의 `resume:` 일차·진척·남은 예상 및 안전 시간을 **각각 동일**하게 맞춘다. 더 이상 매 문서 끝에 낡은 `NEXT`를 중첩해서 혼선이 생기게 하지 않는다. `README.md`는 입구이며 필요하면 최신 경로 업데이트.
4. 진행한 구체 작업/테스트/실패·차단·다음 READY를 명확히 적고, **코드와 문서들을 원자적 GitHub 커밋**으로 함께 업로드한다. 원격 변경에 대비 `expected_sha`를 사용하고 충돌 시 새로운 HEAD에서 재검토 후 갱신; force push 금지.
5. `npm test` 및 GitHub Actions 성공 확인. 문서 갱신 검사 [tests/resume_contract.test.mjs](../tests/resume_contract.test.mjs)를 CI에 포함. CI가 실패했으면 고치거나 FAIL/PENDING을 남긴다. verified SHA는 실제 성공한 브랜치 HEAD 기준만 기록; 다음 커밋이 새 CI를 돌리므로 과거 PASS와 새로운 미확인을 구분.
6. 상위 상황실 보고 `TO_HACKATHON_LEAD.md` 및 가능 시 `hibi89/hackathon-command-center-2026` 최신 링크 공유. 타 에이전트 변경은 보존.
7. 마지막에 **HEAD 다시 fetch**해서 커밋·파일·원장·CI 확인 후 사용자에게 `X%/100%, 남은 예상 Y시간, 남은 안전 Z시간, BLOCKED/NOT_TESTED, next task, GitHub SHA` 보고.

## 새 채팅에서 사용자가 더 말해야 하나?
**아니오.** PayPal GitHub를 읽을 수 있는 채팅이면 `[페이팔 해커톤 깃헙 레포지토리 확인하고 작업하셈]` 하나가 실행 지시로 충분하다. 본문과 표를 다시 붙여넣게 요구하지 않는다. 연결 접근 권한 오류나 사용자만 할 수 있는 계정 인증이 실제 장애면 그 구체적인 부분만 보고. 필요한 비밀키를 채팅에 붙여넣도록 요구하지 않는다.

## 자동화 아님
사용자가 메시지를 보내거나 다른 허용 자동 실행이 없는 동안 작업은 진행되지 않는다. 이 규약은 **한 메시지에서 시작할 때 즉시 최신 정보를 읽어 작업할 수 있게 하는 GitHub 체크포인트**다.
