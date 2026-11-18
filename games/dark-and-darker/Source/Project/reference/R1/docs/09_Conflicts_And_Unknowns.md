# 출처 충돌과 미복원 필드

## 충돌

| ID | 설명 A | 설명 B | 처리 | 상태 |
| --- | --- | --- | --- | --- |
| conflict.damage_smite | wiki: Smite hit location 미적용 | HF132: Smite 추가 근접 피해 hit-location 적용 | 공식 패치가 해당 예외에서 우선; 나머지 Damage 공식은 별도 검증 | resolved_by_official_patch |
| conflict.damage_head_text | Head +150% | 동일 줄 (1.5x) 및 예시는 1.5배 | 문자 퍼센트 표기 오류 의심. 수치 1.5를 후보로 보존, 자동 산식 미승인 | unresolved_text_typo |
| conflict.damage_leg_text | Leg -4% | 동일 줄 0.6x | -40% 의도 여부 실측. 원문을 자동 계산 입력으로 사용 금지 | unresolved_text_typo |
| conflict.arming_zone | 일반 무기 페이지 100/90/70 | 개별 아밍 소드 페이지 100/90 | 개별 페이지 우선 후보, 충돌 구간 실측 전 확정 차단 | unresolved |
| conflict.unique_enchants | Unique: 2개 / 수치범위 2배 | 개별 무기 VII: 최대5개 | VII=Unique로 단정하지 않고 원시 탭과 희귀도 crosswalk 분리 | unresolved |
| conflict.barbarian_berserker | 누락 HP 10%마다2% | 동일 페이지 공식은 /3 | 해당 특성 계산 데이터 제외. 기여율 실측 필요 | unresolved |
| conflict.war_cry_health_example | 오래된 Health 예시 War Cry25% | 직업 표20% | 직업 표20%를 출처 버전과 함께 채택 | resolved_by_specific_snapshot |
| conflict.quest_looted_only | 퀘스트 아이템은 Looted만 제출 | Lava Mushrooms는 Handled도 허용 | 퀘스트별 허용 상태 배열 필요. 전역 강제 금지 | resolved_by_official_exception |
| conflict.unit_movement | rating과 %, 구버전 문서 | v13은 world unit/second | 원작 rating을 v13 m/s로 직접 대입 금지 | requires_calibration |
| conflict.special_riposte_label | 공식: 일부 양손은 Impact Guard | 자동 공격 표: Special Combo Riposte라는 라벨 | 애니메이션 내부 라벨을 실제 패링 능력과 동일시하지 않음 | requires_behavior_measurement |

## 미복원

| 필드 | 사유 | 필요한 추가 증거 | 근거 |
| --- | --- | --- | --- |
| weapon_rarity_crosswalk | Item tabs I–VII와 희귀도 enum 정확한 매핑 | 클라이언트 툴팁/원본 색상·타입 확인 | [Longsword](https://darkanddarker.wiki.spellsandguns.com/Longsword) |
| weapon_path_curves | 무기 본/소켓의 프레임별 3D 궤적 | 고정 카메라·무기별 영상 또는 허가된 원본 데이터 | [Attack Times](https://darkanddarker.wiki.spellsandguns.com/Attack_Times) |
| weapon_reach | 무기별 실효 사거리 m | 충돌체와 캐릭터 자세·월드 스케일 교정 | [Spear](https://darkanddarker.wiki.spellsandguns.com/Spear) |
| weapon_hitstop | 공격·방어 재질별 hitstop 및 공격 속도 영향 | 고프레임 영상 A/B 측정 | [Attack Times](https://darkanddarker.wiki.spellsandguns.com/Attack_Times) |
| bow_timings | 롱보우 장전·당기기·발사·회복 전체 시간 | 별도 Bow 애니메이션 원본 또는 실측 | [Longbow](https://darkanddarker.wiki.spellsandguns.com/Longbow) |
| crossbow_reload | 석궁 장전 시간과 Action Speed 공식 | 기본 상태/특성별 장전 실측 | [Crossbow](https://darkanddarker.wiki.spellsandguns.com/Crossbow) |
| damage_formula_hf132 | 50% 보너스 비율의 전 구성요소 적용 순서 | 장비 보너스 단일변수 테스트 | [Hotfix #132](https://darkanddarker.com/news/230) |
| enemy_animation | 몬스터별 windup/active/recovery·회전 제한 | 등급별 공격 영상 | [Skeleton Footman](https://darkanddarker.wiki.spellsandguns.com/Skeleton_Footman) |
| enemy_aggro | 탐지·소음·위협도·대상전환·복귀 내부 규칙 | 가시/차폐/제3자 공격 실험 | [Hotfix #130](https://darkanddarker.com/news/228) |
| boss_phase_threshold | 보스별 상태/낙석 전환 조건과 내부 임계값 | 여러 회차 전투 로그; 50% 가정 금지 | [Cyclops](https://darkanddarker.wiki.spellsandguns.com/Cyclops) |
| boss_nightmare_cyclops | 사이클롭스 Nightmare 존재/수치 | 기준 패치 원본 출현 정보 | [Cyclops](https://darkanddarker.wiki.spellsandguns.com/Cyclops) |
| loot_probabilities | 상자/몬스터/던전/등급별 드롭 확률 | 개편 이후 유효 표 또는 충분한 표본 | [Longsword](https://darkanddarker.wiki.spellsandguns.com/Longsword) |
| loot_affix_pool | 아이템별 랜덤 옵션 풀·중복 제한·가중치 | 아이템 DB/대량 롤 표본 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| inventory_sizes | 아이템별 원작 가방 격자 크기·회전 가능 여부 | 원작 인벤토리 조작 실측 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| swarm_schedule | 단계 수·시간·피해량·안전영역 좌표 | 맵·모드별 전체 라운드 기록 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| light_fuel | 횃불·랜턴 희귀도별 연료·판정 반경 | 벽/고저차 포함 광원 실험 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| ante_curve | 입장료 Gear Score별 정확한 함수 | 구간별 UI 견적 샘플 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| map_module_catalog | 현재 모듈 목록·좌표·커넥터·스폰 가중치 | 현재 맵 도감과 플레이 캡처 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| quest_catalog | 전체 상인 퀘스트 목표·대사·보상·선행조건 | 현행 퀘스트 UI 직접 제공/확인 | [Hotfix #132](https://darkanddarker.com/news/230) |
| craft_recipes | 전체 제작 재료·원가·결과 옵션 | 아이콘 누락 없는 레시피 표 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| network_internals | 서버 tick·지연보정·무결성 내부 구현 | 공개 기술문서 없으므로 자체 설계로 격리 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| ai_stamina_mana | v13 공용 스태미나100·마나100의 원작 대응 | 직업별 자원 모델 확인; 공용 모델로 자동 복원 금지 | [Crypt of the Fallen v13 업로드 소스](local:DarkAndDarker_FPS_Web_v13.zip) |
| all_class_abilities | 나머지6직업의 전체 스킬·특성·주문 | 이번 데이터 범위 밖; 상세 개체별 추가 근거 필요 | [Warlock](https://darkanddarker.wiki.spellsandguns.com/Warlock) |
| armor_curves | 전체 방어구·장신구 옵션 및 Rating 감소율 곡선 | 곡선별 버전 확인과 수치 추출 필요 | [Stats](https://darkanddarker.wiki.spellsandguns.com/Stats) |
