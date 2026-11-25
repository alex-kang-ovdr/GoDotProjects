# Prefab·Actor·Component 재사용 설계

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## 기능 범위

Prefab 생성·인스턴스 배치·Variant·Override·Nested Prefab(1단계부터)·Apply/Revert·참조 찾기·복제·공유. Device는 별도 객체 타입으로 만들지 않는다.

## 데이터 계층

`Native CDO → Project Class Defaults → Prefab/Variant Defaults → Instance Overrides` 순으로 유효값을 해석한다. 인스턴스에는 명시적 Override만 저장하고 상위 기본값 변경을 자동 전파한다.

## Prefab 직렬화 예시

```json
{"prefabId":"pf-door","version":3,"rootClass":"Actor","components":[{"id":"mesh","type":"StaticMesh"},{"id":"trigger","type":"BoxTrigger"},{"id":"script","type":"ScriptBehaviour","script":"Scripts/Door.gd"}],"defaults":{"OpenTime":2.0}}
```

## 편집 명령

`CreatePrefab`, `InstantiatePrefab`, `SetPropertyOverride`, `ResetOverride`, `ApplyPrefabChanges`, `CreateVariant`, `FindReferences`. 모든 변경은 공통 Command Pipeline을 통과하며 ChangeSet에 묶는다.

## 충돌 처리

Prefab 구조 변경에는 Hard Lock. 개별 Property는 Revision 기반 조건부 Undo. 다른 편집자의 수정이 이후 발생했으면 자동 Undo 대신 충돌 UI를 제공한다.

## 수용 기준

기본값 수정이 Override 없는 인스턴스에 반영되고, Override가 있는 인스턴스는 유지된다. 구조 변경 중 동시 편집이 보호된다. 참조 무결성 검사와 Undo 테스트가 통과한다.