# AI 중심 Lua 제작·검증 파이프라인

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## AI 작업 흐름

요구사항 → Reflection/World/Asset Query → 작업 계획 → Dry-run → Lua/Prefab/Actor 변경 → ChangeSet → 정적 검사 → PIE 테스트 → 사용자 승인 → Git Commit. AI가 별도 데이터 저장소를 갖지 않는다.

## 공통 API 범위

World/Actor/Component, Physics/Trigger, Timer, FName/GameplayTag, FLocText, UI, Audio, Navigation, Animation, RPC/Replication, PlayerData, Analytics, SafeTeleport, Online. Lua 5.4만 게임플레이 스크립트로 사용.

## Lua 예시

```lua
local Door = {}
function Door:OnBeginPlay()
  self.Trigger.OnEnter:Connect(function(other)
    if not World.IsAuthority() or not other:HasTag("Role.Player") then return end
    Timer.After(2.0, function() if self:IsValid() then self:Open() end end)
  end)
end
return Door
```
위 API 이름은 설계 예시로 최종 Reflection 바인딩에 맞춰 생성한다.

## 보안

Lua 샌드박스: 파일·OS·네트워크 임의 접근 금지, CPU 명령/시간·메모리·Spawn·RPC Rate Limit, 서버 권한 분리, 서명된 API Capability. AI 결과는 자동 공개 금지.

## 자동 검증

Syntax → Reflection API 존재 검사 → 참조 유효성 → 권한 → Lua Budget → Single PIE → Listen/Dedicated PIE → 네트워크 지연·패킷 손실 → 성능 리포트. 실패 로그를 AI에 전달하되 수정은 새 ChangeSet으로 남긴다.

## AI 품질 지표

생성 후 첫 PIE 성공률, 자동 수정 반복 횟수, 리뷰 수락률, 회귀 테스트 통과율, 승인까지 걸린 시간, AI가 발생시킨 권한 오류 비율.