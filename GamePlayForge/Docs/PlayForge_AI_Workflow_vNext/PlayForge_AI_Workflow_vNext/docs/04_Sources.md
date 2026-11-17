# 04. 공식 자료 및 적용 범위

확인일: 2026-11-17. 아래는 당일 확인한 공식 공개 문서다. 각 문서의 적용 경로·계약·조직 조건을 운영 전에 재확인해야 한다. 이 목록은 특정 회사의 실제 API 권한이나 파트너 승인 증명이 아니다.

## S1. OpenAI App Developer Terms

확인된 페이지 갱신일: 2026-09-28. §1.2 요청 수행·법 준수 등 처리 목적 제한, §1.6 경쟁 모델 관련 제한, §2 개인정보 의무를 확인하는 데 사용.

```text
https://openai.com/policies/developer-apps-terms/
```

## S2. OpenAI Sign in with ChatGPT Terms

표시 효력일: 2026-11-04. §1 영속 token 저장 위치, §3.1 개인 구독 소유자·명시적 background 승인·usage sharing 제한 등의 검토 근거. 별도의 API 인증에 무조건 동일 조건을 적용하지 않음.

```text
https://openai.com/policies/sign-in-with-chatgpt-terms/
```

## S3. OpenAI Plugin Guidelines

최소 목적 입력, 대화 전문 요청/복원 제한, 불필요한 내부 telemetry 응답 제한, 도구 annotation 및 권한·확인 분리를 확인.

```text
https://developers.openai.com/plugins/plugin-guidelines
```

## S4. Anthropic Commercial Terms

확인 페이지에 표시된 효력일: 2025-06-17. B 출력/입력 권리와 D.4 경쟁 제품·모델·재판매 제한 확인. 개인 서비스는 별도 Consumer Terms 적용. 공개 검색의 다른 날짜보다 확인한 본문의 표시를 우선 기록함.

```text
https://www.anthropic.com/legal/commercial-terms
```

## S5. Claude Help — Outputs for model training

표시 날짜: 2026-03-16. 특정 비경쟁 활용 예시와 제한·서면 허가 관련 설명이 함께 있으므로 일반화 금지. PlayForge의 모델/목적이 자동 허용됨을 의미하지 않음.

```text
https://support.claude.com/en/articles/12326764-can-i-use-my-outputs-to-train-an-ai-model
```

## S6. MCP Tools / Security

설계가 참고한 protocol 문서 버전은 2025-11-25이며 최신이라고 주장하지 않음. tool 호출/결과 구조 및 토큰 audience 검증과 token passthrough 방지의 근거.

```text
https://modelcontextprotocol.io/specification/2025-11-25/server/tools
https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices
```

## S7. 개인정보보호위원회 처리방침 작성지침 개정 보도자료

게시일: 2026-04-24. 입력·생성 결과 처리항목, 목적·보관·학습 활용 여부·거부 절차 고지 설계의 참고 근거. 본 패키지의 14/30/90일 보관 제안은 법정 보관기간이 아님.

```text
https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=&nttId=12021
```

## 외부 사실과 제안의 구분

위 자료는 공개 서비스/약관/프로토콜 설명을 뒷받침한다. PlayForge의 API 이름, 자료구조, 권한 분류, 요금 숫자, retention 예시, test gates는 사용자 결정 또는 본 설계 제안이며 위 공급자가 제공하는 PlayForge 기능이 아니다.
