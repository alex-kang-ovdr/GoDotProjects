# 풍선 계층·특수 속성·자식 생성

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 기본 계층
Red → Blue → Green → Yellow → Pink. Black/White/Lead/Purple/Zebra/Rainbow/Ceramic은 독립적인 분기 및 다중 자식 구조를 가진다. 단순 단일 체인으로 모델링하지 않는다.

## 특성 비트
CAMO(탐지 필요), REGROW(일부 자식 복원), FORTIFIED(내구 증가), LEAD(일반 날카로운 공격 면역), BLACK(폭발 면역), WHITE(빙결 면역), PURPLE(에너지·플라즈마·화염 계열 면역).

## 대형 풍선
MOAB/BFB/ZOMG/DDT/BAD는 별도 HP 풀과 자식 풍선 스폰을 갖는다. DDT는 은신과 복합 면역 특성을 가진다. BAD는 다수의 제어 효과에 저항한다.

## 데이터 모델
BloonDefinition {id, category, baseSpeed, health, radius, immunities[], children:[{id,count}], leakDamage, rewardPolicy}; BloonInstance {definitionId, hp, pathId, distance, flags, statuses[]}.

## 파괴 처리
1) 충돌 유효성 2) 속성 면역 3) HP/계층 피해 적용 4) 분할 임계값 통과 5) 자식 생성 6) 수익 이벤트 7) 제거. 자식 위치는 부모의 경로 진행 거리를 상속하고, 중복 팝 수익을 막는다.

## 테스트
한 발로 여러 계층 제거; 자식 풍선 다중 생성; fortified ceramic; regrow 재생 상한; camo 미탐지; DDT 면역 조합; BAD 제어 면역.
