# SAS·RCS·Reaction Wheel·자세제어

> KSP 1 (1.12.x) 관찰 기반 역설계 + 독립 재구현 기술 제안. 아래 코드/내부 자료구조는 원작 소스의 복원이 아니다. SI 단위 사용(별도 표기 제외).

## 1. 조종 입력과 좌표계
조종 입력: pitch, yaw, roll, throttle, translation(X/Y/Z), stage. 사용자가 선택한 control point의 방향이 조종 좌표계가 된다. 카메라 좌표계를 조종 토크와 직접 혼합하지 않는다.

## 2. 목표 자세 생성
모드: Stability Assist, Prograde, Retrograde, Normal, Anti-normal, Radial, Target 등. 기준벡터가 0에 가까우면 목표 생성 실패를 반환하고 직전 유효 목표를 유지하거나 Stability Assist로 전환.

## 3. 쿼터니언 오차와 PD
`q_err=q_target * inverse(q_current)`, 최단 회전 방향으로 부호 정규화. `axis, angle = axisAngle(q_err)`; 목표 각속도 `ω_des=clamp(Kp*angle*axis,ωmax)`, 요구 토크 `τ=Kd(ω_des-ω)`; 관성텐서와 각속도 결합항을 고려해 보정 가능.

```ts
function attitudeController(q:Quat, omega:Vec3, target:Quat, I:Mat3):Vec3 {
  const qe=shortestArc(target.mul(q.inverse()));
  const {axis,angle}=toAxisAngle(qe);
  const desiredOmega=axis.scale(clamp(4*angle,-1,1));
  const alpha=desiredOmega.sub(omega).scale(2);
  return I.mulVec(alpha).add(omega.cross(I.mulVec(omega)));
}
```
실제 게임의 SAS 제어기는 여기 제시한 PD와 같다고 단정할 수 없다. 수치 계수는 예시.

## 4. 액추에이터 할당
Reaction Wheel: 축별 최대 토크·전력 소비. RCS: 각 노즐의 위치 `r_i`, 방향 `d_i`, 최대추력 `f_i`에 대해 `F_i=u_i f_i d_i`, `τ_i=(r_i-COM)×F_i`. 조종면: 동압, 받음각, 조종면 면적과 속도에 따른 토크.
- 비음수 제한 `0≤u_i≤1` 하에서 `min ||W(Au-b)||²+λ||u||²`를 풀어 추력과 토크를 배분.
- RCS 연료가 부족하면 실제 할당 가능한 추력만 적용.

## 5. 안정화 테스트
- 목표 자세 90° 회전, 오버슈트/정착시간
- Reaction Wheel 비활성화 시 RCS로만 제어
- COM 변화 후 RCS 토크 재계산
- 회전하는 천체 표면 기준과 관성계 기준 혼동 방지
- 제어점 역방향 변경 시 조종 축 일관성
