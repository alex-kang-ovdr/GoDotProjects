# 라운드 생성과 난이도

## RoundDefinition
{roundId,groups:[{bloonId,count,startTime,interval,pathId,modifiers}],completionReward,modeOverrides}. group은 서로 겹쳐 생성 가능하며 startTime은 라운드 시작 후 초 단위.

## 실행 규칙
라운드 시작 시 모든 스폰 이벤트를 시간순으로 정렬. 같은 시간의 이벤트는 groupIndex, spawnIndex 순으로 처리해 결정론 유지. 종료 조건: 예정 스폰 전부 완료 AND 활성 풍선 0 AND 지연 분할/소환 큐 0.

## 난이도 곡선
초반은 타워 배치/기본 속성 학습, 중반은 Lead·Camo·Ceramic 조합, 후반은 MOAB 계열 내구와 DDT 복합 면역, 장기전은 고밀도 및 고내구 압박. 원작 정확한 라운드 구성은 패치/모드별 외부 검증 필요.

## 경제 상호작용
라운드 종료 수익, 풍선 팝 수익, 농장·능력 수익을 서로 다른 event type으로 기록. 모드별 수익 감소 구간을 multiplier schedule로 관리.

## 시뮬레이터
라운드별 총 대상 수, 최대 동시 개체 수, 총 내구력, 특수 속성 비율, 기대 현금, 클리어 시간, FPS p95를 자동 출력.
