# 14. DST 전수 데이터 카탈로그 및 12인 스킬트리 상세 부록

> 상위 문서: [00. 목차](00_index.md) | 기계 판독 JSON: [dst_catalog.json](data/dst_catalog.json) | 추출 도구: [extract_dst_catalog.py](tools/extract_dst_catalog.py)
> 기준 빌드: Steam `buildid 26797476` · `version 763928` · Manifest `55127838891314407` (`[데이터 확인]`)

---

## 1. 전수 카탈로그 통계 요약

| 항목 | 추출 수량 | JSON 키 |
|---|---:|---|
| `prefabs` | **1,621** | `counts.prefabs` |
| `components` | **835** | `counts.components` |
| `stategraphs` | **264** | `counts.stategraphs` |
| `brains` | **199** | `counts.brains` |
| `actions` | **308** | `counts.actions` |
| `tech_trees` | **46** | `counts.tech_trees` |
| `recipes` | **958** | `counts.recipes` |
| `deconstruct_recipes` | **150** | `counts.deconstruct_recipes` |
| `prototypers` | **37** | `counts.prototypers` |
| `prototyper_aliases` | **9** | `counts.prototyper_aliases` |
| `world_tiles` | **78** | `counts.world_tiles` |
| `shaders` | **70** | `counts.shaders` |
| `characters` | **19** | `counts.characters` |
| `skilltree_characters` | **12** | `counts.skilltree_characters` |
| `foods_normal` | **68** | `counts.foods_normal` |
| `foods_warly` | **11** | `counts.foods_warly` |
| `farm_crops` | **14** | `counts.farm_crops` |
| `wx78_modules` | **23** | `counts.wx78_modules` |

---

## 2. 958개 레시피(`Recipe2`) 테크트리·필터 분포

### 2.1 상위 테크트리별 레시피 수

| 테크 요구 조건 | 레시피 수 |
|---|---:|
| `TECH.NONE` | 208 |
| `TECH.LOST` | 147 |
| `TECH.SCIENCE_TWO` | 112 |
| `TECH.SCIENCE_ONE` | 64 |
| `TECH.CARNIVAL_GOLFPROPS_ONE` | 28 |
| `TECH.ROBOTMODULECRAFT_ONE` | 23 |
| `TECH.CARNIVAL_PRIZESHOP_ONE` | 21 |
| `TECH.MAGIC_TWO` | 18 |
| `TECH.RABBITOFFERING_THREE` | 18 |
| `TECH.WINTERSFEASTCOOKING_ONE` | 18 |
| `TECH.SEAFARING_ONE` | 16 |
| `TECH.TURFCRAFTING_TWO` | 15 |
| `TECH.SHADOWFORGING_TWO` | 14 |
| `TECH.FISHING_ONE` | 14 |
| `TECH.LUNARFORGING_TWO` | 13 |
| `TECH.DRAGONOFFERING_THREE` | 13 |
| `TECH.CARNIVAL_HOSTSHOP_THREE` | 13 |
| `TECH.ANCIENT_TWO` | 12 |
| `TECH.CARRATOFFERING_THREE` | 12 |
| `TECH.MAGIC_THREE` | 11 |
| `TECH.CARPENTRY_TWO` | 11 |
| `TECH.ORPHANAGE_ONE` | 10 |
| `TECH.CELESTIAL_THREE` | 9 |
| `TECH.ANCIENT_FOUR` | 8 |
| `TECH.WAGPUNK_WORKSTATION_TWO` | 8 |

### 2.2 크래프팅 필터별 레시피 수

| 필터 | 레시피 수 |
|---|---:|

---

## 3. 12인 캐릭터 스킬트리 상세 노드 목록 (`skilltree_*.lua`)

### 3.1 `walter` — 스킬 17개 / 잠금 13개 (브랜치: camping, slingshotammo, slingshotmods, woby)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `slingshotmods` | `walter_ammo_shattershots` |  | 잠금(Lock) |  |
| `slingshotmods` | `walter_slingshot_handles` |  | 스킬 |  |
| `slingshotmods` | `walter_slingshot_bands` |  | 스킬 |  |
| `slingshotmods` | `walter_slingshot_frames` |  | 스킬 |  |
| `slingshotammo` | `walter_ammo_shattershots` |  | 루트(Root) |  |
| `slingshotammo` | `walter_ammo_lucky` |  | 루트(Root) |  |
| `slingshotammo` | `walter_ammo_utility` |  | 루트(Root) |  |
| `slingshotammo` | `walter_ammo_efficiency` |  | 잠금(Lock) |  |
| `slingshotammo` | `walter_ammo_bag` |  | 잠금(Lock) |  |
| `slingshotammo` | `walter_ammo_shadow_lock` |  | 잠금(Lock) |  |
| `slingshotammo` | `walter_ammo_shadow` |  | 잠금(Lock) |  |
| `slingshotammo` | `walter_ammo_lunar_lock` |  | 잠금(Lock) |  |
| `slingshotammo` | `walter_ammo_lunar` |  | 잠금(Lock) |  |
| `woby` | `walter_woby_sprint` |  | 잠금(Lock) |  |
| `woby` | `walter_woby_dash` |  | 스킬 |  |
| `woby` | `walter_woby_shadow_lock` |  | 잠금(Lock) |  |
| `woby` | `walter_woby_shadow` |  | 잠금(Lock) |  |
| `woby` | `walter_woby_lunar_lock` |  | 잠금(Lock) |  |
| `woby` | `walter_woby_lunar` |  | 잠금(Lock) |  |
| `woby` | `walter_woby_endurance` |  | 루트(Root) |  |
| `woby` | `walter_woby_taskaid` |  | 루트(Root) |  |
| `woby` | `walter_woby_foraging` |  | 루트(Root) |  |
| `woby` | `walter_woby_itemfetcher` |  | 루트(Root) |  |
| `camping` | `walter_camp_fire` |  | 루트(Root) |  |
| `camping` | `walter_camp_rope` |  | 루트(Root) |  |
| `camping` | `walter_camp_firstaid` |  | 루트(Root) |  |
| `camping` | `walter_camp_walterhat` |  | 루트(Root) |  |
| `camping` | `walter_camp_wobytreat` |  | 루트(Root) |  |
| `camping` | `walter_camp_wobyholder` |  | 루트(Root) |  |
| `camping` | `walter_camp_wobycourier` |  | 잠금(Lock) |  |

### 3.2 `wathgrithr` — 스킬 21개 / 잠금 6개 (브랜치: arsenal, beefalo, combat, songs)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `arsenal` | `wathgrithr_arsenal_spear_1` |  | 루트(Root) | `wathgrithr_arsenal_spear_2` |
| `arsenal` | `wathgrithr_arsenal_spear_2` |  | 스킬 | `wathgrithr_arsenal_spear_3` |
| `arsenal` | `wathgrithr_arsenal_spear_3` |  | 스킬 |  |
| `arsenal` | `wathgrithr_arsenal_spear_4` |  | 스킬 |  |
| `arsenal` | `wathgrithr_arsenal_spear_5` |  | 스킬 |  |
| `arsenal` | `wathgrithr_arsenal_helmet_1` |  | 루트(Root) | `wathgrithr_arsenal_helmet_2` |
| `arsenal` | `wathgrithr_arsenal_helmet_2` |  | 스킬 | `wathgrithr_arsenal_helmet_3` |
| `arsenal` | `wathgrithr_arsenal_helmet_3` |  | 스킬 |  |
| `arsenal` | `wathgrithr_arsenal_helmet_4` |  | 스킬 |  |
| `arsenal` | `wathgrithr_arsenal_helmet_5` |  | 스킬 |  |
| `arsenal` | `wathgrithr_arsenal_shield_1` |  | 스킬 |  |
| `arsenal` | `wathgrithr_arsenal_shield_2` |  | 스킬 |  |
| `arsenal` | `wathgrithr_arsenal_shield_3` |  | 스킬 |  |
| `beefalo` | `wathgrithr_beefalo_1` |  | 루트(Root) | `wathgrithr_beefalo_2` |
| `beefalo` | `wathgrithr_beefalo_2` |  | 스킬 | `wathgrithr_beefalo_3` |
| `beefalo` | `wathgrithr_beefalo_3` |  | 스킬 | `wathgrithr_beefalo_saddle` |
| `beefalo` | `wathgrithr_beefalo_saddle` |  | 스킬 |  |
| `songs` | `wathgrithr_songs_instantsong_cd_lock` |  | 잠금(Lock) | `wathgrithr_songs_instantsong_cd` |
| `songs` | `wathgrithr_songs_instantsong_cd` |  | 스킬 |  |
| `songs` | `wathgrithr_songs_container_lock` |  | 잠금(Lock) | `wathgrithr_songs_container` |
| `songs` | `wathgrithr_songs_container` |  | 스킬 |  |
| `songs` | `wathgrithr_songs_revivewarrior_lock` |  | 잠금(Lock) | `wathgrithr_songs_revivewarrior` |
| `songs` | `wathgrithr_songs_revivewarrior` |  | 스킬 |  |
| `combat` | `wathgrithr_combat_defense` |  | 루트(Root) |  |
| `allegiance` | `wathgrithr_allegiance_lock_1` |  | 잠금(Lock) |  |
| `allegiance` | `wathgrithr_allegiance_shadow` |  | 잠금(Lock) |  |
| `allegiance` | `wathgrithr_allegiance_lunar` |  | 잠금(Lock) |  |

### 3.3 `wendy` — 스킬 25개 / 잠금 0개 (브랜치: default)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `default` | `wendy_sisturn_1` |  | 루트(Root) |  |
| `default` | `wendy_sisturn_2` |  | 스킬 |  |
| `default` | `wendy_sisturn_3` |  | 스킬 |  |
| `default` | `wendy_potion_container` |  | 루트(Root) |  |
| `default` | `wendy_potion_revive` |  | 스킬 |  |
| `default` | `wendy_potion_duration` |  | 스킬 |  |
| `default` | `wendy_potion_yield` |  | 스킬 |  |
| `default` | `wendy_avenging_ghost` |  | 루트(Root) |  |
| `default` | `wendy_smallghost_1` |  | 루트(Root) |  |
| `default` | `wendy_smallghost_2` |  | 스킬 |  |
| `default` | `wendy_smallghost_3` |  | 스킬 |  |
| `default` | `wendy_ghostflower_butterfly` |  | 루트(Root) |  |
| `default` | `wendy_ghostflower_hat` |  | 스킬 |  |
| `default` | `wendy_ghostflower_grave` |  | 스킬 |  |
| `default` | `wendy_gravestone_1` |  | 루트(Root) |  |
| `default` | `wendy_makegravemounds` |  | 스킬 |  |
| `default` | `wendy_ghostcommand_1` |  | 스킬 |  |
| `default` | `wendy_ghostcommand_2` |  | 스킬 |  |
| `default` | `wendy_ghostcommand_3` |  | 스킬 |  |
| `default` | `wendy_shadow_1` |  | 스킬 |  |
| `default` | `wendy_shadow_2` |  | 스킬 |  |
| `default` | `wendy_shadow_3` |  | 스킬 |  |
| `default` | `wendy_lunar_1` |  | 스킬 |  |
| `default` | `wendy_lunar_2` |  | 스킬 |  |
| `default` | `wendy_lunar_3` |  | 스킬 |  |

### 3.4 `willow` — 스킬 24개 / 잠금 8개 (브랜치: allegiance, bernie, lighter)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `lighter` | `willow_controlled_burn_1` |  | 루트(Root) |  |
| `lighter` | `willow_controlled_burn_2` |  | 스킬 |  |
| `lighter` | `willow_controlled_burn_3` |  | 스킬 |  |
| `lighter` | `willow_attuned_lighter` |  | 스킬 |  |
| `lighter` | `willow_embers` |  | 스킬 |  |
| `lighter` | `willow_fire_burst` |  | 스킬 |  |
| `lighter` | `willow_fire_ball` |  | 스킬 |  |
| `lighter` | `willow_fire_frenzy` |  | 스킬 |  |
| `lighter` | `willow_lightradius_1` |  | 루트(Root) |  |
| `lighter` | `willow_lightradius_2` |  | 스킬 |  |
| `bernie` | `willow_bernieregen_1` |  | 루트(Root) | `willow_bernieregen_2` |
| `bernie` | `willow_bernieregen_2` |  | 스킬 |  |
| `bernie` | `willow_berniesanity_1` |  | 루트(Root) |  |
| `bernie` | `willow_berniesanity_2` |  | 스킬 | `willow_bernieai` |
| `bernie` | `willow_bernieai` |  | 스킬 |  |
| `bernie` | `willow_berniespeed_1` |  | 루트(Root) |  |
| `bernie` | `willow_berniespeed_2` |  | 스킬 |  |
| `bernie` | `willow_bernie_lock` |  | 잠금(Lock) |  |
| `bernie` | `willow_berniehealth_1` |  | 스킬 |  |
| `bernie` | `willow_berniehealth_2` |  | 스킬 |  |
| `bernie` | `willow_bernie_lock_2` |  | 잠금(Lock) |  |
| `bernie` | `willow_burnignbernie` |  | 스킬 |  |
| `allegiance` | `willow_allegiance_lock_1` |  | 잠금(Lock) |  |
| `allegiance` | `willow_allegiance_lock_2` |  | 잠금(Lock) |  |
| `allegiance` | `willow_allegiance_lock_3` |  | 잠금(Lock) |  |
| `allegiance` | `willow_allegiance_shadow_fire` |  | 스킬 |  |
| `allegiance` | `willow_allegiance_shadow_bernie` |  | 스킬 |  |
| `allegiance` | `willow_allegiance_lock_4` |  | 잠금(Lock) |  |
| `allegiance` | `willow_allegiance_lock_5` |  | 잠금(Lock) |  |
| `allegiance` | `willow_allegiance_lock_6` |  | 잠금(Lock) |  |
| `allegiance` | `willow_allegiance_lunar_fire` |  | 스킬 |  |
| `allegiance` | `willow_allegiance_lunar_bernie` |  | 스킬 |  |

### 3.5 `wilson` — 스킬 26개 / 잠금 7개 (브랜치: alchemy, allegiance, beard, torch)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `alchemy` | `wilson_alchemy_1` |  | 루트(Root) |  |
| `alchemy` | `wilson_alchemy_2` |  | 스킬 |  |
| `alchemy` | `wilson_alchemy_5` |  | 스킬 |  |
| `alchemy` | `wilson_alchemy_6` |  | 스킬 |  |
| `alchemy` | `wilson_alchemy_3` |  | 스킬 |  |
| `alchemy` | `wilson_alchemy_7` |  | 스킬 |  |
| `alchemy` | `wilson_alchemy_8` |  | 스킬 |  |
| `alchemy` | `wilson_alchemy_4` |  | 스킬 |  |
| `alchemy` | `wilson_alchemy_9` |  | 스킬 |  |
| `alchemy` | `wilson_alchemy_10` |  | 스킬 |  |
| `torch` | `wilson_torch_1` |  | 루트(Root) |  |
| `torch` | `wilson_torch_2` |  | 스킬 |  |
| `torch` | `wilson_torch_3` |  | 스킬 |  |
| `torch` | `wilson_torch_4` |  | 루트(Root) |  |
| `torch` | `wilson_torch_5` |  | 스킬 |  |
| `torch` | `wilson_torch_6` |  | 스킬 |  |
| `torch` | `wilson_torch_lock_1` |  | 잠금(Lock) |  |
| `torch` | `wilson_torch_7` |  | 스킬 |  |
| `beard` | `wilson_beard_1` |  | 루트(Root) |  |
| `beard` | `wilson_beard_2` |  | 스킬 |  |
| `beard` | `wilson_beard_3` |  | 스킬 |  |
| `beard` | `wilson_beard_4` |  | 루트(Root) |  |
| `beard` | `wilson_beard_5` |  | 스킬 |  |
| `beard` | `wilson_beard_6` |  | 스킬 |  |
| `beard` | `wilson_beard_lock_1` |  | 잠금(Lock) |  |
| `beard` | `wilson_beard_7` |  | 스킬 |  |
| `allegiance` | `wilson_allegiance_lock_1` |  | 잠금(Lock) |  |
| `allegiance` | `wilson_allegiance_lock_2` |  | 잠금(Lock) |  |
| `allegiance` | `wilson_allegiance_lock_4` |  | 잠금(Lock) |  |
| `allegiance` | `wilson_allegiance_shadow` |  | 스킬 |  |
| `allegiance` | `wilson_allegiance_lock_3` |  | 잠금(Lock) |  |
| `allegiance` | `wilson_allegiance_lock_5` |  | 잠금(Lock) |  |
| `allegiance` | `wilson_allegiance_lunar` |  | 스킬 |  |

### 3.6 `winona` — 스킬 26개 / 잠금 7개 (브랜치: charlie, lowshelf, midshelf, wagstaff)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `lowshelf` | `winona_spotlight_heated` |  | 루트(Root) |  |
| `lowshelf` | `winona_spotlight_range` |  | 루트(Root) |  |
| `lowshelf` | `winona_portable_structures` |  | 루트(Root) |  |
| `lowshelf` | `winona_gadget_recharge` |  | 스킬 |  |
| `lowshelf` | `winona_battery_idledrain` |  | 루트(Root) |  |
| `lowshelf` | `winona_lowshelf_lock` |  | 잠금(Lock) |  |
| `midshelf` | `winona_catapult_speed_1` |  | 스킬 |  |
| `midshelf` | `winona_catapult_speed_2` |  | 스킬 |  |
| `midshelf` | `winona_catapult_speed_3` |  | 스킬 |  |
| `midshelf` | `winona_catapult_aoe_1` |  | 스킬 |  |
| `midshelf` | `winona_catapult_aoe_2` |  | 스킬 |  |
| `midshelf` | `winona_catapult_aoe_3` |  | 스킬 |  |
| `midshelf` | `winona_battery_efficiency_1` |  | 스킬 |  |
| `midshelf` | `winona_battery_efficiency_2` |  | 스킬 |  |
| `midshelf` | `winona_battery_efficiency_3` |  | 스킬 |  |
| `midshelf` | `winona_portable_structures_lock` |  | 잠금(Lock) |  |
| `midshelf` | `winona_catapult_volley_1` |  | 스킬 |  |
| `midshelf` | `winona_catapult_boost_1` |  | 스킬 |  |
| `midshelf` | `winona_midshelf_lock` |  | 잠금(Lock) |  |
| `charlie` | `winona_shadow_1` |  | 스킬 |  |
| `charlie` | `winona_shadow_2` |  | 스킬 |  |
| `charlie` | `winona_shadow_3_lock` |  | 잠금(Lock) |  |
| `charlie` | `winona_shadow_3` |  | 스킬 |  |
| `charlie` | `winona_charlie_1` |  | 스킬 |  |
| `charlie` | `winona_charlie_2_lock` |  | 잠금(Lock) |  |
| `charlie` | `winona_charlie_2` |  | 스킬 |  |
| `wagstaff` | `winona_lunar_1` |  | 스킬 |  |
| `wagstaff` | `winona_lunar_2` |  | 스킬 |  |
| `wagstaff` | `winona_lunar_3_lock` |  | 잠금(Lock) |  |
| `wagstaff` | `winona_lunar_3` |  | 스킬 |  |
| `wagstaff` | `winona_wagstaff_1` |  | 스킬 |  |
| `wagstaff` | `winona_wagstaff_2_lock` |  | 잠금(Lock) |  |
| `wagstaff` | `winona_wagstaff_2` |  | 스킬 |  |

### 3.7 `wolfgang` — 스킬 25개 / 잠금 4개 (브랜치: allegiance, might, planardamage, training)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `might` | `wolfgang_critwork_1` |  | 루트(Root) |  |
| `might` | `wolfgang_critwork_2` |  | 스킬 |  |
| `might` | `wolfgang_critwork_3` |  | 스킬 |  |
| `training` | `wolfgang_autogym` |  | 루트(Root) |  |
| `training` | `wolfgang_normal_coach` |  | 루트(Root) |  |
| `training` | `wolfgang_normal_speed` |  | 스킬 |  |
| `training` | `wolfgang_dumbbell_crafting` |  | 루트(Root) |  |
| `training` | `wolfgang_dumbbell_throwing_1` |  | 스킬 |  |
| `training` | `wolfgang_dumbbell_throwing_2` |  | 스킬 |  |
| `training` | `wolfgang_overbuff_1` |  | 루트(Root) |  |
| `training` | `wolfgang_overbuff_2` |  | 스킬 |  |
| `training` | `wolfgang_overbuff_3` |  | 스킬 |  |
| `training` | `wolfgang_overbuff_4` |  | 스킬 |  |
| `training` | `wolfgang_overbuff_5` |  | 스킬 |  |
| `planardamage` | `wolfgang_planardamage_1` |  | 루트(Root) |  |
| `planardamage` | `wolfgang_planardamage_2` |  | 스킬 |  |
| `planardamage` | `wolfgang_planardamage_3` |  | 스킬 |  |
| `planardamage` | `wolfgang_planardamage_4` |  | 스킬 |  |
| `planardamage` | `wolfgang_planardamage_5` |  | 스킬 |  |
| `allegiance` | `wolfgang_allegiance_lock_1` |  | 잠금(Lock) |  |
| `allegiance` | `wolfgang_allegiance_lock_2` |  | 잠금(Lock) |  |
| `allegiance` | `wolfgang_allegiance_lock_3` |  | 잠금(Lock) |  |
| `allegiance` | `wolfgang_allegiance_lock_4` |  | 잠금(Lock) |  |
| `allegiance` | `wolfgang_allegiance_shadow_1` |  | 스킬 |  |
| `allegiance` | `wolfgang_allegiance_shadow_2` |  | 스킬 |  |
| `allegiance` | `wolfgang_allegiance_shadow_3` |  | 스킬 |  |
| `allegiance` | `wolfgang_allegiance_lunar_1` |  | 스킬 |  |
| `allegiance` | `wolfgang_allegiance_lunar_2` |  | 스킬 |  |
| `allegiance` | `wolfgang_allegiance_lunar_3` |  | 스킬 |  |

### 3.8 `woodie` — 스킬 25개 / 잠금 7개 (브랜치: curse, human)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `curse` | `woodie_curse_weremeter_1` |  | 루트(Root) |  |
| `curse` | `woodie_curse_weremeter_2` |  | 스킬 |  |
| `curse` | `woodie_curse_weremeter_3` |  | 스킬 |  |
| `curse` | `woodie_curse_master_lock` |  | 잠금(Lock) |  |
| `curse` | `woodie_curse_master` |  | 스킬 |  |
| `curse` | `woodie_curse_beaver_1` |  | 루트(Root) |  |
| `curse` | `woodie_curse_beaver_2` |  | 스킬 |  |
| `curse` | `woodie_curse_beaver_3` |  | 스킬 |  |
| `curse` | `woodie_curse_beaver_lock` |  | 잠금(Lock) |  |
| `curse` | `woodie_curse_epic_beaver` |  | 스킬 |  |
| `curse` | `woodie_curse_moose_1` |  | 루트(Root) |  |
| `curse` | `woodie_curse_moose_2` |  | 스킬 |  |
| `curse` | `woodie_curse_moose_3` |  | 스킬 |  |
| `curse` | `woodie_curse_moose_lock` |  | 잠금(Lock) |  |
| `curse` | `woodie_curse_epic_moose` |  | 스킬 |  |
| `curse` | `woodie_curse_goose_1` |  | 루트(Root) |  |
| `curse` | `woodie_curse_goose_2` |  | 스킬 |  |
| `curse` | `woodie_curse_goose_3` |  | 스킬 |  |
| `curse` | `woodie_curse_goose_lock` |  | 잠금(Lock) |  |
| `curse` | `woodie_curse_epic_goose` |  | 스킬 |  |
| `human` | `woodie_human_lucy_1` |  | 루트(Root) |  |
| `human` | `woodie_human_lucy_2` |  | 스킬 |  |
| `human` | `woodie_human_lucy_3` |  | 스킬 |  |
| `human` | `woodie_human_quickpicker_1` |  | 루트(Root) |  |
| `human` | `woodie_human_quickpicker_2` |  | 스킬 |  |
| `human` | `woodie_human_quickpicker_3` |  | 스킬 |  |
| `human` | `woodie_human_treeguard_1` |  | 루트(Root) |  |
| `human` | `woodie_human_treeguard_2` |  | 스킬 |  |
| `human` | `woodie_human_treeguard_max` |  | 스킬 |  |
| `allegiance` | `woodie_allegiance_lock_1` |  | 잠금(Lock) |  |
| `allegiance` | `woodie_allegiance_shadow` |  | 잠금(Lock) |  |
| `allegiance` | `woodie_allegiance_lunar` |  | 잠금(Lock) |  |

### 3.9 `wormwood` — 스킬 26개 / 잠금 2개 (브랜치: allegiance1, allegiance2, crafting, gathering)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `gathering` | `wormwood_identify_plants2` |  | 루트(Root) |  |
| `crafting` | `wormwood_saplingcrafting` |  | 스킬 |  |
| `crafting` | `wormwood_berrybushcrafting` |  | 스킬 |  |
| `crafting` | `wormwood_juicyberrybushcrafting` |  | 스킬 |  |
| `crafting` | `wormwood_reedscrafting` |  | 스킬 |  |
| `crafting` | `wormwood_lureplantbulbcrafting` |  | 스킬 |  |
| `crafting` | `wormwood_mushroomplanter_ratebonus1` |  | 스킬 |  |
| `crafting` | `wormwood_mushroomplanter_ratebonus2` |  | 스킬 |  |
| `crafting` | `wormwood_mushroomplanter_upgrade` |  | 스킬 |  |
| `crafting` | `wormwood_moon_cap_eating` |  | 스킬 |  |
| `crafting` | `wormwood_syrupcrafting` |  | 스킬 |  |
| `allegiance2` | `pos` |  | 잠금(Lock) |  |
| `allegiance2` | `wormwood_allegiance_lunar_plant_gear_1` |  | 스킬 |  |
| `allegiance2` | `wormwood_allegiance_lunar_plant_gear_2` |  | 스킬 |  |
| `gathering` | `wormwood_blooming_speed1` |  | 스킬 |  |
| `gathering` | `wormwood_blooming_speed2` |  | 스킬 |  |
| `gathering` | `wormwood_blooming_overheatprotection` |  | 스킬 |  |
| `gathering` | `wormwood_blooming_max_upgrade` |  | 스킬 |  |
| `gathering` | `wormwood_blooming_photosynthesis` |  | 스킬 |  |
| `gathering` | `wormwood_blooming_farmrange1` |  | 스킬 |  |
| `gathering` | `wormwood_quick_selffertilizer` |  | 스킬 |  |
| `gathering` | `wormwood_bugs` |  | 스킬 |  |
| `gathering` | `wormwood_blooming_trapbramble` |  | 스킬 |  |
| `gathering` | `wormwood_armor_bramble` |  | 스킬 |  |
| `allegiance1` | `pos` |  | 잠금(Lock) |  |
| `allegiance1` | `wormwood_allegiance_lunar_mutations_1` |  | 스킬 |  |
| `allegiance1` | `wormwood_allegiance_lunar_mutations_2` |  | 스킬 |  |
| `allegiance1` | `wormwood_allegiance_lunar_mutations_3` |  | 스킬 |  |

### 3.10 `wortox` — 스킬 31개 / 잠금 4개 (브랜치: allegiance, default, naughty, neutral, nice)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `neutral` | `wortox_inclination_meter` |  | 루트(Root) |  |
| `default` | `button_decorations` |  | 스킬 |  |
| `neutral` | `wortox_inclination_nice` |  | 루트(Root) |  |
| `neutral` | `wortox_inclination_naughty` |  | 루트(Root) |  |
| `nice` | `wortox_lifebringer_lock` |  | 잠금(Lock) |  |
| `nice` | `wortox_soulprotector_lock` |  | 잠금(Lock) |  |
| `naughty` | `wortox_souldecoy_lock` |  | 잠금(Lock) |  |
| `naughty` | `wortox_thief_lock` |  | 잠금(Lock) |  |
| `nice` | `wortox_lifebringer_1` |  | 루트(Root) |  |
| `nice` | `wortox_lifebringer_2` |  | 스킬 |  |
| `nice` | `wortox_lifebringer_3` |  | 스킬 |  |
| `nice` | `wortox_soulprotector_1` |  | 루트(Root) |  |
| `nice` | `wortox_soulprotector_2` |  | 스킬 |  |
| `nice` | `wortox_soulprotector_3` |  | 스킬 |  |
| `nice` | `wortox_soulprotector_4` |  | 스킬 |  |
| `nice` | `wortox_liftedspirits_1` |  | 루트(Root) |  |
| `nice` | `wortox_liftedspirits_2` |  | 스킬 |  |
| `nice` | `wortox_liftedspirits_3` |  | 스킬 |  |
| `nice` | `wortox_liftedspirits_4` |  | 스킬 |  |
| `neutral` | `wortox_panflute_playing` |  | 루트(Root) |  |
| `neutral` | `wortox_panflute_soulcaller` |  | 스킬 |  |
| `neutral` | `wortox_panflute_forget` |  | 스킬 |  |
| `naughty` | `wortox_nabbag` |  | 루트(Root) |  |
| `naughty` | `wortox_souljar_1` |  | 스킬 |  |
| `naughty` | `wortox_souljar_2` |  | 스킬 |  |
| `naughty` | `wortox_souljar_3` |  | 스킬 |  |
| `naughty` | `wortox_thief_1` |  | 루트(Root) |  |
| `naughty` | `wortox_thief_2` |  | 스킬 |  |
| `naughty` | `wortox_thief_3` |  | 스킬 |  |
| `naughty` | `wortox_thief_4` |  | 스킬 |  |
| `naughty` | `wortox_souldecoy_1` |  | 루트(Root) |  |
| `naughty` | `wortox_souldecoy_2` |  | 스킬 |  |
| `naughty` | `wortox_souldecoy_3` |  | 스킬 |  |
| `allegiance` | `wortox_allegiance_lunar` |  | 스킬 |  |
| `allegiance` | `wortox_allegiance_shadow` |  | 스킬 |  |

### 3.11 `wurt` — 스킬 26개 / 잠금 3개 (브랜치: allegiance, amphibian, swampmaster)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `amphibian` | `wurt_amphibian_sanity_1` |  | 루트(Root) |  |
| `amphibian` | `wurt_amphibian_sanity_2` |  | 스킬 |  |
| `amphibian` | `wurt_amphibian_temperature` |  | 스킬 |  |
| `amphibian` | `wurt_amphibian_thickskin_1` |  | 스킬 |  |
| `amphibian` | `wurt_amphibian_thickskin_2` |  | 스킬 |  |
| `amphibian` | `wurt_amphibian_healing_1` |  | 스킬 |  |
| `amphibian` | `wurt_amphibian_healing_2` |  | 스킬 |  |
| `swampmaster` | `wurt_mosquito_craft_1` |  | 루트(Root) |  |
| `swampmaster` | `wurt_mosquito_craft_2` |  | 스킬 |  |
| `swampmaster` | `wurt_mosquito_craft_3` |  | 스킬 |  |
| `swampmaster` | `wurt_civ_1` |  | 루트(Root) |  |
| `swampmaster` | `wurt_civ_1_2` |  | 스킬 |  |
| `swampmaster` | `wurt_civ_2` |  | 루트(Root) |  |
| `swampmaster` | `wurt_civ_2_2` |  | 스킬 |  |
| `swampmaster` | `wurt_civ_3` |  | 루트(Root) |  |
| `swampmaster` | `wurt_civ_3_2` |  | 스킬 |  |
| `swampmaster` | `wurt_pathfinder` |  | 루트(Root) |  |
| `swampmaster` | `wurt_merm_king_hunger_1` |  | 루트(Root) | `wurt_merm_king_hunger_2` |
| `swampmaster` | `wurt_merm_king_hunger_2` |  | 스킬 | `wurt_merm_king_hunger_3` |
| `swampmaster` | `wurt_merm_king_hunger_3` |  | 스킬 |  |
| `swampmaster` | `wurt_merm_flee` |  | 루트(Root) |  |
| `swampmaster` | `wurt_mermkingshoulders` |  | 루트(Root) |  |
| `swampmaster` | `wurt_mermkingcrown` |  | 스킬 |  |
| `swampmaster` | `wurt_mermkingtrident` |  | 스킬 |  |
| `allegiance` | `wurt_allegiance_lock_1` |  | 잠금(Lock) |  |
| `allegiance` | `wurt_shadow_allegiance_1` |  | 잠금(Lock) |  |
| `allegiance` | `wurt_lunar_allegiance_1` |  | 잠금(Lock) |  |
| `allegiance` | `wurt_lunar_allegiance_2` |  | 스킬 |  |
| `allegiance` | `wurt_shadow_allegiance_2` |  | 스킬 |  |

### 3.12 `wx78` — 스킬 25개 / 잠금 2개 (브랜치: default)

| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |
|---|---|---|---|---|
| `default` | `wx78_circuitry_betterunplug` |  | 루트(Root) |  |
| `default` | `wx78_circuitry_bettercharge` |  | 루트(Root) |  |
| `default` | `wx78_circuitry_alphabuffs_1` |  | 루트(Root) |  |
| `default` | `wx78_circuitry_alphabuffs_2` |  | 스킬 |  |
| `default` | `wx78_circuitry_betabuffs_1` |  | 루트(Root) |  |
| `default` | `wx78_circuitry_betabuffs_2` |  | 스킬 |  |
| `default` | `wx78_circuitry_gammabuffs_1` |  | 루트(Root) |  |
| `default` | `wx78_circuitry_gammabuffs_2` |  | 스킬 |  |
| `default` | `wx78_circuitry_slot_1` |  | 스킬 |  |
| `default` | `wx78_extrabody_1` |  | 루트(Root) |  |
| `default` | `wx78_ghostrevive_1` |  | 스킬 |  |
| `default` | `wx78_ghostrevive_2` |  | 스킬 |  |
| `default` | `wx78_ghostrevive_3` |  | 스킬 |  |
| `default` | `wx78_extrabody_2` |  | 스킬 |  |
| `default` | `wx78_extrabody_3` |  | 스킬 |  |
| `default` | `wx78_remotebodyswap` |  | 스킬 |  |
| `default` | `wx78_bodycircuits` |  | 스킬 |  |
| `default` | `wx78_scoutdrone_1` |  | 루트(Root) |  |
| `default` | `wx78_extradronerange` |  | 루트(Root) |  |
| `default` | `wx78_deliverydrone_1` |  | 루트(Root) |  |
| `default` | `wx78_deliverydrone_2` |  | 스킬 |  |
| `default` | `wx78_zapdrone_1` |  | 루트(Root) |  |
| `default` | `wx78_zapdrone_2` |  | 스킬 |  |
| `allegiance` | `wx78_allegiance_lunar_lock_1` |  | 잠금(Lock) |  |
| `default` | `wx78_allegiance_lunar` |  | 스킬 |  |
| `allegiance` | `wx78_shadow_allegiance_lock_1` |  | 잠금(Lock) |  |
| `default` | `wx78_allegiance_shadow` |  | 스킬 |  |

---

## 4. 전체 61종 요리(일반 50 + 왈리 11) 정밀 수치표

| 구분 | 요리 ID | 우선순위 | 체력 | 허기 | 정신력 | 신선도(일) | 조리시간 계수 | 식성 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 일반 | `butterflymuffin` | 1 | 20 | 37.5 | 5 | 15 | 2 | `VEGGIE` |
| 일반 | `frogglebunwich` | 1 | 20 | 37.5 | 5 | 15 | 2 | `MEAT` |
| 일반 | `taffy` | 10 | -3 | 25.0 | 15 | 15 | 2 | `GOODIES` |
| 일반 | `pumpkincookie` | 10 | 0 | 37.5 | 15 | 10 | 2 | `VEGGIE` |
| 일반 | `stuffedeggplant` | 1 | 3 | 37.5 | 5 | 15 | 2 | `VEGGIE` |
| 일반 | `fishsticks` | 10 | 40 | 37.5 | 5 | 10 | 2 | `MEAT` |
| 일반 | `honeynuggets` | 2 | 20 | 37.5 | 5 | 15 | 2 | `MEAT` |
| 일반 | `honeyham` | 2 | 30 | 75 | 5 | 15 | 2 | `MEAT` |
| 일반 | `dragonpie` | 1 | 40 | 75 | 5 | 15 | 2 | `VEGGIE` |
| 일반 | `kabobs` | 5 | 3 | 37.5 | 5 | 15 | 2 | `MEAT` |
| 일반 | `mandrakesoup` | 10 | 100 | 150 | 5 | 6 | 3 | `VEGGIE` |
| 일반 | `baconeggs` | 10 | 20 | 75 | 5 | 20 | 2 | `MEAT` |
| 일반 | `meatballs` | -1 | 3 | 62.5 | 5 | 10 | 0.75 | `MEAT` |
| 일반 | `bonestew` | 0 | 12 | 150.0 | 5 | 10 | 0.75 | `MEAT` |
| 일반 | `perogies` | 5 | 40 | 37.5 | 5 | 20 | 1 | `MEAT` |
| 일반 | `turkeydinner` | 10 | 20 | 75 | 5 | 6 | 3 | `MEAT` |
| 일반 | `ratatouille` | 0 | 3 | 25 | 5 | 15 | 1 | `VEGGIE` |
| 일반 | `jammypreserves` | 0 | 3 | 37.5 | 5 | 15 | 0.5 | `VEGGIE` |
| 일반 | `fruitmedley` | 0 | 20 | 25 | 5 | 6 | 0.5 | `VEGGIE` |
| 일반 | `fishtacos` | 10 | 20 | 37.5 | 5 | 6 | 0.5 | `MEAT` |
| 일반 | `waffles` | 10 | 60 | 37.5 | 5 | 6 | 0.5 | `VEGGIE` |
| 일반 | `monsterlasagna` | 10 | -20 | 37.5 | -20 | 6 | 0.5 | `MEAT` |
| 일반 | `powcake` | 10 | -3 | 0 | 0 | 9000000 | 0.5 | `VEGGIE` |
| 일반 | `unagi` | 20 | 20 | 37.5 | 5 | 10 | 0.5 | `MEAT` |
| 일반 | `wetgoop` | -10 | 0 | 0 | 0 | 6 | 0.25 | `None` |
| 일반 | `flowersalad` | 10 | 40 | 12.5 | 5 | 6 | 0.5 | `VEGGIE` |
| 일반 | `icecream` | 10 | 0 | 25 | 50 | 3 | 0.5 | `GOODIES` |
| 일반 | `watermelonicle` | 10 | 3 | 12.5 | 20 | 3 | 0.5 | `VEGGIE` |
| 일반 | `trailmix` | 10 | 30 | 12.5 | 5 | 15 | 0.5 | `VEGGIE` |
| 일반 | `hotchili` | 10 | 20 | 37.5 | 0 | 10 | 0.5 | `MEAT` |
| 일반 | `guacamole` | 10 | 20 | 37.5 | 0 | 10 | 0.5 | `MEAT` |
| 일반 | `jellybean` | 12 | TUNING.JELLYBEAN_TICK_VALUE | 0 | 5 | None | 2.5 | `GOODIES` |
| 일반 | `potatotornado` | 10 | 3 | 37.5 | 15 | 10 | 0.75 | `VEGGIE` |
| 일반 | `mashedpotatoes` | 20 | 20 | 37.5 | 33 | 15 | 1 | `VEGGIE` |
| 일반 | `asparagussoup` | 10 | 20 | 18.75 | 5 | 15 | 0.5 | `VEGGIE` |
| 일반 | `vegstinger` | 15 | 3 | 25 | 33 | 15 | 0.5 | `VEGGIE` |
| 일반 | `bananapop` | 20 | 20 | 12.5 | 33 | 3 | 0.5 | `VEGGIE` |
| 일반 | `frozenbananadaiquiri` | 2 | 30 | 18.75 | 15 | 15 | 1 | `GOODIES` |
| 일반 | `bananajuice` | 1 | 8 | 25 | 33 | 15 | 0.5 | `VEGGIE` |
| 일반 | `ceviche` | 20 | 20 | 25 | 5 | 10 | 0.5 | `MEAT` |
| 일반 | `salsa` | 20 | 3 | 25 | 33 | 15 | 0.5 | `VEGGIE` |
| 일반 | `pepperpopper` | 20 | 30 | 25 | -5 | 15 | 2 | `MEAT` |
| 일반 | `californiaroll` | 20 | 20 | 37.5 | 10 | 10 | 0.5 | `MEAT` |
| 일반 | `seafoodgumbo` | 10 | 40 | 37.5 | 20 | 10 | 1 | `MEAT` |
| 일반 | `surfnturf` | 30 | 60 | 37.5 | 33 | 10 | 1 | `MEAT` |
| 일반 | `lobsterbisque` | 30 | 60 | 25 | 10 | 10 | 0.5 | `MEAT` |
| 일반 | `lobsterdinner` | 25 | 60 | 37.5 | 50 | 15 | 1 | `MEAT` |
| 일반 | `barnaclepita` | 25 | 20 | 37.5 | 5 | 15 | 2 | `MEAT` |
| 일반 | `barnaclesushi` | 30 | 40 | 37.5 | 15 | 10 | 0.5 | `MEAT` |
| 일반 | `barnaclinguine` | 30 | 30 | 75 | 20 | 6 | 2 | `MEAT` |
| 일반 | `barnaclestuffedfishhead` | 26 | 20 | 75.0 | 0 | 3 | 2 | `MEAT` |
| 일반 | `leafloaf` | 25 | 8 | 37.5 | 5 | 20 | 2 | `MEAT` |
| 일반 | `leafymeatburger` | 26 | 30 | 37.5 | 33 | 6 | 2 | `MEAT` |
| 일반 | `leafymeatsouffle` | 50 | 0 | 37.5 | 50 | 6 | 2 | `MEAT` |
| 일반 | `meatysalad` | 25 | 40 | 75.0 | 5 | 6 | 2 | `MEAT` |
| 일반 | `shroomcake` | 30 | 0 | 25 | 10 | 15 | 1 | `GOODIES` |
| 일반 | `sweettea` | 1 | 3 | 0 | 15 | 3 | 1 | `VEGGIE` |
| 일반 | `koalefig_trunk` | 40 | 60 | 150 | 15 | 15 | 2 | `MEAT` |
| 일반 | `figatoni` | 30 | 30 | 56.25 | 15 | 6 | 2 | `VEGGIE` |
| 일반 | `figkabab` | 30 | 20 | 37.5 | 10 | 15 | 1 | `MEAT` |
| 일반 | `frognewton` | 1 | 20 | 25 | 5 | 15 | 1 | `MEAT` |
| 일반 | `bunnystew` | 1 | 20 | 37.5 | 5 | 10 | 0.5 | `MEAT` |
| 일반 | `justeggs` | 0 | 3 | 50.0 | 5 | 10 | 0.5 | `MEAT` |
| 일반 | `veggieomlet` | 1 | 20 | 37.5 | 5 | 20 | 1 | `MEAT` |
| 일반 | `talleggs` | 10 | 60 | 150 | 5 | 15 | 2 | `MEAT` |
| 일반 | `beefalofeed` | -5 | 15.0 | 100 | 0 | 20 | 0.5 | `ROUGHAGE` |
| 일반 | `beefalotreat` | -4 | 75 | 25 | 0 | 20 | 2 | `ROUGHAGE` |
| 일반 | `shroombait` | 30 | -20 | 18.75 | -15 | 15 | 1 | `MEAT` |
| 왈리 | `nightmarepie` | 30 | 1 | 25 | 5 | 10 | 2 | `VEGGIE` |
| 왈리 | `voltgoatjelly` | 30 | 3 | 37.5 | 10 | 10 | 2 | `GOODIES` |
| 왈리 | `glowberrymousse` | 30 | 3 | 37.5 | 10 | 8 | 1 | `VEGGIE` |
| 왈리 | `frogfishbowl` | 30 | 20 | 37.5 | -10 | 8 | 2 | `MEAT` |
| 왈리 | `dragonchilisalad` | 30 | -3 | 25 | 10 | 15 | 0.75 | `VEGGIE` |
| 왈리 | `gazpacho` | 30 | 3 | 25 | 10 | 15 | 0.5 | `VEGGIE` |
| 왈리 | `potatosouffle` | 30 | 20 | 37.5 | 15 | 10 | 2 | `VEGGIE` |
| 왈리 | `monstertartare` | 30 | -20 | 62.5 | -20 | 10 | 0.5 | `MEAT` |
| 왈리 | `freshfruitcrepes` | 30 | 60 | 150 | 15 | 10 | 2 | `VEGGIE` |
| 왈리 | `bonesoup` | 30 | 32 | 150.0 | 5 | 10 | 2 | `MEAT` |
| 왈리 | `moqueca` | 30 | 60 | 112.5 | 33 | 8 | 2 | `MEAT` |
