# TO_HAECHONG — PayPal AI Hackathon 개발 효율 개선 검수 보고서

**보고 대상:** 해총(통합 총괄) | **보고 기준:** 2026-10-28 KST  
**저장소/실개발 브랜치:** `hibi89/hibi89-paypal-ai-hackathon` / `lead/paypal`  
**본 보고서 기준 기능 SHA:** `01326fc06eb06fec315e4a8586dcc1345c85e2f1`  
**최초 1회 작성.** 실제 코드·CI가 원본 근거다. 운영 과정 효율의 측정 시간이 없으므로 절감 시간/비율은 제시하지 않는다.

## 1. 기존 병목 TOP 3

1. **GitHub API를 통한 단건 파일 수정·테스트·재커밋 반복.** 로컬 GitHub 접속 제약으로 파일 교정마다 커넥터 왕복이 발생했다. 읽기 전용 SQLite 영수증 기능에서도 모의 결제 캡처의 `orderId`, 세션 fixture 및 SQLite WAL 부작용을 순차 발견해 여러 차례 수정했다. 이는 [기능/CI 기록](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions?query=branch%3Alead%2Fpaypal)에 남아 있다.
2. **중복 문서/인수인계와 일정 표기 재작성.** D03 실 Sandbox 검증 갱신을 STATUS·HANDOFF·작업 일지에 중복 적고, 원장·생성된 대시보드·회귀 테스트의 기존 고정 기대치를 맞추는 과정이 발생했다.
3. **사용자 Windows의 단계별 반복 입력/수동 검증.** 실제 2026-10-28 사용자 로컬에서 Cloudflare 공개 임시 GET 탐색, Gemini, 인간 견적, 샌드박스 CREATE/구매자 승인/Capture에 대해 여러 단계의 독립 확인을 수행했다. 기존 실증은 성공했지만 동일한 무해 단계의 별도 승인과 수동 상태 점검이 불필요하게 길었다.

## 2. 병목 발생 원인과 근거 범위

- **도구·환경:** 본 총괄 환경의 로컬 GitHub DNS/clone 접근 제약으로 커넥터로 파일과 HEAD를 조작·조회해야 했다. 별도의 전체 Actions 실행으로만 Node/Chromium 통합 검증 가능. 사용자 개인 Windows/SQLite와 GitHub Actions의 파일/권한은 분리된다.
- **잘못된 변경/검증 순서:** 첫 회귀 fixture가 실제 캡처 계약에서 요구하는 주문 참조 필드를 누락했고, 이어 로컬 DB 실증 기록에 새 `-wal/-shm` 파일을 만들던 읽기 방식이 발견되었다. 성공 CI 이전에 실패 CI가 반복됐다.
- **문서 경계 미분리:** 상태·인수인계·진척 설명의 일관성을 사람 손으로 유지했다.
- **실시간 결제/인증 승인 자체**는 안전·대회·권한을 위한 필수 절차다. 제거 대상이 아니다.

위 기록은 GitHub 이력과 사용자 제공 실행 스크린샷으로 확인한 **발생 사실**이며, 각 단계 실제 소요시간을 재지 않은 이상 시간 순위나 개선 절감률은 **미측정**이다.

## 3. 실제 적용한 개선 조치 (완료 / 아직 검증 필요)

| 조치 | 구현 상태 | 실제 코드/효과/한계 |
|---|---|---|
| 기능 단위 일괄 작업+필요시 CI | **적용** | `lead/paypal`에서 관련 소스·테스트를 같은 기능으로 묶어 진행. 커밋 수가 완전히 사라진 것은 아니며 이번 기능은 코드·테스트 수정 때 후속 커밋이 있었다 |
| 문서 중복·조회 반복 제한 | **규칙 반영** | `AGENTS.md`는 [단일 프로토콜](docs/DEV_ACCELERATION_PROTOCOL_20261028.md) 연결만 추가. 진척 원장은 `data/paypal_daily_progress.json`→`MASTER_PROGRESS.md` 생성, STATUS/HANDOFF는 전환·장애·인수인계 시에만 업데이트하도록 규칙화. 실제 장기 준수/시간 절감은 **미측정** |
| 안전한 단일 Windows 검증 | **구현/CI 오프라인 검증** | `verify_local.ps1`, `scripts/verify_local.mjs`, `npm run verify:local`. SHA·Node·계획·회귀·가상 E2E·브라우저의 PASS/FAIL/SKIP와 임시 로그/summary 제공. **사용자 Windows에서 새 스크립트 전 과정의 실실행은 미확인** |
| 무해 단계 승인 횟수 축소 | **구현/모의 테스트 통과** | `mvp:fast`·`src/owner_mvp_operator_consent.mjs`가 명시한 임시 HTTPS 터널+읽기 GET 두 번을 한 승인으로, 인간 승인 견적+로컬 15분 세션을 한 승인으로 처리. **Gemini 호출, Sandbox CREATE, 구매자 승인, Capture는 절대 자동 통과하지 않음.** 기존 결제 원장 자동 재사용·초기화도 금지 |
| 사용자의 원장 확인용 로컬 화면 | **기능 구현/CI 오프라인 테스트 통과** | `mvp:review`는 비공개 읽기 전용 SQLite 영수증→저장된 Gemini 기술 분류→합성 프리랜서의 일치/부족 기술→인간 USD 1.50 견적→기존 PayPal Sandbox GET 기록을 127.0.0.1 임의 URL에 표시. 새 공급자 호출·POST 없음. 외부 심사 URL/실고객 UI 아님 |

## 4. 개선 후 실제 기능 진척

- **기존 기준 `3153ebe14e8c`:** 사용자 보고 Gemini→Sandbox 구매자 승인→Capture→공급자 GET 성공을 안전하게 원장 반영. 18일 계획 중 D03 완료; 다만 외부 심사 재현 경로는 없고, 개발용 화면도 합성 및 비공개.
- **개선 `10df6febddcc`:** 위 검증 자동화·승인 중복 축소·단일 프로토콜 구현. 실결제 호출 횟수가 감소했다는 측정/주장은 하지 않는다.
- **새 실제 기능 `01326fc06eb0`:** 사용자가 이미 완료한 실증의 **저장된** Gemini 기술 분류와 합성 프로필 매칭·미충족 기술·수동 견적·Sandbox 결과/감사 검사를 함께 보여주는 비공개 GET 전용 웹 화면. 전용 `npm run mvp:review` 제공. 페이지는 PayPal에 새 GET을 보내거나 실거래 결과를 최신 인증·운영 결제라고 오인하지 않게 명시.
- 핵심 한계: 이것은 **이미 기록된 사용자 실증의 로컬 재검토 화면**이다. Gemini와 견적 작성/승인을 공개 심사용 실시간 브라우저 경험으로 통합한 최종 MVP가 아니다.

## 5. 검증 증거 (실행·미실행 구분)

| 소스 SHA | 검증 환경·결과 | 구분 |
|---|---|---|
| [`3153ebe14e8c`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/commit/3153ebe14e8c8001546e3a47180630bcf1bc5add) | [Actions 40549651429](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40549651429) — 465 PASS / 0 FAIL, 18일 대시보드 PASS, 가상 MVP·Chromium PASS | **개선 전 공식 기준** |
| [`10df6febddcc`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/commit/10df6febddcc74f27388a22974b63609feea56c8) | [Actions 40552438395](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40552438395) — 475 PASS / 0 FAIL, 가상 MVP·Chromium PASS | **가속 규칙·단일 검증·합산 동의 기능 구현 및 CI 검증** |
| [`01326fc06eb0`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/commit/01326fc06eb06fec315e4a8586dcc1345c85e2f1) | [Actions 40553264133](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/40553264133) — **480 PASS / 0 FAIL**, Chromium E2E PASS, 계획 PASS | **비공개 결제·견적 리뷰 UI 구현 및 CI 검증** |

핵심 변경 파일: `AGENTS.md`, `docs/DEV_ACCELERATION_PROTOCOL_20261028.md`, `verify_local.ps1`, `scripts/verify_local.mjs`, `src/owner_mvp_operator_consent.mjs`, `scripts/run_owner_mvp_operator.mjs`, `src/owner_mvp_review_server.mjs`, `scripts/run_owner_mvp_review.mjs`, `package.json`, 각 기능의 대응 테스트 파일. **Actions는 합성 API·임시 SQLite와 로컬 브라우저에 대한 검증이며 새 실제 Gemini/PayPal 실호출을 검증한 것은 아니다.** 2026-10-28 외부 실거래 성공은 사용자 제공 PowerShell 출력/스크린샷에서 확인했으나 CI가 같은 계정으로 재실행하지 않았다.

## 6. 남은 병목과 담당 경계

- **AI가 직접 처리:** Gemini 분류·합성 프로필·수동 견적의 브라우저 UI/권한 연결, 계약과 결제 상태 연결, 단일 검증 명령의 Windows 호환 개선, CI·회귀 결함 해결, 영문 시연 대본/심사 가이드, 심사 재현 가능한 최소 앱 경로. 이미 끝난 Sandbox POST를 다시 돌릴 이유 없음.
- **사용자 로컬 Windows 전용:** 기존 `~/.paypal-ai-mvp-private` 영수증 `npm run mvp:review` 확인, Windows `verify_local.ps1` 실제 실행. **이 두 명령은 결제 재시도 없이도 가능.**
- **소유자 별도 승인/실계정 필요:** Gemini 추가 호출·무료 계정 요금 확인, 새로운 Sandbox 주문·Capture, OAuth/사람 인증, 영구 HTTPS 배포·유료 리소스, 영상 공개·Devpost 정식 제출. 과거 대화에 노출된 인증정보는 회전 필요. 원본 DB 삭제/무단 재POST·Live 결제 절대 금지.
- **잔여 위험:** 정식 호스팅/D1·인증된 사용자 접근이 아직 없음. 임시 Cloudflare Quick Tunnel과 기존 브라우저 합성 테스트는 공개 제품 대체 불가.

## 7. 다음 개발 계획과 완료 게이트

1. **P0 기능:** D04 Gemini 기술 분류→적합/부족 기술의 실제 사람 검토→사람이 정하는 견적 승인 정보를 브라우저 사용자 흐름에 반영. AI는 시장가·견적 금액을 임의 예측하지 않으며 실제 POST는 서버 권한·명시 동의·영속 단일성 이후만 가능. 완료 조건: 실제 화면에서 승인/거절·부족 기술을 확인하고, 재접속·중복 POST·무승인 결제가 안전하게 차단되는 테스트.
2. **P1 배포:** D15 인증된 외부 심사 접근 가능 최소 앱, 실제 지원되는 DB 백엔드와 검증된 HTTPS/복구. 샌드박스 전용을 유지하되 무료 호스팅/승인을 점검. **현재 공개 서비스 미검증.**
3. **P2 심사/제출:** D16 실제 브라우저 E2E와 정해진 URL·권한 검사, D17 영문 3분 미만 공개 영상, D18 Devpost 접수 영수증.
4. **잔여 계획 배정 (2026-10-28 원장):** D04 2h, D15 5h, D16 5h, D17 6h, D18 3h = **기본 21h / 안전 포함 42h**. 이것은 기능 검수 전의 추정 작업 배정이며 **실측 남은 시간이나 전체 제품의 검증된 완성률이 아님**. 비계측 대기·예상 외 배포 이슈 별도.
5. 실로컬 외부 재실증은 꼭 필요한 결함/주최 요구 변경 때 **새로운 명시적 승인**을 받는다. 그 전에는 AI가 합성 통합·보안 검사·문서 최소화를 직접 진행한다.

**해총 판정 제안 근거:** 승인 횟수/로컬 테스트 호출 수를 감소시키는 코드는 **KEEP**, 미검증 Windows 완전 실행/인증된 심사 페이지는 **FIX**, 중복 GitHub/문서 갱신과 불필요한 Sandbox 재거래는 **STOP**, 다음 우선 기능 통합은 **ACCELERATE**. 최종 판단은 해총이 실제 소스·Actions와 대조한다.
