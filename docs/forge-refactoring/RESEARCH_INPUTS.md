# 사전 연구 자료 목록과 누락분

- 점검: 2026-11-25. 사용자가 전달한 자료를 `Downloads`에서 다시 확인하고 저장소 사본과 hash를 대조했다.
- 같은 이름의 `(1)` 사본(00·90·PDF)은 원본과 SHA-256이 같아 새 자료가 아니다.

## 1. 받은 자료

| 자료 | 크기 | SHA-256 앞 16자 | 저장소 위치 | 용도 |
| --- | --- | --- | --- | --- |
| 「유니티 대비 고도 엔진 개선방안.pdf」 | 342,991 B | `043d3c4df0f646fa` | 저장소에 넣지 않음(원본은 사용자 보관) | 개선 요구의 원문. 90번 기록의 hash와 일치 |
| `00_Development_Roadmap.md` | 21,363 B | `a8ac24a28b857ff0` | [00_Development_Roadmap.md](00_Development_Roadmap.md) (이후 C# 철회 반영으로 수정됨) | 통합 로드맵 |
| `90_Source_Coverage_and_Validation.md` | 16,974 B | `5a05bf6ebc9ba267` | [90_Source_Coverage_and_Validation.md](90_Source_Coverage_and_Validation.md) (C# 철회 반영으로 수정됨) | 원문 대응·사실 보정 기록 |
| `Forge_Godot_Extension_Case_Study_20261125.md` | 41,634 B | `0737ad46d97222df` | [research/Forge_Godot_Extension_Case_Study_20261125.md](research/Forge_Godot_Extension_Case_Study_20261125.md) (원문 그대로) | Forge 유사 Godot 확장 사례 조사(2026-11-25) |

## 2. 누락된 자료

로드맵 00과 기록 90이 인용하지만 받은 자료에 없는 것이다. `Downloads`(하위 폴더 4단계, 최근 ZIP 40개 내부 포함)에서도 찾지 못했다.

| 누락 자료 | 인용 위치 | 영향 |
| --- | --- | --- |
| **개별 계획서 30개** `plans/01_GPU_Driven_Rendering.md` … `plans/30_AntiCheat_Server_Validation.md` | 00 §3 색인(링크 30개), 90 §5 "개별 계획 30개" | 각 항목의 WBS·제안 API·공수 근거·완료 기준·중단 경로가 없다. 현재 [items/](items/) 착수 문서는 00 색인과 저장소 대조로 만든 대체본이다. 00의 `plans/` 링크 30개는 깨져 있다. |
| `MANIFEST.json` | 90 §7 | 32개 Markdown의 경로·바이트·SHA-256·CRC32 목록. 원본 패키지 무결성을 대조할 수 없다. |
| `SHA256SUMS.txt` | 90 §7 | 위와 같음 |
| 원본 ZIP 패키지 | 90 §5·§7 | ZIP 자체의 크기·SHA-256과 검사 결과는 "다운로드 안내"에 있다고 적혀 있으나 받지 못했다. |
| 15 §13 Perforce·Unity VCS 부록 | 90 §2.2·§4 | 15번 계획서 안의 부록이라 계획서와 함께 누락 |

원문 PDF의 참고문헌 108개는 PDF 안에 있으며, 90 §1이 밝힌 대로 개별 재검증 대상이 아니다.

## 3. 사례 조사(2026-11-25)와 기존 결정의 관계

사례 조사는 2026-11-25 결정보다 먼저 쓰였거나 독립적으로 쓰였다. 아래 차이는 [SSOT.md](SSOT.md)의 결정이 우선한다.

| 사례 조사의 전제 | 현재 결정 | 처리 |
| --- | --- | --- |
| §1 "GDScript를 기본으로 하며 C#은 선택 사항" | D6: Lua·C# 미지원, GDScript만 | 사례 조사의 C# 관련 판단은 적용하지 않는다 |
| §5.2 "upstream Jolt를 기준 후보로" | D4: Jolt 성능 패치 4건을 포크 `Forge-Refactoring-JoltPhysics`에서 유지 | 12에서 upstream 대비 패치 유지 비용을 비교 항목으로 추가 |
| §8.3 15 협업에 Godot Co-op·Team Create 참고 | HTML/JS Studio와 Yjs 협업 폐기(2026-11-25) | 15는 웹 Godot 편집기 기준으로 새로 설계할 때 사례 조사의 scene/text operation 기준을 입력으로 쓴다 |
| §6.1 계층 표(Nakama·Edgegap·netfox) | SSOT §2: 계정·매치메이킹은 PlayHub(EOS 계획), 입장은 JoinTicket | Nakama는 29의 비교 후보로만 둔다. JoinTicket 필드는 Forge-Multiplayer 스파이크 기준 유지 |

사례 조사 §8.3(기존 계획과의 연결)과 §9(검증 제안 A·B·C)는 각 항목 착수 시 입력으로 쓴다. 해당 항목: 02, 12, 13, 15, 16, 17, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30.

## 4. 요청할 것

1. 개별 계획서 30개와 `MANIFEST.json`·`SHA256SUMS.txt`가 든 원본 ZIP.
2. ZIP을 받으면 `docs/forge-refactoring/plans/`에 넣고 MANIFEST의 SHA-256으로 대조한 뒤, 00의 링크와 [items/](items/) 착수 문서를 원본 WBS 기준으로 갱신한다.
