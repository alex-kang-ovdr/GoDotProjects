# 시각 튜닝 단일 소스 관리

시각 연출 값은 [Godot/scripts/visual_tuning.gd](../Godot/scripts/visual_tuning.gd)에서만 관리한다. 게임 난이도·피해·탄약·질량처럼 플레이 규칙을 바꾸는 수치는 [밸런스 단일 소스](BALANCE_GUIDE.md)에 남긴다.

현재 시각 튜닝 항목은 `SHIELD_LAYER_OPACITY`다. 배열의 인덱스 `0~5`는 현재 방어막 레이어 수와 정확히 대응한다. 이는 현재 레이어/가능 레이어 비율이 아니라 **현재 레이어 수별 고정 불투명도**다.

변경 뒤에는 자동화 `runtime` 스위트를 실행하고, Godot 수동 RHI 창에서 방어막 1~5 레이어의 대비와 가독성을 확인한다.
