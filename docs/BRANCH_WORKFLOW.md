# PayPal 5개 브랜치 협업 규약

```text
main — 검수 통과한 통합 코드만
└─ lead/paypal — 설계·검수·제출·상위 보고
├─ feature/quote-payment — 견적·결제
├─ feature/delivery — 납품·단계 관리
├─ feature/subscriptions — 구독 청구 이상 탐지
```

**선택 비교**: (A) 모든 AI가 하나의 브랜치에서 개발: 단순하지만 충돌·역할 혼선 가능. (B) KIC와 같은 5개 브랜치: 담당자의 독립 이력·검수 경계가 분명하나 문서 갱신 비용 증가. 기존 합의된 다중 AI 운영/이관 목적에 맞춰 (B)를 채택; **이 결정은 운영 구조에 한하며 제품 설계·범위 확정 아님**.

- 각 역할별 소유 문서: `docs/roles/<role>/OPERATIONS.md`, `STATUS.md`, `HANDOFF.md`, 기능 담당 메시지 `TO_PAYPAL_LEAD.md` 또는 총괄 메시지 `TO_HACKATHON_LEAD.md`.
- 기능 담당자는 자기 브랜치 개발·테스트→커밋→문서 최신화→메시지 보고.
- 총괄은 세 담당자 메시지함·HEAD 전수 확인 후 `MESSAGE_REVIEW.md`에서 수락/보류/승인을 기록.
- 검증된 결과만 PR→`main` 병합. 합성 테스트/CI 성공과 실제 서비스 검증을 구분.
- 타 역할 브랜치 무단 수정, force push, 무의미한 빈 커밋, 자동 공유 가정 금지.
