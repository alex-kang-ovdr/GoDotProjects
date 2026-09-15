# 산출물 및 이식 상태

## 현재 기준 산출물

- [Godot 프로젝트](../Godot/) — 실행 소스, 씬, export preset.
- [GDScript 밸런스](../Godot/scripts/balance.gd) / [시각 튜닝](../Godot/scripts/visual_tuning.gd) — 분리된 단일 소스.
- [헤드리스 규칙 테스트](../Godot/tests/test_runner.gd) — 기본 질량·방어막·탄약·다칸 장착·연결 분리·탄약고 병합.
- [GDScript SSOT 이식 계획](GDSCRIPT_SSOT_MIGRATION.md) — 마일스톤과 레거시 제거 경계.
- [Cosmoteer 시각 레퍼런스](../References/COSMOTEER_VISUAL_ANALYSIS.md) — 링크/분석만 보관하며 원본 에셋은 포함하지 않음.

## 검증 상태

- **자동 통과**: Godot 4.7.2 헤드리스 런타임, GDScript 규칙 테스트.
- **자동 미검증**: Windows/Web/Android export template가 설치된 환경의 실제 내보내기.
- **수동 미검증**: Windows EXE, Web HTTPS, Android 설치·입력·성능, 30분 항로 밸런스.

## 제거한 레거시

HTML Canvas 게임, JavaScript SSOT, Node 모의 런타임 테스트, PWA 서비스 워커, Capacitor Android 래퍼, Electron portable 래퍼를 제거했다. 따라서 이전 문서의 “웹 구현 완료” 표시는 현재 실행 상태를 뜻하지 않으며, 이 문서와 [이식 계획](GDSCRIPT_SSOT_MIGRATION.md)이 우선한다.
