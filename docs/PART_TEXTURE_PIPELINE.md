# 종족·등급·파트 텍스처 파이프라인

모든 복셀 파트는 `종족 × 등급 × 파트 타입` 기준의 고유 텍스처 세트를 사용한다. 현재 기준 수량은 테마 3종 × 등급 5종 × 파트 타입 22종(잔해 포함)으로, **330쌍(알베도 330개 + RGB 마스크 330개)** 이다.

## 파일 규약

```text
Godot/assets/parts/generated/<design_theme>/<grade>/<part_type>_albedo.png
Godot/assets/parts/generated/<design_theme>/<grade>/<part_type>_masks.png
```

예: 프로토스·하이테크 영웅 방어막 생성기:

```text
protoss_hitec/epic/shield_generator_albedo.png
protoss_hitec/epic/shield_generator_masks.png
```

`VisualTuning.part_texture_path()`가 이 경로를 계산하므로, 렌더 코드나 조립 데이터에 개별 파일 경로를 중복해 쓰지 않는다.

## RGB 마스크 계약

`part_masked_material.gdshader`에서 마스크 PNG의 채널을 다음처럼 해석한다.

| 채널 | 용도 | 값 의미 |
| --- | --- | --- |
| R | 발광 | 0은 비발광, 1은 해당 등급 색상으로 최대 발광 |
| G | Color tint | 0은 원본 알베도, 1은 종족 틴트를 최대 적용 |
| B | Roughness | 검정은 매끈함, 흰색은 거침 |

등급 색상은 발광색을, 종족 값은 색조·금속도·거칠기 범위를 결정한다. 따라서 동일한 파트 타입이라도 종족·등급 경로가 달라지면 별도 알베도와 마스크를 사용한다.

## 재생성

소스 제너레이터는 [`generate_part_texture_sets.gd`](../Godot/tools/generate_part_texture_sets.gd)다. 동일한 입력 목록에서 결정적으로 같은 파일을 생성하며, 새 종족·등급·파트 타입을 `VisualTuning` 목록에 넣은 뒤 다음 방식으로 갱신한다.

```text
Godot 콘솔 --headless --path Godot --script res://tools/generate_part_texture_sets.gd
```

생성 뒤에는 알베도·마스크가 각각 330개이고 SHA-256 중복이 없는지 확인한다. 생성에 사용한 테마 아트 기준 보드는 [part_texture_theme_reference_v1.png](../References/assets/generated/part_texture_theme_reference_v1.png)에 보관한다.

Godot의 PNG `.import` 부속 파일과 `.godot` 캐시는 로컬에서 자동 생성되므로 Git에는 원본 PNG와 제너레이터만 보관한다.
