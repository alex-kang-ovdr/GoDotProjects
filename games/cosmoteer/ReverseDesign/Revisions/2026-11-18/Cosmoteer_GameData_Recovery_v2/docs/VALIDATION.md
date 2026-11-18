# v2 검증 결과

검증 범위: 공개 문헌 복구 데이터·표현 형식·출처 연결·기획 명세의 일관성. 원작 실행 검증이나 제안 v5 게임 플레이 검증은 아니다.

- 데이터 검사: **passed**, 오류 0건.
- 원작 필드: 2,107개에 대해 JSON↔CSV↔SQLite↔조회 HTML을 대조.
- v1에 있던 필드의 무승인 변경을 검사하고 모든 교정의 이전 값·근거·상태를 확인.
- v4: 29개 선택 추출 행, 14종 부품, 4개 소스 파일 해시, 49개 근거 범위. 동봉 코드 재추출 바이트 일치 확인.
- 스키마: passed.
- 기획: 요구사항 18개·수용 명세 34개의 ID·의존성·문서 참조 검사. 이 수용 명세는 **실행 전**이다.
- 경제 공헌이익 6개 생산물의 입력 단가·난이도 판매 비율을 별도로 재계산.
- 독립 검토의 핵공장 과거 메모·생산 예약 용어·v4 상수 출처 범위 지적을 반영.

## 조회 화면 검증

조회 화면 JavaScript와 실제 브라우저 점검 여부는 [viewer_validation.json](viewer_validation.json)에 기록한다. 구조 검증을 화면 렌더링 성공으로 표현하지 않는다.

## 재현

```bash
python3 scripts/validate_v2.py
node scripts/validate_loader.mjs
node scripts/validate_viewer.cjs
```

상세 결과는 [validation_report.json](validation_report.json), 연구 검토는 [independent_v2_audit.md](independent_v2_audit.md) 참조.

## 전달 형식 재현성

[재현성 기록](reproducibility.json): 데이터·CSV·시스템표·HTML 80개 파일을 같은 입력으로 다시 생성해 바이트 일치를 확인했다. CSV 2,107행의 값뿐 아니라 근거 상태·출처 ID·필드별 버전 범위도 대조했다. 로더 경계 검사10건과 조회 로직 검사10건은 통과했다. 실제 브라우저 렌더링은 OS 소켓 제한으로 확인하지 못했다.
