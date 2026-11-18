# 부품 그래프와 로켓 조립 에디터

> KSP 1 (1.12.x) 관찰 기반 역설계 + 독립 재구현 기술 제안. 아래 코드/내부 자료구조는 원작 소스의 복원이 아니다. SI 단위 사용(별도 표기 제외).

## 1. 구조와 제약
기체는 루트 Part를 갖는 **부착 트리**를 기본 모델로 삼는다. Strut/연료관/도킹 연결은 추가 간선으로 관리하여 그래프 순환을 허용한다. 트리 부모-자식 관계와 물리 조인트/연료 흐름 관계를 혼동하지 않는다.

```ts
type PartId = string;
interface AttachNode { id:string; localPosition:Vec3; localRotation:Quat; size:number; kind:'stack'|'surface'; }
interface PartDefinition { id:string; dryMassKg:number; nodes:AttachNode[]; modules:ModuleDefinition[]; }
interface PartInstance { id:PartId; definitionId:string; parentId?:PartId; parentNodeId?:string; childNodeId?:string; localPose:Pose; symmetryGroupId?:string; stageIndex:number; resources:Record<string,number>; }
interface VesselBlueprint { rootId:PartId; parts:Record<PartId,PartInstance>; extraLinks:Link[]; }
```

## 2. 스냅 배치 알고리즘
1. 마우스 레이캐스트로 대상 Part/부착 노드 후보 검색.
2. 대상 노드의 월드 프레임 `T_target = T_part × T_node` 계산.
3. 배치할 노드의 로컬 프레임을 `T_childNode`라 하면 `T_child = T_target × T_flip × inverse(T_childNode)`.
4. `T_flip`은 노드 축을 서로 마주 보게 하는 회전. 노드 방향/회전 제한과 표면 부착 규칙 적용.
5. 중복 점유·루트 이동·순환 부모 관계·충돌을 검사 후 확정.

## 3. 대칭 배치
- 방사형 N개: 부모 기준 축을 중심으로 `θ_k=2πk/N`, `T_k = T_parent × R_axis(θ_k) × T_offset`.
- 미러: 평면 반사 변환은 handedness를 바꾸므로 quaternion에 직접 반사행렬을 대입하지 않는다. 반사된 기저를 직교화해 적절한 회전을 재구성한다.
- 복제 그룹은 동일 모듈 설정 변경을 전파하되 사용자가 그룹 해제를 할 수 있도록 설계.

## 4. 질량 및 질량중심
`M=Σ m_i`, `COM=Σ(m_i x_i)/M`. 각 Part의 연료량 변화는 매 스텝 질량에 반영. 관성텐서는 회전된 Part 텐서와 평행축 정리를 이용해 합산:
`I_total = Σ(R_i I_i R_iᵀ + m_i[(d_i·d_i)I - d_i d_iᵀ])`.

## 5. Undo / Redo
모든 편집은 Command 패턴으로 기록: `AttachPart`, `DetachSubtree`, `RotatePart`, `SetSymmetry`, `SetStage`. 커맨드는 ID와 변경 전/후 상태를 보관하고, 조립 중 실시간 프리뷰는 커맨드 확정 전 별도 상태로 관리한다.

## 6. 검증 테스트
- 6방향 부착 노드의 월드 좌표 일치
- 대칭 N=2/3/4/6 배치 시 균등 각도
- 자식 트리를 부모에 붙일 때 사이클 불허
- Undo 100회 후 동일 블루프린트 해시
- 연료 소모 전후 COM의 기대 이동 방향
