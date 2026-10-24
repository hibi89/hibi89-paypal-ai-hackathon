# PayPal v5 단독 총괄 직접 개발 일정 — 2026-10-24
> 과거 3작업자 병렬(v3) 및 별도 1순환 작업자(v4)는 폐기. **PayPal 총괄 1채팅이 모든 기능을 직접 구현·테스트·검수한다.** 신규 개발 `lead/paypal`, `main` 검증 릴리스, 기존 feature 브랜치 증거 보존.

| KST | PayPal 총괄 직접 작업 | Gate |
|---|---|---|
| 10/24~25 | 역할·문서 체계 통합, PPL-001 기술/코드/11개 합성 테스트 이관·검증 | 원격 SHA·Node 테스트 |
| 10/26~30 | AI 견적/사람 승인/결제 서버·영속 멱등/실 PayPal API 가용성 | **10/27 Sandbox+무료 AI 실증** (계정 접근 필요) |
| 10/31~11/02 | 계약·마일스톤/납품 검수·결제 상태 분리 | **11/02 브라우저 E2E** |
| 11/03~06 | 구독/Webhook 실패·취소·중복/서명검증·회귀 | **11/06 기능 동결** |
| 11/07~09 | 통합 보안/무료 한도/데모 접근/배포 | **11/09 제출 후보** |
| 11/10 | 루트 LICENSE·영어 Devpost·3분 미만 공개 YouTube | 공개 재현·실작동 영상 |
| 11/11 | Devpost 내부 조기 제출 | 접수증 |
| **11/13 05:00** | **주최 공식 마감** | 최종 제출 검증 |

제품 세 기능 통합 1개, **신규 지출 ₩0 하드캡**. Cloudflare Workers/D1 Free, Gemini/Workers AI 무료 후보, PayPal Sandbox는 실제 계정·지역·한도 검증 전 확정 금지. Live 결제/유료 API/카드·새 도메인/실 고객 자료 금지. 계정 접근 불가를 테스트 실패 또는 성공으로 오인하지 않고 `NOT_TESTED/BLOCKED_BY_ACCESS` 표기.

[현재 직접 작업](roles/lead/LEAD_ACTIVE_WORK.md) · [0원 정책](ZERO_COST_STACK_AND_GUARDRAILS.md) · [단일 총괄 프로토콜](roles/lead/LEAD_FULLSTACK_PROTOCOL.md)
