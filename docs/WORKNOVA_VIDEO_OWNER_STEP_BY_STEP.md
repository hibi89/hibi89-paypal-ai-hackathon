# WORKNOVA — 소유자 Windows 실제 촬영·Kokoro 음성 제작 순서
2026-11-08 KST · PRIVATE ONLY · release HOLD

이 문서는 GitHub `lead/paypal`의 **이미 구현된** `scripts/WORKNOVA-Film-Owner.cmd` 및 관련 npm 스크립트를 기준으로 합니다. 별도 ZIP 설치나 유료 결제는 필요하지 않습니다.

## 0. 안전 조건
- **실제 개인/고객 정보, API 키, PayPal/Gemini 인증정보를 브라우저에 입력하지 마세요.** 기본 앱은 127.0.0.1의 오프라인 합성 데모입니다.
- 원본 WebM, 승인된 이전 Kokoro 음성, 기존 녹화 파일은 수정하거나 지우지 않습니다.
- YouTube, Devpost, 새 결제, 실 PayPal API 호출은 하지 않습니다.
- `git status`에 수정/스테이징/충돌 파일이 있으면 임의로 삭제/초기화하지 말고 중단하여 내용을 보여 주세요. 특히 과거 다른 폴더와 병합 금지.

## 1. 최신 코드 확인 (1회)
1. Windows 탐색기로 기존 **PayPal 저장소** 폴더를 여세요. 루트에 `package.json`, `web`, `scripts`가 보여야 합니다. `paypal-premium-review` 출력 폴더와 혼동하지 마세요.
2. 탐색기 주소창에 `cmd`를 입력하고 Enter를 누르거나, 해당 폴더에서 터미널을 여세요.
3. 다음을 한 줄씩 입력하세요.

```bat
git status -sb
git branch --show-current
git switch lead/paypal
git pull --ff-only origin lead/paypal
git rev-parse --short HEAD
```

**주의:** `git status -sb`에 미커밋 파일이 보이면 `switch`/`pull` 전에 중단하고 로그를 보내세요. `lead/paypal`이 아닌 폴더에서 실행하지 마세요. 이 문서 작성 직전 확인한 소스 기준 SHA는 `838e4ab39875fd25022a5f31b332525e07a8c009`입니다. 문서 커밋이나 이후 새 작업으로 최신 SHA가 다를 수 있습니다. `pull --ff-only`만 사용하며 `reset --hard`, `force push` 금지.

## 2. 준비 상태 확인
루트에서:
```bat
dir .video-venv\Scripts\python.exe
dir output\voice-models\kokoro-v1.0.fp16.onnx
dir output\voice-models\voices-v1.0.bin
npm run worknova:video:capture:check
npm run worknova:video:voice:check-cues
npm run worknova:video:voice:check-model
```

기존 Python/Playwright/Chrome과 Kokoro 모델을 재사용합니다. **자동 설치나 외부 다운로드는 없습니다.** 모델이 없거나 SHA가 다르면 원인을 확인할 때까지 **음성 합성만 중단**하세요. 촬영 자체는 아래 4번의 수동 npm 명령으로 별도 수행할 수 있습니다. 모델 파일은 GitHub에 커밋하거나 채팅에 업로드하지 마세요.

## 3. 권장: 원클릭 실행
저장소 루트에서 아래 명령을 실행하거나 탐색기에서 `scripts\WORKNOVA-Film-Owner.cmd`를 더블클릭하세요.

```bat
scripts\WORKNOVA-Film-Owner.cmd
```

1. **Part 1 브라우저**가 열리면 WORKNOVA 로고/상단바를 확인하세요.
2. 자신의 마우스로 `Explore two service markets`를 누르고, **AI Work** 카테고리의 가상 의뢰를 제출해 보세요. 카테고리를 **Global Services**로 바꿔 가상 의뢰를 다시 제출하세요. 견적·승인·계약/검수 관련 버튼 중 실제 보이는 것을 클릭해 동작을 보여 주세요. 금액은 가상 금액만 사용합니다.
3. 촬영을 마쳤으면 **브라우저를 먼저 닫지 말고 CMD 창으로 돌아와 Enter**를 누르세요. Part 1 WebM/매니페스트가 새로 저장됩니다.
4. **Part 2 브라우저**가 열리면 실제 UI에서 5개를 각각 클릭/실행해 주세요: **Delegate & Consent → A2A Negotiation → Gift Finder → Churn Saver → Invoice / Dispute Copilot**. 가상 값이나 기본 샘플 값만 쓰고 결과 메시지가 보이게 잠깐 멈추세요. 실제 포인터 클릭이 기록되어야 합니다.
5. CMD 창으로 돌아와 **Enter**를 누르세요. Part 2 녹화본이 별도 저장됩니다.
6. 스크립트가 승인된 로컬 `Kokoro ONNX FP16`의 `af_heart`로 **Part 2 다섯 음성 큐**를 합성합니다. 음성 타이밍은 현재 170초 편집본에 맞춘 초안이며 실제 새 촬영 시간과 반드시 재편집해야 합니다.
7. CMD에 `WORKNOVA PRIVATE SOURCE CAPTURE READY - RELEASE HOLD`가 나오면 촬영/합성 단계 완료입니다. 이는 최종 공개 승인이라는 뜻이 아닙니다.

## 4. 원클릭 실행이 막혔을 때: 촬영·음성 분리
모델 파일이 없는 경우 3번 CMD는 `--check-model`에서 멈추고 촬영을 시작하지 않습니다. 앱 녹화는 독립적으로 할 수 있습니다.

```bat
npm run worknova:video:capture:check
npm run worknova:video:capture:part1
npm run worknova:video:capture:part2
```

각 `capture:partX` 단계에서 열린 브라우저를 조작한 뒤 **CMD에서 Enter**를 누릅니다. 나중에 모델 위치/해시를 해결한 뒤:

```bat
npm run worknova:video:voice:check-model
npm run worknova:video:voice:part2
```

명령이 실패하면 **오류 출력만 복사해서 채팅으로 전달**하고, 비밀번호/키/실 개인정보가 있으면 가리세요. `.video-venv`나 모델을 임의로 재설치하거나 삭제하지 마세요.

## 5. 결과 파일 확인
탐색기에서 저장소 루트의 `output\videos\` 폴더를 여세요. 파일명에는 실행 시각과 무작위 값이 포함됩니다. **가장 최근 생성된 파일만** 골라주세요.

- `worknova-owner-clicks-part1-*.webm` + 대응하는 `.manifest.json`
- `worknova-owner-clicks-part2-*.webm` + 대응하는 `.manifest.json`
- `worknova-part2-kokoro-af-heart-*.wav` + 대응하는 `.json`

대략 총 **6개 파일(2 WebM, 1 WAV, 3 JSON)** 입니다. 기존 승인된 170초 미리보기 영상과 다른 파일입니다.

## 6. ChatGPT 전달 및 최종 편집
1. 녹화한 두 WebM을 재생해 WORKNOVA 표기가 보이고 실제 클릭·결과 화면이 찍혔는지 확인하세요.
2. `output\videos\`에서 위 **최근 6개 파일만 ZIP으로 압축**하세요. 모델 파일·.env·SQLite·비밀번호·실 주문 내역은 제외합니다.
3. ZIP을 PayPal 총괄 채팅에 첨부해 주세요. 별도의 YouTube/Devpost 공개 업로드는 아직 하지 마세요.
4. 총괄이 원본/이전 녹화와 결합하여 새 **1920×1080, 165~175초** 최종 후보 영상을 만들고, 오디오/자막/장면/보안 및 전체 재생을 검수합니다. **형의 최종 승인 후에만** 공개 여부를 논의합니다.

## 빠른 실패 대응
- `CLEAN_GIT_SOURCE_REQUIRED`: 기존 미커밋 변경 보존, `git status -sb` 출력 전달.
- `WORKNOVA_SOURCE_NOT_BRANDED`: 오래된 저장소 또는 브랜치, 1번에서 확인.
- `WORKNOVA_LOCAL_VIDEO_VENV_MISSING`: 로컬 전용 Python 가상환경 없음. 임의 삭제/자동 설치 금지.
- `OWNER_LOCAL_KOKORO_MODEL_AND_VOICEPACK_REQUIRED` / SHA MISMATCH: 로컬 모델 경로/버전 문제, 재다운로드하지 말고 확인.
- `NO_REAL_BROWSER_POINTERDOWN`: 클릭 없이 종료됨. 실제 클릭 필요.
- `PART2_CUE_TIMING_NOT_SAFE`: 문장 길이/타임라인이 음성 길이와 불일치. 원본 음성은 보존하고 편집 큐 조정 필요.

## 검증 경계
오프라인 Node/Chromium GitHub CI가 PASS여도 **형 PC에서의 실제 녹화와 Kokoro 음성 합성을 실행했다는 증거는 아닙니다.** 출력이 생성되면 사운드·화면을 검토하여 최종 PASS/FAIL을 결정합니다.
