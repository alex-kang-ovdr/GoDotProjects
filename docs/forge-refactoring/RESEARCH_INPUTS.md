# 사전 연구 자료와 원본 패키지 검증 기록

- 점검: 2026-11-25. 사용자가 전달한 자료를 `Downloads`에서 다시 확인하고 저장소 사본과 hash를 대조했다.
- 같은 이름의 `(1)` 사본(00·90·PDF)은 원본과 SHA-256이 같아 새 자료가 아니다.

## 1. 받은 자료

| 자료 | 크기 | SHA-256 앞 16자 | 저장소 위치 | 용도 |
| --- | --- | --- | --- | --- |
| 「유니티 대비 고도 엔진 개선방안.pdf」 | 342,991 B | `043d3c4df0f646fa` | 저장소에 넣지 않음(원본은 사용자 보관) | 개선 요구의 원문. 90번 기록의 hash와 일치 |
| `00_Development_Roadmap.md` | 21,363 B | `a8ac24a28b857ff0` | [00_Development_Roadmap.md](00_Development_Roadmap.md) (이후 C# 철회 반영으로 수정됨) | 통합 로드맵 |
| `90_Source_Coverage_and_Validation.md` | 16,974 B | `5a05bf6ebc9ba267` | [90_Source_Coverage_and_Validation.md](90_Source_Coverage_and_Validation.md) (C# 철회 반영으로 수정됨) | 원문 대응·사실 보정 기록 |
| `Forge_Godot_Extension_Case_Study_20261125.md` | 41,634 B | `0737ad46d97222df` | [research/Forge_Godot_Extension_Case_Study_20261125.md](research/Forge_Godot_Extension_Case_Study_20261125.md) (원문 그대로) | Forge 유사 Godot 확장 사례 조사(2026-11-25) |

## 2. 원본 패키지 검증 (2026-11-25)

첨부한 `Godot_Improvement_Development_Plans_20261124.zip`은 174,498바이트이며 SHA-256은 `a25e003c034eeb9e4283b2b97cc41003218b1f19dde9b7fe7b91db65db513827`이다.

- ZIP의 Markdown 32개(로드맵·검증 기록·개별 계획 30개)의 길이, SHA-256, CRC32가 [MANIFEST.json](MANIFEST.json)과 일치했다. MANIFEST를 포함한 33개 파일의 SHA-256도 [SHA256SUMS.txt](SHA256SUMS.txt)와 일치했다. 두 목록의 기준은 11월 24일 ZIP 안의 원본이다.
- [개별 계획서](plans/)는 원본 바이트로 반입했다. [15번 계획 §13](plans/15_Collaboration_VCS_Review.md)에 Perforce·Unity VCS 부록이 있다.
- 저장소의 00·90은 11월 25일 결정을 반영한 편집본이다. 현재 로드맵은 활성 계획 27개를 연결하며 10·11·20은 철회 상태다. 작업 범위와 담당 브랜치는 [SSOT](SSOT.md)와 [착수 문서](items/)를 따른다.

## 3. 사례 조사(2026-11-25)와 기존 결정의 관계

사례 조사는 2026-11-25 결정보다 먼저 쓰였거나 독립적으로 쓰였다. 아래 차이는 [SSOT.md](SSOT.md)의 결정이 우선한다.

| 사례 조사의 전제 | 현재 결정 | 처리 |
| --- | --- | --- |
| §1 "GDScript를 기본으로 하며 C#은 선택 사항" | D6: Lua·C# 미지원, GDScript만 | 사례 조사의 C# 관련 판단은 적용하지 않는다 |
| §5.2 "upstream Jolt를 기준 후보로" | D4: Jolt 성능 패치 4건을 포크 `Forge-Refactoring-JoltPhysics`에서 유지 | 12에서 upstream 대비 패치 유지 비용을 비교 항목으로 추가 |
| §8.3 15 협업에 Godot Co-op·Team Create 참고 | HTML/JS Studio와 Yjs 협업 폐기(2026-11-25) | 15는 웹 Godot 편집기 기준으로 새로 설계할 때 사례 조사의 scene/text operation 기준을 입력으로 쓴다 |
| §6.1 계층 표(Nakama·Edgegap·netfox) | SSOT §2: 계정·매치메이킹은 PlayHub(EOS 계획), 입장은 JoinTicket | Nakama는 29의 비교 후보로만 둔다. JoinTicket 필드는 Forge-Multiplayer 스파이크 기준 유지 |

사례 조사 §8.3(기존 계획과의 연결)과 §9(검증 제안 A·B·C)는 각 항목 착수 시 입력으로 쓴다. 해당 항목: 02, 12, 13, 15, 16, 17, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30.

## 4. 처리 결과

원본 ZIP과 30개 계획서는 §2의 검증을 마쳐 이 저장소에 반입했다. 00 로드맵과 [items/](items/) 착수 문서는 현재 결정과 원본 WBS 연결을 반영한다.
