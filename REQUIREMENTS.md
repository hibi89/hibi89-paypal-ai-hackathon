# PayPal 실행 요구사항 — 승인 기준 2026-10-24 KST

> **사용자가 확정한 운영 기준**: 추가 현금 지출 0원, B안 수정(핵심 결제 POC 우선→PayPal 내부 담당자 1명씩 순차 개발), 3기능 통합 출품 1개. 공식 마감 2026-11-13 05:00 KST. 이 문서는 과거의 '사용자 최종 승인 전' 요구사항보다 최신이다.

## 1. 제품 목표
- 프리랜서 대상 **AI 계약·견적·PayPal Sandbox 결제 자동화 Agent** 1개.
- `feature/quote-payment`: 고객 요구사항 분석→AI 견적/근거→**사람 승인**→PayPal Sandbox 주문 생성·승인·캡처 및 상태 검증.
- `feature/delivery`: 계약·납품/마일스톤·검수, 결제 상태 연결. **결제·납품 상태는 별도 저장**.
- `feature/subscriptions`: 유지보수·정기 계약/PayPal Subscriptions·Webhook 실패·취소·중복 이벤트 대응. **실제 API 접근성 먼저 검증**, 불가 시 미지원/합성 명시하고 변경 승인.
- 안전: AI 단독 결제·결제액 임의 변경 금지, 서버 검증·명시적 승인·중복 주문/웹훅 보호·새로고침 재결제 금지.

## 2. 승인된 방식·예산
- **B안**: 10/27 실 Sandbox 결제 POC → 스키마 계약 동결 → quote-payment(10/26~30) → delivery(10/31~11/02) → subscriptions(11/03~06) **순차 개발/인수** → 11/07~09 통합 검증. PayPal 담당자 동시 개발 금지.
- **₩0 증분 현금 예산 하드캡**. Cloudflare Workers + D1 Free, 무료 AI API(계정 접근 가능한 최신 무료 Gemini 모델/허용 무료 Workers AI), PayPal Sandbox, GitHub Public/Actions, 무료 YouTube/Devpost. **구현 선택은 10/26~27 계정/호환성 실증 후 확정**.
- 유료 등급/카드 등록/결제 자동청구/도메인 구매/PayPal Live 사용 금지. 무료 한도 시 중단하고 승인 없이 업그레이드 금지.
- Gemini 무료 사용에는 테스트용 합성 데이터만. 키/실 데이터/고객 개인 정보 공개 저장소 커밋 금지.

## 3. 일정·수락 조건
- [승인 실행계획 v3.0](docs/PAYPAL_EXECUTION_PLAN_20261024.md), [무료 운영규칙](docs/ZERO_COST_STACK_AND_GUARDRAILS.md).
- 10/27 Gate 1: 실제 PayPal Sandbox Orders create/approve/capture + 무료 AI 호출 성공 증거.
- 11/02 Gate 2: AI 견적→사람 승인→실 PayPal Sandbox 결제→납품 상태 **브라우저 E2E**.
- 11/06 Gate 3: 기능 동결·각 기능 지원/미지원 판정, 오류·보안 보완.
- 11/09 Gate 4: 제출 후보 확정·심사위원용 공개 설치/실행 검증.
- 11/10 3분 미만 실제 앱 영상/영문 설명/최상위 LICENSE/공개 코드/테스트 안내.
- 11/11 내부 조기 제출 / **11/13 05:00 KST 주최 최종 마감**. 심사 종료 12/16 01:00 KST까지 무료 접근 유지.
- 사용자 1명 참가, PayPal 총괄 채팅 1개와 **동일한 순환 개발자 채팅 1개**. 기능 브랜치 3개를 총괄이 GitHub 단일 지시서로 순차 배정. 검증은 실제 API 로그/DB/브라우저/PR·SHA/제출 접수증 기준.

## 4. 주의·불확실성
- **현재는 요구사항/기획만 확정**. PayPal·Cloudflare·Gemini 계정 접근, 해당 국가 API 권한, 구현·테스트·CI·배포, Devpost 작품 생성 및 실제 제출 **미검증/미완료**.
- API·무료 사용제약으로 불가능한 기능이 생기면 총괄이 2개 대안과 영향(돈/품질/시간)을 제출, 범위·비용 변경은 사용자 재승인.
- 공식 대회 규정: https://paypalaihackathon.devpost.com/rules.

## 최신 확정 운영 변경 — 2026-10-24 KST
- 상위 범위에서 KIC/PayPal/UGREEN은 각 1명 활성 개발자씩 동시 진행. **PayPal 기능 담당 3명은 동시 작동 금지**. 기존 3개 브랜치와 통합 제품 목표 및 0원 정책 유지.
- 인수 조건: 이전 담당자 중지→STATUS/HANDOFF/테스트/SHA·메시지 보고→총괄 검수→다음 담당자 1명 지시. [단일 슬롯 v4.0](docs/PAYPAL_EXECUTION_PLAN_20261024.md).

## 최종 승인 — 2026-10-24: 담당자 채팅 하나 + GitHub 지시서 라우팅
- **채팅은 총괄 1개 + 순환 작업자 1개**. 기능 담당 3개의 GitHub 브랜치는 유지하되 3개 별도 작업자 채팅을 만들지 않는다. KIC/UGREEN은 별도 프로젝트다.
- **PayPal 작업자 진입점:** [`WORKER_START_HERE.md`](WORKER_START_HERE.md). **현재 단 하나의 활성 지시:** [`docs/dispatch/ACTIVE_TASK.md`](docs/dispatch/ACTIVE_TASK.md). [큐](docs/dispatch/QUEUE.md)는 미래 일정일 뿐 작업 지시가 아님. 총괄만 lead 지시서 갱신.
- **작업자 채팅 동일 세션 재사용:** 매번 lead의 최신 ACTIVE_TASK 조회 → 지정된 feature 브랜치만 코드·테스트·TO_PAYPAL_LEAD·STATUS/HANDOFF 갱신 → 총괄 검수/인수 후 다음 task_ID+branch 발행. 날짜/큐 보고 자동 전환 금지.
- 최초 `PPL-001` READY, target `feature/quote-payment`: Sandbox 무료 가능성+설계 A/B/계약 v0 및 재현 가능한 증빙. **실행/검증 시작 전**.
- 구 채팅 3개/담당자별 별도 대화 방식과 충돌하면 **이 최신 GitHub 라우팅 규칙이 우선**. 추가 지출 0원·Live 금지·기능 3개 출품 1개·11/13 05:00 공식 제출 마감 유지.
