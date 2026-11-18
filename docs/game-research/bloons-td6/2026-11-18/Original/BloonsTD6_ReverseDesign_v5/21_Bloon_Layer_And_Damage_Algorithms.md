# 풍선 계층과 피해 처리 알고리즘

## 모델 분리
일반 풍선은 계층 전이와 다중 자식 분할을 데이터로 표현. Ceramic·MOAB 계열은 내구 HP와 파괴 시 child graph를 별도로 보유. 속성(Camo/Regrow/Fortified)은 부모·자식 전파 정책을 명시.

## DamageEvent
{sourceId,projectileId,targetId,baseDamage,damageType,bonusTags,pierceCost,hitTime,statuses,canHitCamo}. 면역 및 탐지 실패 시 유효 타격/관통 소비 여부는 공격별 정책으로 관리.

## 알고리즘
1) 대상 생존·타격 이력 확인; 2) 탐지·면역 검사; 3) 방어 보정 및 유효 피해 산출; 4) 현재 계층/HP 감소; 5) 파괴 임계값 도달 시 child graph 전개; 6) 잔여 피해 전달 여부는 공격 플래그로 결정; 7) 팝 수익을 계층 이벤트에 귀속; 8) 잔여 대상에 상태 효과 적용; 9) 제거/누출 큐 반영.

## 중요 엣지 케이스
- 한 발로 여러 계층을 제거할 때 수익을 중복 지급하지 않는다.
- 같은 투사체가 분할된 자식에 다시 타격 가능한지는 rehitPolicy와 pierce 잔량으로 판정.
- Regrow는 경로 진행과 독립적으로 시간 경과하며 원래 계층 상한을 초과하지 않는다.
- Fortified, Camo 속성의 자식 상속은 데이터 정의에 따른다.
- DDT의 은신·면역·대형 태그는 모두 검사한다.
- BAD는 제어 상태에 대한 예외 정책을 갖는다.

## QA 픽스처
단일 Red, Pink 1발 관통, Ceramic 내구력 임계, Rainbow 분할, DDT 탐지 없음, BAD 둔화 시도, 1000개 동시 분할, 동일 틱 중복 충돌.
