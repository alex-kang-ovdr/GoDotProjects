# 멀티플레이 PIE · EOS · 매치메이킹

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## 테스트 모드

Single, Listen(Authority World에 Host 직접 참여), Dedicated, Multi-client 2~8, Network Emulation(지연·손실·대역폭), Bot Load. 프로덕션과 동일 Replication Descriptor 및 GameplayTag Dictionary 사용.

## 온라인 책임

EOS Connect/Session/Lobby/Voice/EAC(지원 PC만)는 외부 서비스 Adapter. PlayForge는 Matchmaker, Join Token, Dedicated Room Allocator, Server Authority, Replication, PlayerData, 신고·제재 정책을 담당한다. EOS는 완성형 MMR 매치메이커가 아니다.

## 매치 상태

`Searching → Reserved → Assigned → Connecting → InitialSync → CollisionReady → ClientReady → ServerStartPlay → Playing`. 각 단계는 Epoch·Timeout·재시도·취소를 갖는다.

## Initial Play Barrier

서버가 필수 Actor/Property와 Collision Cell 집합을 고정된 Snapshot Epoch로 지정한다. 클라이언트는 수신뿐 아니라 실제 적용·Physics Query Ready까지 확인하고 Ready ACK. 서버가 검증해 StartPlay 승인. Texture 고해상도 Mip은 대기 대상 아님.

## Teleport

장거리 Teleport는 목적지 Collision Cell Pin → Physics 등록/Query Ready → 안전 Spawn 검사 → 목적지 Replication Barrier → 서버 Commit → 클라이언트 보간/예측 초기화. 실패 시 기존 위치 유지.

## Live Changes

Transform/Material Parameter는 Hot Apply; Lua 본문은 안전한 Hot Reload; Collider는 Body Recreate; Reflection/RPC Schema 변경은 PIE Restart. Cook Task Hash로 영향 범위만 갱신.

## 검증

서버 Room 슬롯 중복 배정 없음, Epoch 지연 패킷 무시, ClientReady 전 입력 서버 거부, Voice 장애 시 게임 유지, Listen Host Loopback 미사용.