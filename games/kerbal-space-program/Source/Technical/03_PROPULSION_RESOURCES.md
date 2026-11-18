# 추진·연료 공급·스테이징

> KSP 1 (1.12.x) 관찰 기반 역설계 + 독립 재구현 기술 제안. 아래 코드/내부 자료구조는 원작 소스의 복원이 아니다. SI 단위 사용(별도 표기 제외).

## 1. 추진 기본식
`F = ṁ v_e + (p_e-p_a) A_e`, 게임 재구현에서는 엔진 Isp 곡선으로 `F`를 직접 모델링하고 `ṁ = F/(Isp*g0)` 사용. `g0=9.80665 m/s²`는 Isp 변환 상수이며 현지 중력가속도와 구분.
- 대기압에 따른 `Isp(p)` 보간, 스로틀 범위, 점화 가능 횟수, 엔진 고장/정지 상태를 엔진 정의로 관리.
- `Δv = Isp*g0*ln(m0/m1)`은 단일 유효 Isp·이상 로켓의 근사치. 다단·공력·중력손실·엔진 믹스는 별도 시뮬레이션.

## 2. 자원 네트워크
구조 연결과 연료 연결을 별도로 구성. 연료탱크의 자원 타입/양/용량, 크로스피드 허용, 연료관 방향, 우선순위를 고려한다.
```ts
interface ResourceTank { partId:string; type:string; amount:number; capacity:number; priority:number; }
interface EngineDemand { engineId:string; requests:{type:string; unitsPerSecond:number}[]; }
```
**할당 절차**: (1) 활성 엔진의 최대 요구량 산출 → (2) 엔진별 접근 가능한 탱크 찾기 → (3) 자원 우선순위와 공급 규칙 적용 → (4) 실제 공급 비율 `s∈[0,1]` 결정 → (5) 엔진 추력·소모량 동시 스케일 → (6) 자원량 clamp 및 commit.
여러 자원을 요구하는 엔진은 가장 부족한 자원 비율로 전체 연소를 제한한다. 다수 엔진의 동시 요청은 순서 의존성을 피하기 위해 공동 할당하거나 결정적인 우선순위 정책을 문서화한다.

## 3. 스테이징 상태 머신
`Ready -> Armed -> Ignited -> Burning -> Shutdown`, 분리기는 `Attached -> Triggered -> Separated`.
스테이지 액션은 엔진 점화, 디커플러 분리, 페어링 제거, 낙하산 전개 등 복수 이벤트를 묶는다.
```ts
function activateStage(stage:number) {
  const actions = stageActions[stage];
  validateAll(actions);
  enqueueAtomicStageTransaction(actions);
}
```
같은 스테이지에서 분리·점화가 겹치는 경우 액션 실행 순서를 결정적으로 정의하고, 다음 물리 스텝에 그래프를 반영한다.

## 4. 예제 계산
진공 Isp=320 s, 추력 200 kN인 엔진은 `ṁ=200000/(320×9.80665)≈63.73 kg/s`. 연료 1000 kg 사용 가능 시 이상적인 최대 연소시간은 약 15.69 s(추력 일정 가정).

## 5. 검증
- 탱크가 비면 음수 자원 없음
- 두 엔진의 동시 요청이 전체 공급량을 초과하지 않음
- Crossfeed OFF 시 연결돼도 공급 불가
- 스테이징 직후 부품별 연료 소유권 보존
- 진공/해수면 추력 및 Isp 경계 보간
