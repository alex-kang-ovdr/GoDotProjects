# 40. 풍선 계층, 자식 생성 및 초과 피해

## 개념 분리
일반 풍선의 색상 계층과 MOAB-class의 내구 HP는 별개 모델이다. Ceramic은 자체 껍질 HP와 하위 자식 생성 규칙을 갖는다. 실제 계층별 자식 수·내구·속도는 원작 버전별 검증 데이터로 관리한다.

## 상태
`BloonState={id,typeId,layerHp,pathId,distance,flags,parentId,spawnOrdinal,statusEffects}`.

## 피해 해결
1. 탐지와 피해 태그 면역 판정
2. 유효 피해량 계산 (버프·디버프·대형 대상 보너스)
3. 현재 내구에 적용
4. 파괴 시 `children[]`를 정의 순서대로 생성
5. 잔여 피해 전달 가능 여부를 `overflowPolicy`로 결정
6. 새 자식에 `inheritFlagsPolicy` 적용
7. 자식 생성과 처치 수익 이벤트를 분리해 중복 지급 방지

## 자식 생성 규칙
- `children: [{typeId,count,spawnOffset,flagsPolicy}]`
- `spawnOffset`은 같은 위치 겹침을 완화하는 렌더링 오프셋이며 실제 경로 진행 거리 변경은 별도 필드로 둔다.
- Fortified, Regrow, Camo는 부모에서 무조건 상속하지 않는다. **풍선 타입과 파괴 단계별 명시적 규칙**으로 결정한다.
- MOAB 계열은 상위 외피가 파괴되면 여러 자식이 생성될 수 있다.

## 회귀 테스트
- 강한 1회 타격으로 여러 일반 계층 제거
- 외피 HP 정확히 0이 되는 경계
- 동일 틱 2개 발사체의 동일 대상 명중
- 자식 생성 직후 범위 공격 충돌
- 면역 공격이 피해와 수익을 발생시키지 않음
- 자식 여러 개의 누출 생명 감소 계산

## 정확도 라벨
`observed` 플레이 관찰 / `community` 공개 커뮤니티 자료 / `assumed` 개발용 가정 / `verified` 재현 테스트 완료. 수치 데이터마다 출처와 대상 버전을 기록한다.
