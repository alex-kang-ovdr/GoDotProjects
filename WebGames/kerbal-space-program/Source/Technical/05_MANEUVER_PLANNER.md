# 기동 노드·Δv 예측·최적화

> KSP 1 (1.12.x) 관찰 기반 역설계 + 독립 재구현 기술 제안. 아래 코드/내부 자료구조는 원작 소스의 복원이 아니다. SI 단위 사용(별도 표기 제외).

## 1. 플레이어 모델
기동 노드는 미래 UT와 궤도 국소 기저에 대한 Δv 벡터를 보유한다. Prograde/Retrograde, Normal/Anti-normal, Radial In/Out은 화면 방향이 아니라 궤도 상태에서 계산한 기저.

## 2. 국소 기저
`rhat=normalize(r)`, `hhat=normalize(r×v)`, `that=normalize(hhat×rhat)`.
기동 UI에서 **Prograde**는 일반적으로 순간 속도 방향 `vhat`을 가리킨다. `that`(순수 횡방향)은 편심 궤도에서 `vhat`과 다르므로 혼동하지 않는다. Radial 기저와 Prograde/Normal을 직교화하는 UI 정의를 명확히 정한다.

## 3. 예측 알고리즘
```ts
function previewManeuver(orbit:Orbit, node:Maneuver):Patch[] {
  const atNode=propagate(orbit,node.ut);
  const basis=makeManeuverBasis(atNode);
  const dv=basis.prograde.scale(node.prograde)
    .add(basis.normal.scale(node.normal))
    .add(basis.radial.scale(node.radial));
  const newState={r:atNode.r,v:atNode.v.add(dv)};
  return buildPatchedConics(newState,node.ut);
}
```
이는 **순간 임펄스** 예측. 실제 엔진 연소는 유한 시간에 걸쳐 일어나므로 burn duration이 길면 예측과 차이 발생.

## 4. 연소시간 근사
현재 질량 `m0`, 목표 Δv, 일정 Isp/추력 F이면 `m1=m0 exp(-Δv/(Isp*g0))`, `t_burn=(m0-m1)Isp*g0/F`. 스테이지 변화·스로틀 제한·추력 변화가 있으면 수치 시뮬레이션으로 적분한다.

## 5. UI
- 노드 시간 핸들, 축별 Δv 조절, 총 Δv, 예상 연소시간, 결과 궤도선.
- 기동 전후 segment를 다른 시각 표현으로 표시.
- 접근점(closest approach), AN/DN, 목표 궤도 교차 정보를 예측 이벤트로 계산.

## 6. 경계 테스트
- 원형 궤도 prograde Δv>0 시 원지점 증가
- radial Δv는 궤도 근점 방향 변경
- 노드 시각 변경 시 예측 캐시 무효화
- 연료 부족 시 예상 burn 불가 상태 명시
- SOI 경계 바로 앞/뒤 기동에서 중심천체 프레임 일관성
