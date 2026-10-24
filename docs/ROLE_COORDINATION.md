# PAYPAL — 2026 해커톤 AI 역할·브랜치·인수인계 진입점

> 2026-10-24 KST 최초 5브랜치·역할별 문서 직접 검증. 이 문서는 **main에만 있는 안내판**이다. 실제 작업 정보는 각 역할의 전담 브랜치에서 읽어야 한다. 채팅 간 자동 동기화는 없다.

| 역할 | 소유 브랜치 | 해당 역할 새 채팅 첫 문서 | 담당자 메시지 |
|---|---|---|---|
| 대회 총괄 | [`lead/paypal`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/lead/paypal) | [총괄 HANDOFF](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/docs/roles/lead/HANDOFF.md) | [전체 해커톤 총괄 보고](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/lead/paypal/docs/roles/lead/TO_HACKATHON_LEAD.md) |
| AI 견적·결제 | [`feature/quote-payment`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/feature/quote-payment) | [작업자 HANDOFF](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/feature/quote-payment/docs/roles/quote-payment/HANDOFF.md) | [총괄에게 메시지](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/feature/quote-payment/docs/roles/quote-payment/TO_PAYPAL_LEAD.md) |
| 납품·거래 관리 | [`feature/delivery`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/feature/delivery) | [작업자 HANDOFF](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/feature/delivery/docs/roles/delivery/HANDOFF.md) | [총괄에게 메시지](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/feature/delivery/docs/roles/delivery/TO_PAYPAL_LEAD.md) |
| 구독청구 예외 | [`feature/subscriptions`](https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/feature/subscriptions) | [작업자 HANDOFF](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/feature/subscriptions/docs/roles/subscriptions/HANDOFF.md) | [총괄에게 메시지](https://github.com/hibi89/hibi89-paypal-ai-hackathon/blob/feature/subscriptions/docs/roles/subscriptions/TO_PAYPAL_LEAD.md) |

## 새로운 AI 채팅방에 전달하는 방법
- **대회 총괄:** `GitHub hibi89/hibi89-paypal-ai-hackathon의 lead/paypal 브랜치에서 docs/roles/lead/HANDOFF.md → STATUS.md → OPERATIONS.md → 루트 AGENTS.md/REQUIREMENTS.md → 최신 세 작업자 메시지함을 읽고, 원격 SHA·제품 현재 상태를 확인하라.`
- **기능 담당:** `GitHub hibi89/hibi89-paypal-ai-hackathon의 feature/<본인 역할> 브랜치에서 docs/roles/<본인 역할>/HANDOFF.md → STATUS.md → OPERATIONS.md → 루트 AGENTS.md/REQUIREMENTS.md와 실제 소스를 읽고, 자기 브랜치에서만 작업하라.`
- **전체 해커톤 총괄:** [통합 상황실 START_HERE](https://github.com/hibi89/hackathon-command-center-2026/blob/main/START_HERE.md) → 이 대회 전담 총괄의 `TO_HACKATHON_LEAD.md` 읽기. 총괄의 코드 개발 책임을 침범하지 않는다.

## 운영 계약
1. 기능 담당자는 자기 브랜치에서만 실제 개발·테스트·문서 갱신. 보고는 각 `TO_PAYPAL_LEAD.md`에 커밋한다.
2. 대회 총괄은 **새 지시 전에 세 메시지함 전수 확인**하고 `docs/roles/lead/MESSAGE_REVIEW.md`에 SHA·시간·판단 기록.
3. `main` 병합은 PR/테스트/검증 뒤 실시. 문서 초기화와 실서비스 작동은 별개.
4. 작업 종료 시 관련 `STATUS.md`, `HANDOFF.md`, 총괄 보고/메시지함을 함께 갱신하고 원격 SHA 확인. 빈 커밋·force push 금지.
5. 사용자의 확정 전 제품·API·데이터 계약은 **잠정**. 비용·결제·외부 데이터 전송·보안/접근 변경은 사용자 승인.
6. 저장소 **Public**. 토큰·.env·개인정보·고객 원본 금지. 제출 완료·실 API 정상·Production 동작의 미검증 성공 주장 금지.

## 현재 확인된 한계
- 브랜치 및 필수 문서 5/5 존재. 실제 제품 기능 0건, 외부 API/SDK 실검증 없음, CI/Production 미구축, 대회 제출 미완료.
- 신규 대회 총괄·기능 작업자 AI 채팅방 자체는 **아직 실제로 운영을 시작했다고 확인하지 않음**.
- 최신 원격 HEAD/CI는 **매 새 채팅 때 다시 조회**하라. 아래 SHA는 본 문서 작성 이전 관측값.
- `main`: `d66757b8d73daa3158897db078430c4cc91a3847`; `lead/paypal`: `f921c483b5785bf8a1f9fd70da8cd983599669c3`.
- `feature/quote-payment`: `cafdb0a2b2e497944872adc34fb5bb507b9d1d78`.
- `feature/delivery`: `f7336d2746c415938d0325b19798752ba3c4fb4a`.
- `feature/subscriptions`: `8ad5897be995e654d95bffef4f2d03e0691cef33`.
