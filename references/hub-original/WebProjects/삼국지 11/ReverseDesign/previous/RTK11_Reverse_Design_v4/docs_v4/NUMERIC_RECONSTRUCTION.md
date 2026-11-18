# 수치 역산 실험 프로토콜

## 관측 로그 필드
`edition,scenario,turn,seed_if_known,unit_id,officer_id,leadership,strength,aptitude,troops,energy,terrain,techs,skills,attack_type,target_defense,target_troops,damage,status_before,status_after,source_image`

## 전투
고정된 무장/병력/병과/적성에서 단일 변수만 바꾸고 30회 이상 반복하여 난수 분포를 추정한다. 기본 공격과 전법을 분리하고 회심/연쇄/반격을 별도 기록한다.

## 내정
도시와 치안/시설/계절 조건을 고정하고 시장 1개, 인접 조폐, 시설 레벨별 수입을 비교한다. 월 경계와 계절 경계를 구분한다.

## 기교
연구 단계마다 금·기교 포인트·연구 시간과 전투 효과를 따로 측정한다.

## 원작 일치도 판정
정확 수치(공식/공식 매뉴얼 확인), 커뮤니티 수치(독립 재현 필요), 실험 관측, 가설, 미확인의 다섯 단계로 관리한다.
