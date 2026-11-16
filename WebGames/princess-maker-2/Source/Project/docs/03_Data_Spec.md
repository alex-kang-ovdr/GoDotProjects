# 기획 데이터 및 런타임 연동 명세

## 출처 구분
- `source: 창작 확장`: 공식 게임 원작에 없는 추가 이벤트.
- 기존 v6 이벤트/능력치: 비공식 프로토타입 규칙.

## characters.json
- `id`: 영구 식별자, 저장 데이터 키
- `name`, `role`, `intro`, `theme`: UI 텍스트
- `affinity`: 교류 보너스에 쓰이는 능력치 키 배열
- `stages[]`: `min` 친밀도 이상에서 표시하는 단계별 대사
- `conflict`, `gift`, `endingNote`: 후속 분기 확장용 서사 필드

## events.json
- `id`, `title`, `body`, `category`: 표시 및 분류
- `condition.minAge`: 최소 나이, `condition.stat/min`: 능력치 문턱
- `choices[]`: 선택지 텍스트, `delta` 능력치 변화, `gold` 금화 변화
- `repeatable`: 반복 이벤트 가능 여부. 현재 v7의 이벤트 선택기는 반복 허용

## 구현 상태
- v7의 36개 신규 이벤트는 기존 랜덤 이벤트 풀에 편입
- 8명의 NPC는 새 '등장인물' 탭에서 월 1회씩 교류 가능
- 친밀도는 기존 세이브에 호환되도록 `npcAffection`을 지연 초기화
- `conflict/gift/endingNote`는 **데이터 정의만 완료**, 아직 독립 분기나 엔딩 판정에는 연결되지 않음

## 후속 작업
1. 이벤트 개별 발생 빈도/쿨다운 및 유일성 설정
2. NPC 간 경쟁·연쇄 이벤트·친밀도 잠금 분기
3. 엔딩 판정에 관계도와 이벤트 플래그 연결
4. 대사 로컬라이징 키 분리 및 대사 QA
