# 08 · World Cell·Texture Streaming·로컬 패키지

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 지원 범위를 다시 고정

**지원:** Cell 단위 로컬 로드·해제, 비동기 준비, 활성화 예산, 충돌 준비 검사, 로컬 텍스처 Mip Residency.

**미지원:** Actor마다 원격 에셋을 받는 시스템, 플레이 중 CDN 에셋 다운로드, HTTP 기반 런타임 Asset Streaming. 시작 전에 게임 패키지를 설치·캐시하는 배포 작업은 이 금지와 구분한다.

## Godot로 재사용할 부분

ResourceLoader의 background request/status/get을 Cell 패키지 읽기에 사용할 수 있다. 그러나 get을 준비 전에 호출하면 블로킹될 수 있으므로 스케줄러가 완료 여부를 확인해야 한다. Resource 로드, Node 활성화, Physics 등록은 서로 다른 준비 단계다. [G29](../references/Verified_Sources.md#g29)

```text
Cell Manifest
→ Local Read / Parse
→ Prepared (실행 트리 미등록)
→ Activation Budget
→ Physics 등록·동기화 확인
→ CollisionReady
→ GameplayReady
```

PlayForge는 고정 Grid·고유 Home Cell·Global Cell·Runtime 이동 객체 구분을 유지한다. ResourceLoader 자체가 World Partition 정책이나 저장 상태 복구를 제공한다고 보지 않는다.

## Cell 데이터 구성

각 Cell은 명시적으로 포함된 Actor 기록과 필요한 로컬 리소스 목록을 가진다. 빌드 시점에 버전과 완전성을 검증하고, 실행 중 임의 의존 그래프를 재귀 탐색하여 누락된 인터넷 파일을 받지 않는다.

동일 Asset은 리소스 캐시에서 공유할 수 있지만 mutable Material/Animation 상태를 Room/Instance 사이에 공유하지 않는다. Cell unload는 참조 수를 낮추는 것이며 다른 Cell의 리소스까지 파괴하는 명령이 아니다.

## Mip Streaming은 채택 차단 가능 항목

4.8 개발 노트에 Mip Streaming이 등장하고 latest API는 Experimental로 표시되어 있다. 4.7.2 기준 안정성·모든 GPU 지원을 이미 확보한 것으로 계산하지 않는다. [G39](../references/Verified_Sources.md#g39)[G40](../references/Verified_Sources.md#g40)[G41](../references/Verified_Sources.md#g41)

| 선택 | 본체 변경 | 원래 요구 충족 판단 |
|---|---|---|
| 안정판 + 일반 Mipmap | 낮음 | **Mip Residency 요구 충족 아님** |
| 해상도별 전체 Texture 교체 | E0/E1 가능성 | I/O·GPU peak·동작 차이를 측정하고 별도 승인 |
| 4.8 시험 프로필 | 낮은 자체 패치 | prerelease 위험과 타겟 지원 검증 필요 |
| 내부 Residency 백포트 | E3 가능성 높음 | 변경 최소화와 충돌, 기본 비권장 |

일반 Mip Bias나 낮은 해상도 샘플링만으로 VRAM이 반환됐다고 판단하지 않는다. 낮은 Mip 자원으로 교체하는 대안은 실제 최고 메모리와 fence 이후 반환을 측정해야 한다.

## 예산과 적용 책임

Wanted/Resident FirstMip, CPU staging, GPU resident, pending upload, retired-but-in-flight bytes를 나누어 측정한다. 수치가 추정인지 드라이버/엔진이 제공한 측정인지 표시한다. UI 텍스처, 필수 placeholder, gameplay collision 데이터는 각각 다른 생명주기다.

고해상도 Texture 대기는 PlayReady/Teleport 조건이 아니다. 충돌 안전 조건을 기다리는 동안 화면은 low-res 또는 placeholder일 수 있지만, CollisionReady를 렌더링 ready와 혼용하지 않는다.

## 로드 중 취소·상태 변경

요청에는 WorldEpoch와 generation을 붙인다. 이전 PIE의 늦은 I/O 완료가 새 World에 적용되지 않도록 한다. 취소 시 공유 완료 리소스까지 무조건 버리지 않고 해당 요청의 소비만 중단한다. 안전 위치 계산부터 Teleport Commit까지 목적지 Cell pin을 유지한다.

## 성능 시험

카메라 정지, 경계 왕복, 고속 이동, 장거리 Teleport, 메모리 압박, texture 공유, 최소 기기 프로필을 시험한다. 정지 후 중복 요청이 계속 발생하는지, unload hysteresis가 실제 I/O를 줄이는지, 활성화·Physics 등록이 프레임 spike를 만드는지 별도로 기록한다.

Godot 선택을 이유로 Texture Streaming을 조용히 P2로 밀거나 CDN 다운로드로 대체하지 않는다. 요구를 만족하지 못하면 **요구 변경 승인 또는 해당 프로필 출시 보류**가 올바른 결과다.
