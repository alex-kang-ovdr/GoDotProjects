# FTL: Faster Than Light — Godot 4.7.2 Restoration (`Forge-GameDev-FTL`)

`C:\Temp\FTL\ftl.dat.vanilla` 원본 데이터 아카이브(FTL 1.6 Big-Endian `PKG\n`, 3,219개 파일)를 런타임에서 직접 읽어 복원한 Godot 4.7.2 프로젝트입니다.

## 핵심 구조

| 파일 | 역할 |
|---|---|
| `scripts/ftl_pkg.gd` | FTL 1.6 Big-Endian `PKG\n` 아카이브 순수 GDScript 리더 (`ftl.dat.vanilla` 직접 로드, PNG 텍스처·OGG/WAV 오디오·XML/TXT 캐싱, `settings.ini` 로드) |
| `scripts/ftl_database.gd` | 원본 XML(`blueprints.xml`, `autoBlueprints.xml`, `dlcBlueprints*.xml`, `text_*.xml`, `animations.xml`, `sounds.xml`, `sector_data.xml`, `events*.xml`) 및 함선 레이아웃(`.txt`/`.xml`) 파서 + 폴백 데이터셋 |
| `scripts/ftl_audio.gd` | `sounds.xml` 기반 Explore↔Battle 듀얼 스트림 동기화 크로스페이드 BGM 및 SFX 풀 |
| `scripts/ftl_ship.gd` | 35×35 선실 그리드, 문/에어락 산소 확산·진공 배기, 화재/선체 파열, 원자로·시스템 전력 배분, 이온 잠금, 방어막·회피, 무기(레이저/미사일/빔/이온/폭탄), 드론, 은폐, 승무원 BFS 이동·수리·진화·교전, 반란군 기함 3페이즈 AI |
| `scripts/ftl_sector_map.gd` | 8섹터 분기 트리(Civilian/Hostile/Nebula → Sector 8 The Last Stand), 20개 비콘 그래프, 반란군 함대 추격선 |
| `scripts/ftl_battle_view.gd` | 원본 PNG 선체·바닥·은폐·방어막·선실 내부·무기 마운트 스트립·승무원 스프라이트·화재/파열·투사체/빔 2D 렌더러 |
| `scripts/ftl_map_canvas.gd` | 성도 지도 비콘·점프 연결선·반란군 함대 추격 파동 렌더러 |
| `scripts/main.gd` | 격납고(전 함선 선택)·전술 일시정지 HUD·비콘 이벤트·상점·함선 업그레이드·세이브/이어하기 |

## 데이터 경로 탐색 순서

1. 환경 변수 `FTL_DAT_PATH`
2. `user://ftl_dat_path.txt`
3. `res://ftl.dat.vanilla` / `res://ftl.dat`
4. `C:/Temp/FTL/ftl.dat.vanilla` / `C:/Temp/FTL/ftl.dat`
5. Steam 기본 FTL 설치 경로

(`ftl.dat.vanilla`가 없는 환경에서는 내장 폴백 데이터와 프로시저럴 렌더러로 자동 동작합니다.)

## 실행 및 검증

```powershell
# Godot 4.7.2 데스크톱 실행
& "D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe" --path "D:\Github\GoDotProjects-worktrees\Forge-GameDev-FTL\forge\Templates\ftl"

# 헤드리스 복원 검증 테스트
& "D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe" --headless --path "D:\Github\GoDotProjects-worktrees\Forge-GameDev-FTL\forge\Templates\ftl" --script tests/ftl_restore_tests.gd
```
