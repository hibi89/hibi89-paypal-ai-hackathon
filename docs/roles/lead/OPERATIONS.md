# PayPal 총괄 직접 개발 운영 (2026-10-24)
PayPal 총괄은 **개발·테스트·검수 담당까지 겸임**. 별도 작업자 채팅/feature 브랜치 순환은 폐기.
1. 매 `ㄱ` 또는 새 채팅: `lead/paypal` 원격 HEAD → 루트 HANDOFF → STATUS → AGENTS → REQUIREMENTS → [LEAD_ACTIVE_WORK](LEAD_ACTIVE_WORK.md) → 실제 소스/테스트.
2. 본인이 직접 구현·테스트·오류 분석/수정·보안 검수, 검증 증거로 PARTIAL/PASS/FAIL/NOT_TESTED 구분. 새 작업자에게 지시/수락 기다리기 금지.
3. 종료: 루트 STATUS/HANDOFF + LEAD_ACTIVE_WORK + [TO_HACKATHON_LEAD](TO_HACKATHON_LEAD.md) 동기화, 원격 SHA 확인. `main` 통합은 제품 검증 이후.
4. PayPal Live·유료 API/카드·실 고객정보·권한변경/범위축소 사전 승인, 0원 원칙. 다른 대회 저장소 수정 금지.
