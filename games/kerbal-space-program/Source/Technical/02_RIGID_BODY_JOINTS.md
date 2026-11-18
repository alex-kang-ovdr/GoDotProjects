# 강체·관절·분리·충돌 기술 설계

> KSP 1 (1.12.x) 관찰 기반 역설계 + 독립 재구현 기술 제안. 아래 코드/내부 자료구조는 원작 소스의 복원이 아니다. SI 단위 사용(별도 표기 제외).

## 1. 모델
Loaded Vessel의 각 Part는 질량, 관성, 변환, 선속도/각속도를 가진 강체. Attachment마다 6-DOF 고정 또는 유연한 조인트를 만들고, 외부 Strut는 보강 제약으로 추가한다. 이는 재구현 모델이며 원작의 실제 솔버 파라미터는 별도 측정 대상이다.

## 2. 운동방정식
`ΣF = m a`, `Στ = I_world α + ω × (I_world ω)`.
추력·공력의 작용점 `p`에서 COM `c`에 대한 토크 `τ=(p-c)×F`. 중력은 동일 중력장 근사 시 COM에 작용시키거나, 부품별 중력 차이가 의미 있는 규모에서 각 Part에 적용한다.

## 3. 조인트 구속
연결점 `a`, `b`의 위치오차 `C=x_a-x_b`, 상대속도 `Cdot=Jv`. 반복 임펄스 솔버에서는 `J M⁻¹ Jᵀ λ=-(Jv+βC/dt)`의 유효 질량을 풀어 보정. 과도한 β/강성은 높은 질량비·긴 로켓에서 발산/진동 유발.
- substep을 늘리고 질량비를 제한하거나, compliance/soft constraint 도입.
- 각속도 제한은 마지막 수단으로 사용; 원인인 조인트 오차와 관성값 먼저 확인.
- 접촉 충돌과 조인트 구속은 같은 solver island에서 처리.

## 4. 스테이징과 그래프 분리
```ts
function decouple(linkId:string) {
  const link = links.get(linkId); if (!link) return;
  pendingRemoveLinks.add(linkId);
  pendingSeparationImpulse.push({a:link.a,b:link.b,impulseNs:link.ejectionImpulseNs});
}
function commitSplit() {
  removePendingLinks();
  const groups = connectedComponents(structuralGraph);
  for (const group of groups) createOrUpdateVessel(group);
  applyEqualAndOppositeSeparationImpulses();
}
```
구조 분리 시 각 Part의 월드 선속도와 각속도를 **그대로 보존**해야 한다. 새로운 Vessel COM 속도를 모든 Part에 복사하면 분리 순간 회전 운동이 사라진다.

## 5. 파괴와 접촉
- Part별 허용 충격/온도/하중을 데이터화; 충격 크기만으로 파괴 판정하지 말고 상대속도, 접촉 임펄스, 재질, 부품 한계 활용.
- 착륙다리는 서스펜션 스프링-댐퍼 `F=kx+c xdot`와 마찰 원뿔/클램프.
- 물리 엔진의 collision filter로 연결된 인접 Part의 불필요한 자가 충돌을 제어.

## 6. 안정성 테스트
- 50 Part 수직 적층 60초 정지 드리프트
- 1:1000 질량비 조인트 진동
- 비대칭 부스터 분리 후 선운동량 보존
- 10× 시간 가속과 substep의 분리
- 충돌 직후 그래프 분리 및 소유권 무결성
