# WORKNOVA — Owner-only final gate (2026-11-09 instruction supersedes timing below)

**2026-11-09 Step15 CURRENT FILM: v4p6 faster scroll.** Correct current private visual review candidate is `WORKNOVA_v4p6_PRIVATE_170s.mp4`, exact SHA256 `a8cb8b4c811672972d68f362dd45e74a471577f62a1945cd4b499c103dcb897d`, backed up under the Library v4p6 folder. The intro scroll is **2.40s rather than 7.20s**, with all after-22s footage and original AAC preserved. The exact-GitHub-verified `scripts/worknova_v4d_offline_voice_finish.py` now accepts this v4p6 hash (not unknown edits) and must not be rendered until definitive visual LOCK and real owner-local pinned Kokoro files. A future concept control-center dashboard and an extra BGM layer are NOT in this version. Following definitive visual approval, one original `af_heart` render, full audio + subtitle review, and separate public YouTube/Devpost approvals remain. Feature `ccf6456878c2fb5905be2e8c2bf643c33aa2fcbe` CI two SUCCESS (smoke 42535182197, contracts 42535182154); private editor 7/7 local PASS. No live PayPal/Gemini or Production claims. Total previous 79% unchanged.


**2026-11-09 Step14 update — exact v4o voice pipeline is now test-ready, not rendered.** The current real private v4o 170-second film has SHA256 `219b9e21eba9aa77b473f6cfdcc28e7f7afd36d978e7cf37d970f63094856985`. After the owner explicitly says `VISUAL LOCK`, the *existing* `scripts/worknova_v4d_offline_voice_finish.py` supports the exact verified v4o film as well as v4d. In the owner’s offline Python video environment, first run `python scripts/worknova_v4d_offline_voice_finish.py --video "PATH_TO_WORKNOVA_v4o_170s_PRIVATE.mp4" --model-dir "DIR_WITH_ORIGINAL_PINNED_KOKORO" --check-only`, then deliberately `--render` only with the hash-matched approved model/voicepack. Output is a **new private** WAV, bilingual cue-level SRT and mixed MP4; true speech/word sync, listening and visual approval remain separate. No model files were present in this ChatGPT environment, thus actual voice was not synthesized. Do not use eSpeak fallback, cloud audio, new provider API, pay, publish or submit without explicit approval. Main merge remains optional. CI proof at feature `7f65b6a7ada0010e2b900d07abfa25f176aed06d`: 2/2 SUCCESS and Python offline voice 7/7 PASS.

**Owner decision:** Minimize owner intervention. Do not request local commands, account access, media review, main merge or publication piecemeal. Continue all safe independent development, tests, candidate preparation, branding, security review and Devpost drafting first. **Batch strictly unavoidable owner tasks at the final submission gate**, except when a specific prerequisite makes every next independent task impossible. This rule does **not** authorize actual PayPal/Gemini requests, changing billing/accounts, releasing main, production deployment, YouTube publication or Devpost submission.

**Current completed independent facts:** Current public `lead/paypal` WORKNOVA reviewer source at feature `ea24878d932c757ca4cd9a2042e50e453f6d5f54` has exact SHA CI 2/2 SUCCESS (smoke #42527740105 / contracts #42527740102), Linux Node 1227/1227, Python private-ZIP synthetic 8/8, Windows and Chromium two-part reviewer PASS. Public main exists with MIT but is older than lead; Draft PR #30 is outdated. Private v4o 170s film exists but is not visually owner-approved. Historical PayPal Sandbox/Gemini test is owner-observed; no new API call required just for this preparation.

**One final combined owner batch (do only when requested after independent tasks complete):** (A) check any still-necessary local historical receipt once using `npm run mvp:step2:safe` on a clean, verified branch without exporting DB/keys; (B) watch v4o and give one definitive `VISUAL LOCK` or actionable timestamps, then approve the finished af_heart/original voice and subtitles once; (C) approve the final public YouTube upload and English Devpost submission, then preserve the actual receipts. These are *distinct approvals* even if collected in one sitting. **Current WORKNOVA source is already on the public MIT-licensed `lead/paypal` branch; the official contest rules do not require promotion to default `main`.** A separate main merge is optional later and must never be done without its own approval.

**Never:** rerun consumed Sandbox Orders CREATE/Capture or Gemini quotas without new explicit permission, edit/erase original SQLite, upload private files or tokens, public release without separate approval. Older 2026-11-06 step-by-step checklist below is retained as historic detailed runbook; not a request to start it now.

---

# Proofline — 집에서만 마무리할 최종 체크리스트 (2026-11-06 KST)

**현재 최종 완성률 79/100. 남은 21은 실제 외부 증거 및 공개 제출 승인 게이트다.** PC 밖에서 가능한 개발 검증은 마쳤다. 아래는 계정·로컬 비밀 데이터 접근 또는 소유자 공개 판단 때문에 ChatGPT가 원격에서 대신 실행할 수 없는 작업만 모았다.

## 이미 준비됨 (다시 개발하지 않음)

- GitHub 공개 소스 + MIT LICENSE: 공개 저장소·라이선스 GitHub 메타데이터 확인, 최신 WORKNOVA 소스는 공개 `lead/paypal`에 있고 심사위원 실행 가이드가 있다. 기본 `main`은 과거 Proofline 버전이다. 공식 Devpost 규칙은 기본 브랜치 병합을 요구하지 않으므로 현재 [Draft PR #30](https://github.com/hibi89/hibi89-paypal-ai-hackathon/pull/30)의 오래된 소스를 **절대 선제 병합하지 않는다**. 추후 `main` 최신화는 별도 선택 작업이다.
- `lead/paypal` 소스 기능 SHA `7c95d0ccb322d219641e59e3a1e82e0af4f4257f`: [CI #42231932159](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42231932159) Linux Node 1,189/1,189, Windows/Chromium/심사위원 재현 PASS.
- 실격리 Wrangler D1/workerd 실행 및 인증·권한 철회 [CI #42230510780](https://github.com/hibi89/hibi89-paypal-ai-hackathon/actions/runs/42230510780) PASS. **Cloudflare Production이 아님.**
- 기본 속도 합성 WebM CI 녹화 무결성/길이 **140.12초** 확인. CI에서 만든 파일은 휘발성이고 업로드되지 않았다. 이 증거는 PayPal/Gemini 실제 호출이 아니다.
- 영문 Devpost 폼 필드 생성 스크립트, 영상/제출 후보 준비 스크립트, README 영문 심사위원 가이드가 존재한다.

## 귀가 후 안전한 순서

**1. 정확한 소스 확보:** 새 깨끗한 체크아웃이나 이미 검증된 `lead/paypal` 체크아웃만 사용한다. 과거 별도 `paypal-mvp` 폴더의 미확인 변경 118개를 병합하지 않는다. Git 변경 파일이 있으면 덮어쓰지 않는다.

```powershell
git fetch origin
git switch lead/paypal
git pull --ff-only origin lead/paypal
node --version
```

**2. 로컬에 남아 있는 실제 증거부터 조회 (네트워크·결제 0회):**

```powershell
npm run mvp:receipt
npm run mvp:two-part:evidence
```

과거 일회성 주문/결제 기록이 이미 소진된 상태면 절대로 저장소·SQLite를 지우거나 주문/Capture를 반복하지 않는다. 두 번째 명령은 Part2 소유자 데이터가 없으면 NOT_VERIFIED로 끝날 수 있다.

**3. 별도 승인 후에만 기존 PayPal Sandbox 주문 GET:** 사용자 PC의 *기존* `~/.paypal-ai-mvp-private`가 있고, Sandbox 인증 정보가 PC 환경변수에 이미 안전하게 등록돼 있으며, 사용자가 **OAuth 토큰 요청 + 기존 주문 조회만 명시적으로 승인**한 경우에 한정한다.

```powershell
npm run mvp:reconcile:get -- --execute --owner-authorized --sandbox-only --get-existing-only
```

TTY에서 두 번 직접 확인한다. 최대 OAuth 3회/기존 주문 GET 3회 경계, `Orders CREATE`·`Capture`·실제 Live 결제는 **절대 금지**. UNKNOWN/실패가 나오면 무조건 자동 재시도하지 않는다. 키·주문번호·원본 SQLite는 채팅/영상/GitHub에 붙여넣지 않는다.

**4. Gemini는 계정 Free Tier/할당량/데이터 처리 조건을 개인 계정에서 확인한 다음 별도 승인:** 이미 소진된 일회성 예약이 있다면 추가 호출로 초기화하지 않는다. 기본 상태를 확인하는 명령은 외부 호출이 없다.

```powershell
npm run pilot:gemini
npm run pilot:gemini:part2
```

필요할 때만 해당 소스의 정확한 `--execute --owner-authorized --free-tier-confirmed` 옵션과 TTY 문구를 통해 각각 승인한다. Part2 A2A는 별도 모델 호출 예산이 있어 반복하지 않는다. 개인키를 커맨드 인자로 입력하거나 채팅에 공개하지 않는다.

**5. 공개하지 않은 합성 데모 영상 및 영문 패킷 작성:**

```powershell
npm run video:record:owner
npm run submission:candidate:local
npm run submission:fields:local
```

`output/videos`의 새 WebM/manifest와 `output/submission`의 후보를 직접 확인한다. 실제 미디어 길이는 **180초 미만**이어야 하며 둘 다 데모/합성임을 표시한다. 앞선 CI의 140.12초는 귀가 후 재녹화 파일의 길이를 보장하지 않는다.

**6. 사용자 승인·수동 외부 게시:** 현재 공개 MIT 라이선스 `lead/paypal` WORKNOVA 실행 경로 확인 → 영상 최종 승인 후 공개 YouTube 업로드 → 영문 Devpost 폼 승인·제출 → 제출 영수증 URL 보존. **`main` 병합은 대회 제출 필수조건이 아니며 별도 선택 사항**이다. 오래된 Draft PR #30을 병합하지 않는다. 공개 이후 실제 YouTube URL과 Devpost 수신 상태를 따로 검증한다.

## 완료 판단 및 금지

- 공식 제출 시한은 **2026-11-13 05:00 KST**로 기록돼 있다. 실제 마감은 게시 전 Devpost 공식 페이지에서 다시 확인한다.
- 합성 CI 성공/로컬 Wrangler 작업은 실제 PayPal/Gemini·Cloudflare Production 또는 제출 성공이 아니다.
- 승인 없이 계정/API 접근, 새 주문, 결제 Capture, Gemini 소진된 원샷 재호출, 키 업로드, 웹 배포·영상 업로드·Devpost 제출을 하지 않는다.
- 최종 점수는 공개 소스, 검증된 실제 사용 증거, 공개 영상 및 공식 제출 영수증을 확인한 이후에만 갱신한다.
