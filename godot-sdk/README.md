# PlayHub Runtime SDK (Godot 4.7.2)

PlayHub Android APK(`:godot_runtime` `PlayHubBridge` 싱글톤)와 데스크톱/웹 테스트 환경에서 단일 GDScript 코드로 세이브·프로필·IAP·소셜 오버레이를 호출하는 런타임 전용 Autoload 스크립트입니다.

- Forge 에디터·`@tool` 의존성이 전혀 없습니다.
- Godot 프로젝트의 **Project Settings → Autoload**에 `playhub_runtime_sdk.gd`를 `PlayHubSDK`로 등록해 사용합니다.

```gdscript
func _ready() -> void:
	PlayHubSDK.host_paused.connect(_on_pause)
	PlayHubSDK.host_snapshot_requested.connect(_on_save_snapshot)
	PlayHubSDK.notify_ready()
	var profile := PlayHubSDK.get_profile()
	print("Player:", profile.get("displayName"), "Guest:", profile.get("isGuest"))
```
