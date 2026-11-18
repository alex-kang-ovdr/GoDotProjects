# 성능·정확도·자동화 테스트

> KSP 1 (1.12.x) 관찰 기반 역설계 + 독립 재구현 기술 제안. 아래 코드/내부 자료구조는 원작 소스의 복원이 아니다. SI 단위 사용(별도 표기 제외).

## 1. 계측 항목
`parts`, `activeRigidBodies`, `constraints`, `contacts`, `physicsSubsteps`, `physicsMs`, `orbitPredictionMs`, `renderMs`, `loadedVessels`, `resourceGraphRebuilds`, `GCAllocBytes`.

## 2. 벤치마크 시나리오
| 시나리오 | 크기 | 검증 포인트 |
|---|---:|---|
| 단일 엔진 발사 | 5 parts | 질량 감소, 추력, 고도 |
| 다단 로켓 | 60 parts | 스테이징, 그래프 분리 |
| 대형 구조물 | 300 parts | 조인트 수렴, CPU |
| 궤도 1000기 | packed | UT 전파, 캐시 |
| 도킹 근접 | 2 vessels | 충돌, 상대 프레임 |
| 재진입 | 30 parts | 공력, 열, 파손 |

## 3. 자동 테스트 수식
- 궤도 2체 에너지 보존: `abs(ε(t)-ε0)/max(abs(ε0),ε_scale) < tolerance`.
- 각운동량 보존: `||h(t)-h0||/||h0|| < tolerance`.
- 연료 질량 보존: `M_before - M_after = consumedMass + discardedMass`.
- 분리 선운동량: `Σm_i v_i` 전후 차이 ≤ 허용오차(외력/분리 충격 포함).
- 부착 노드 위치 오차, quaternion 길이, finite 체크를 매 fixed tick에 assertion 가능.

## 4. 성능 전략
- 궤도 예측은 스냅샷 기반 비동기 worker, 결과 버전이 오래되면 폐기.
- Part 그래프/연료 그래프는 topology 변경 시만 재구축.
- 멀리 떨어진 Vessel은 packed, 부품별 렌더/물리 중단.
- 물리 island 단위 병렬화 가능; 결정성 요구 수준에 따라 스레드 실행 순서 제어.
- 예측 곡선 렌더는 screen-space 오차에 따른 적응 샘플링.

## 5. 회귀 검증 게이트
1. 단위/프레임/NaN 검사 100% 통과.
2. 에너지·운동량 오차는 solver 및 dt별 명시한 수치 허용오차 통과.
3. 대표 로켓 자동 발사/분리/궤도 진입 시나리오 통과.
4. 저장/복원, 워프 전환, 분리 이벤트 반복 테스트 통과.
5. 성능은 목표 하드웨어 기준 측정하여 회귀 기준선 설정.
