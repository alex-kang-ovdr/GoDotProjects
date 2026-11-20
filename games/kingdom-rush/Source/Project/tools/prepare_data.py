#!/usr/bin/env python3
"""Build v18 execution data from restored v14 candidates and new map evidence.

First import: python tools/prepare_data.py --source /path/to/KingdomRush_v14
Rebuild:      python tools/prepare_data.py

The compact reference contains numeric facts, identifiers and source locators;
the original archive is never changed or distributed with this application.
"""
from __future__ import annotations
import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAMILIES = ["archer", "barracks", "mage", "artillery"]
RANGED_RADII = {"shadow_archer":155,"necromancer":145,"troll_champion":160}
NEW_SOURCE = {"id":"louvau_play_transcription_2026_11_18","title":"Scott Louvau · Kingdom Rush Automation: Map Names, Gold, Restrictions","url":"https://relentlessoptimizer.com/KR/","kind":"primary_player_transcription","accessed":"2026-11-18","acquisition":"web_read","sourceSnapshotIncluded":False}
NEW_GOLD_CANDIDATES = {("citadel","heroic"):1200,("citadel","iron"):800,("pagras","iron"):510}
STAR_KO = {
 "salvage":("회수율 개선","전투 중 타워 판매 환급률을 90%로 높입니다."),
 "eagle_eye":("독수리의 눈","궁수 계열 사거리 10% 증가."),
 "piercing_shots":("관통 사격","궁수 공격이 물리 방어 10%p를 무시합니다."),
 "far_shots":("장거리 사격","궁수 사거리 10% 추가 증가; 두 단계의 곱셈 후보 1.21배."),
 "precision":("정밀 사격","궁수 공격이 10% 확률로 2배 피해를 줍니다."),
 "toughness_training":("체력 훈련","병사 기본 체력 10% 증가."),
 "better_armor":("강화 갑옷","병사 물리 방어 10%p 증가."),
 "improved_deployment":("신속 배치","집결 범위 20% 증가와 재훈련 시간 단축."),
 "endurance_training":("지구력 훈련","병사 기본 체력 10% 추가 증가; 두 훈련 합계 20%."),
 "spiked_armor":("가시 갑옷","근접 교전 중 받은 피해의 일부를 고정 피해로 반사합니다."),
 "spell_reach":("주문 사거리","마법 계열 사거리 10% 증가."),
 "arcane_shatter":("비전 파쇄","마법 공격 적중 시 적의 물리 방어를 3%p 감소시킵니다."),
 "hermetic_study":("마법 연구","마법 타워 건설·단계 강화 가격 10% 감소."),
 "empowered_magic":("강화 마법","마법 기본 피해 15% 증가."),
 "slow_curse":("감속 저주","마법 적중 시 짧은 시간 동안 적 이동속도를 절반으로 낮춥니다."),
 "concentrated_fire":("집중 포화","포병 기본 피해 10% 증가."),
 "range_finder":("거리 측정","포병 사거리 10% 증가."),
 "field_logistic":("야전 보급","포병 건설·단계 강화 가격 10% 감소."),
 "industrialization":("산업화","빅 베르타·테슬라 전문 능력 가격 25% 감소."),
 "smart_targeting":("정밀 조준","폭발 중심에서 멀어질 때의 범위 피해 감쇠를 제거합니다."),
 "blazing_skies":("불타는 하늘","유성을 5발로 늘리고 개별 피해 후보를 50–80으로 높입니다."),
 "scorched_earth":("초토화","유성 착탄 후 지면에 5초 동안 화염을 남깁니다."),
 "fast_and_furious":("신속하고 맹렬하게","유성 피해 후보 90–120, 재사용 대기 70초."),
 "blazing_earth":("불타는 대지","지면 화염을 10초로 강화하고 재사용 대기를 60초로 단축합니다."),
 "cataclysm":("대격변","유성 피해 후보 150–180, 추가 무작위 유성 5발."),
 "well_fed":("충분한 식량","지원군 체력·근접 공격·회복을 강화합니다."),
 "conscripts":("징집병","지원군 체력 70, 방어 10%, 근접 피해 2–4 후보."),
 "warriors":("전사","지원군 체력 90, 방어 20%, 근접 피해 3–6 후보."),
 "legionnaires":("군단병","지원군 체력 110, 방어 30%, 근접 피해 6–10 후보."),
 "spear_throw":("창 투척","지원군이 공중과 지상의 적에게 원거리 창을 던집니다."),
}
FEATURE_KO = {"tutorial_gates":"기본 조작 학습","two_entries_merge":"두 입구 합류","split_paths":"경로 분기","preplaced_sharpshooter":"사전 배치 저격수탑","sylvan_elf_hall":"엘프 훈련장","imperial_guards":"제국 근위병","juggernaut_encounter":"저거너트 출현","mine_transfer":"광산 경로 이동","sasquatch":"사스콰치","sunray_tower":"태양 광선 탑","jt_encounter":"J.T. 출현","graveyard":"묘지 부활","magma_field":"용암 지대","demon_portals":"악마 차원문","tower_hold":"타워 봉인","veznan_encounter":"베즈난 결전"}

STAGE_KO = {
    "southport": ("남부 항구", "왕국의 첫 방어선", "forest"),
    "outskirts": ("변두리 농장", "밀밭 사이로 다가오는 발소리", "forest"),
    "pagras": ("파그라스", "두 갈래 길, 하나의 수호선", "forest"),
    "twin_rivers": ("쌍둥이 강", "굽이치는 강을 지켜라", "forest"),
    "silveroak": ("은빛 참나무 숲", "거미줄 아래의 매복", "forest"),
    "citadel": ("왕국의 성채", "저거너트가 성문으로 향한다", "forest"),
    "coldstep": ("콜드스텝 광산", "얼어붙은 갱도의 불빛", "snow"),
    "icewind": ("얼음바람 고개", "눈보라 속 방어전", "snow"),
    "stormcloud": ("폭풍구름 사원", "산의 주인을 깨우다", "snow"),
    "wastes": ("황무지", "잿빛 대지의 행군", "ash"),
    "forsaken": ("버려진 계곡", "악마의 군단을 저지하라", "ash"),
    "dark_tower": ("어둠의 탑", "베즈난과의 마지막 결전", "ash"),
}

# Authored pixel-space paths and pads. These are NOT recovered map coordinates.
# Every lane ends at its stage's common exit. 1000 x 620 logical canvas.
LAYOUTS = {
 "southport": {
  "paths": [[[-35,150],[185,150],[255,220],[255,405],[335,475],[540,475],[625,395],[625,215],[710,145],[835,145],[895,210],[895,385],[1035,435]]],
  "sites": [[145,245],[350,235],[150,370],[350,375],[440,385],[520,555],[535,240],[720,315],[805,245],[800,430]],
 },
 "outskirts": {
  "paths": [[[-35,430],[170,430],[240,355],[240,180],[320,115],[545,115],[625,195],[625,420],[710,490],[855,490],[910,415],[910,230],[1035,190]]],
  "sites": [[135,335],[335,345],[145,180],[345,215],[465,200],[550,335],[735,215],[730,385],[820,580],[815,295]],
 },
 "pagras": {
  "paths": [
   [[-35,105],[170,105],[260,205],[260,365],[350,465],[560,465],[650,365],[650,170],[745,115],[870,115],[915,215],[915,410],[1035,465]],
   [[-35,510],[125,510],[205,450],[260,365],[350,465],[560,465],[650,365],[650,170],[745,115],[870,115],[915,215],[915,410],[1035,465]],
  ],
  "sites": [[155,210],[350,225],[150,365],[365,365],[475,555],[555,345],[565,185],[750,260],[820,210],[825,395]],
 },
 "twin_rivers": {
  "paths": [
   [[-35,150],[155,150],[225,230],[225,430],[315,505],[485,505],[565,425],[565,220],[650,130],[820,130],[900,210],[900,425],[1035,470]],
   [[390,-35],[390,100],[305,175],[225,230],[225,430],[315,505],[485,505],[565,425],[565,220],[650,130],[820,130],[900,210],[900,425],[1035,470]],
  ],
  "sites": [[130,245],[325,295],[135,430],[340,410],[460,405],[470,245],[665,280],[755,220],[810,385],[800,535],[470,85]],
 },
 "silveroak": {
  "paths": [
   [[-35,260],[150,260],[225,180],[225,90],[430,90],[510,170],[510,360],[420,450],[260,450],[260,540],[660,540],[740,450],[740,280],[830,205],[1035,205]],
   [[465,-35],[430,90],[510,170],[510,360],[420,450],[260,450],[260,540],[660,540],[740,450],[740,280],[830,205],[1035,205]],
  ],
  "sites": [[125,160],[330,190],[345,345],[155,450],[420,360],[610,420],[645,270],[835,345],[885,110],[585,125],[625,620-35]],
 },
 "citadel": {
  "paths": [
   [[-35,135],[200,135],[285,215],[285,410],[375,500],[575,500],[665,410],[665,200],[755,120],[865,120],[925,195],[925,405],[1035,445]],
   [[-35,505],[125,505],[215,450],[285,410],[375,500],[575,500],[665,410],[665,200],[755,120],[865,120],[925,195],[925,405],[1035,445]],
  ],
  "sites": [[140,230],[380,240],[180,350],[390,395],[490,415],[570,300],[570,150],[770,270],[830,385],[790,500],[485,575]],
 },
 "coldstep": {
  "paths": [
   [[-35,150],[150,150],[225,225],[225,415],[310,490],[490,490],[570,405],[570,190],[650,110],[835,110],[905,190],[905,400],[1035,450]],
   [[-35,540],[110,540],[165,475],[225,415],[310,490],[490,490],[570,405],[570,190],[650,110],[835,110],[905,190],[905,400],[1035,450]],
  ],
  "sites": [[130,250],[320,225],[135,375],[335,385],[440,395],[480,220],[680,250],[805,215],[805,395],[690,410],[400,570]],
 },
 "icewind": {
  "paths": [
   [[-35,470],[160,470],[235,390],[235,195],[320,120],[495,120],[575,210],[575,440],[665,510],[835,510],[915,420],[915,215],[1035,165]],
   [[420,-35],[420,120],[495,120],[575,210],[575,440],[665,510],[835,510],[915,420],[915,215],[1035,165]],
  ],
  "sites": [[130,365],[330,350],[135,195],[330,215],[475,315],[470,475],[680,355],[790,405],[815,220],[715,580],[525,70]],
 },
 "stormcloud": {
  "paths": [
   [[-35,120],[160,120],[240,200],[240,405],[330,490],[520,490],[610,400],[610,200],[700,120],[840,120],[920,205],[920,405],[1035,460]],
   [[-35,530],[110,530],[170,470],[240,405],[330,490],[520,490],[610,400],[610,200],[700,120],[840,120],[920,205],[920,405],[1035,460]],
  ],
  "sites": [[135,220],[335,225],[140,365],[345,380],[450,395],[510,230],[705,300],[820,220],[815,410],[720,500],[415,575]],
 },
 "wastes": {
  "paths": [
   [[-35,160],[155,160],[230,245],[230,435],[320,510],[505,510],[590,420],[590,205],[680,125],[840,125],[920,210],[920,420],[1035,470]],
   [[360,-35],[360,90],[300,165],[230,245],[230,435],[320,510],[505,510],[590,420],[590,205],[680,125],[840,125],[920,210],[920,420],[1035,470]],
  ],
  "sites": [[130,265],[325,290],[135,435],[340,405],[475,405],[480,230],[690,290],[815,235],[820,400],[700,490],[455,90]],
 },
 "forsaken": {
  "paths": [
   [[-35,120],[165,120],[255,200],[255,395],[345,480],[550,480],[640,395],[640,200],[725,120],[855,120],[925,210],[925,415],[1035,455]],
   [[-35,535],[130,535],[195,465],[255,395],[345,480],[550,480],[640,395],[640,200],[725,120],[855,120],[925,210],[925,415],[1035,455]],
  ],
  "sites": [[145,225],[350,230],[155,355],[355,380],[460,395],[540,235],[735,290],[825,235],[825,405],[725,510],[455,570],[350,80]],
 },
 "dark_tower": {
  "paths": [
   [[-35,130],[155,130],[240,215],[240,415],[330,500],[520,500],[610,410],[610,205],[695,125],[835,125],[920,210],[920,420],[1035,465]],
   [[-35,535],[100,535],[170,480],[240,415],[330,500],[520,500],[610,410],[610,205],[695,125],[835,125],[920,210],[920,420],[1035,465]],
   [[365,-35],[365,90],[310,155],[240,215],[240,415],[330,500],[520,500],[610,410],[610,205],[695,125],[835,125],[920,210],[920,420],[1035,465]],
  ],
  "sites": [[130,240],[335,270],[135,390],[350,400],[460,405],[510,240],[710,295],[815,230],[815,410],[715,520],[430,580],[460,100]],
 },
}

ENEMY_KO = {
 "goblin":"고블린","orc":"오크","wulf":"늑대","worg":"워그","bandit":"도적","brigand":"강도",
 "dark_knight":"암흑 기사","dark_slayer":"암흑 학살자","demon_hound":"악마 사냥개","demon_imp":"악마 임프",
 "demon_lord":"악마 군주","demon_spawn":"악마 병사","gargoyle":"가고일","giant_spider":"거대 거미",
 "golem_head":"골렘 머리","jt":"J.T.","juggernaut":"저거너트","magma_elemental":"용암 정령",
 "marauder":"약탈자","necromancer":"강령술사","ogre":"오우거","rocket_rider":"로켓 기수",
 "shadow_archer":"그림자 궁수","shaman":"주술사","skeleton":"해골","skeleton_knight":"해골 기사",
 "spider_hatchling":"새끼 거미","spider_matriarch":"거미 여왕","troll":"트롤","troll_champion":"트롤 투사",
 "troll_chieftain":"트롤 족장","veznan":"베즈난","winter_wolf":"겨울 늑대","yeti":"설인",
}
SPEEDS = {
 "goblin":31,"orc":25,"wulf":62,"worg":55,"bandit":38,"brigand":26,"dark_knight":23,"dark_slayer":20,
 "demon_hound":50,"demon_imp":34,"demon_lord":23,"demon_spawn":30,"gargoyle":37,"giant_spider":32,
 "golem_head":30,"jt":10,"juggernaut":10,"magma_elemental":19,"marauder":24,"necromancer":23,
 "ogre":21,"rocket_rider":32,"shadow_archer":31,"shaman":25,"skeleton":30,"skeleton_knight":25,
 "spider_hatchling":44,"spider_matriarch":23,"troll":30,"troll_champion":27,"troll_chieftain":24,
 "veznan":11,"winter_wolf":51,"yeti":20,
}
MISSING_MELEE = {"goblin":(2,4),"orc":(4,8),"brigand":(6,10),"dark_knight":(15,25),"marauder":(16,24)}
TOWER_KO = {
 "archer_1":"궁수탑","archer_2":"명사수탑","archer_3":"저격수탑","rangers":"레인저 은신처","musketeer":"머스킷 수비대",
 "barracks_1":"민병대 병영","barracks_2":"보병 병영","barracks_3":"기사 병영","holy_order":"성기사단","barbarians":"야만전사 전당",
 "mage_1":"마법사탑","mage_2":"비전술사탑","mage_3":"마도사탑","arcane":"비전의 탑","sorcerer":"원소술사의 탑",
 "artillery_1":"드워프 포대","artillery_2":"발전형 포대","artillery_3":"곡사포대","bertha":"빅 베르타","tesla":"테슬라 x104",
}
RANGES = dict(zip(TOWER_KO, [155,170,185,195,230,130,140,150,160,160,150,165,180,195,190,155,175,190,210,180]))
SKILL_KO = {
 "poison_arrows":("맹독 화살","적중한 적에게 3초 동안 중첩되지 않는 독 피해를 줍니다."),
 "wrath_forest":("숲의 분노","여러 지상 적을 속박하고 지속 피해를 줍니다."),
 "sniper_shot":("저격","일반 적을 일정 확률로 즉시 처치합니다."),
 "shrapnel_shot":("산탄 사격","가까운 지상 적을 향해 산탄을 발사합니다."),
 "healing_light":("치유의 빛","성기사가 주기적으로 자신의 체력을 회복합니다."),
 "holy_strike":("성스러운 일격","근접 공격 시 확률적으로 주변 적에게 추가 피해를 줍니다."),
 "shield_valor":("용맹의 방패","성기사의 방어력이 15%p 증가합니다."),
 "more_axes":("쌍도끼","야만전사의 근접 공격력이 증가합니다."),
 "throwing_axes":("투척 도끼","야만전사가 지상과 공중 적에게 도끼를 던집니다."),
 "whirlwind":("회오리 공격","근접 공격 시 확률적으로 주변을 휩씁니다."),
 "death_ray":("죽음의 광선","일반 적 하나를 즉시 처치합니다."),
 "teleport":("순간이동","적 무리를 같은 경로의 뒤쪽으로 되돌립니다."),
 "polymorph":("변이","일반 적을 양으로 바꿉니다. 양은 클릭해 마무리할 수 있습니다."),
 "summon_elemental":("대지 정령","강인한 정령 하나를 소환해 길을 막습니다."),
 "dragonbreath":("용의 숨결","추적 미사일로 적에게 큰 피해를 줍니다."),
 "cluster_launcher":("집속탄","여러 소형 폭탄을 흩뿌려 범위 피해를 줍니다."),
 "supercharged_bolt":("초충전","전격이 더 많은 적에게 연쇄됩니다."),
 "overcharge":("과부하","기본 공격과 함께 타워 주변에 전기 충격을 방출합니다."),
}

def select_fields(obj, names):
    return {key: deepcopy(obj[key]) for key in names if key in obj}

def import_reference(directory):
    directory = Path(directory)
    if (directory / "data").is_dir(): directory /= "data"
    read = lambda n: json.loads((directory / (n + ".json")).read_text(encoding="utf-8"))
    reference = {"origin":"KingdomRush_Reconstructed_v14", "factsMeasuredInOriginalBuild":False}
    fields = {
     "enemies":"id name kind hpByDifficulty armor magicResistance reportedSpeed speedUnits worldUnitsPerSecond goldReward lifeCost flying blockable melee ranged abilities sourceIds evidenceStatus editionScope measuredInTargetBuild",
     "towers":"id name family tier purchaseCostIncremental cumulativeBaseCostDerived parentId upgradeIds abilityIds attack soldiers intrinsicEffects sourceIds evidenceStatus measuredInTargetBuild",
     "abilities":"id ownerTowerId name trigger levels sourceIds unresolved evidenceStatus measuredInTargetBuild",
     "stages":"id order name aliases prerequisiteStageId reportedBuildSpotCount buildSpotCountSemantics entryLabels bossId features designIntentProposed unlockEvents modes sourceIds evidenceStatus measuredInTargetBuild",
     "wave_slots":"id stageId mode number status consensusCounts observationIds",
     "wave_observations":"id waveSlotId sourceId edition groups counts aggregation reportedIncome earlyCallBonusMaxCandidate sourceOrderIsSpawnOrder",
     "bosses":"id stageId normalHpByPhase activation behaviors sourceParameters sourceIds",
     "sources":"id title url kind accessed acquisition sourceSnapshotIncluded",
     "star_upgrades":"id name tree tier costStars cumulativeStars requires effects notes sourceIds evidenceStatus measuredInTargetBuild engineApplyReady",
     "stage_events":"id stageId stageIds mode wave type enemyId countPerCycle entryLabel intervalSeconds startOffsetSeconds totalCount stopCondition timeOrigin maxHpThreshold belowEnemyId atOrAboveEnemyId delaySecondsRange rewardPolicy excludedIds maxHpDefinition bossId trigger exactActivationCondition notAWave16 sourceIds evidenceStatus measuredInTargetBuild runnableReference",
    }
    for name, keep in fields.items():
        reference[name] = [select_fields(x, keep.split()) for x in read(name)]
    # Only numeric mode facts needed by the adapter; discard prior prose reports.
    for stage in reference["stages"]:
        for mode, item in stage["modes"].items():
            stage["modes"][mode] = select_fields(item, "waveCount startingLives startingGold allowedBuildFamilies heroAllowed heroAvailabilityStatus starUpgradeTierCap maxTowerTier preplacedRulesId sourceIds evidenceStatus".split())
    used_sources = set()
    for family in ("enemies", "towers", "abilities", "stages", "bosses", "star_upgrades", "stage_events"):
        for item in reference[family]: used_sources.update(item.get("sourceIds", []))
    for stage in reference["stages"]:
        for item in stage["modes"].values(): used_sources.update(item.get("sourceIds", []))
    used_sources.update(x["sourceId"] for x in reference["wave_observations"])
    reference["sources"] = [s for s in reference["sources"] if s["id"] in used_sources]
    reference["originalProfile"] = read("profile")
    return reference

def counts_of(groups):
    out = Counter()
    for g in groups: out[g.get("enemy", g.get("enemyId"))] += g["count"]
    return dict(sorted(out.items()))

def segment_distance(p,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)))
    return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)

def path_distance(p, paths):
    return min(segment_distance(p,a,b) for path in paths for a,b in zip(path,path[1:]))

def build(reference, geometry=None):
    enemies, towers, skills = {}, {}, {}
    decisions = []
    for item in reference["enemies"]:
        eid=item["id"]
        melee=item.get("melee") or {}
        dmg=melee.get("damage") or MISSING_MELEE.get(eid,(4,8))
        boss=item.get("kind")=="boss"
        enemies[eid] = {
            "id":eid,"name":item["name"],"nameKo":ENEMY_KO[eid],
            "hp":item["hpByDifficulty"]["normal"],"hpByDifficulty":deepcopy(item["hpByDifficulty"]),"armor":item.get("armor",0) or 0,
            "resist":item.get("magicResistance",0) or 0,"speed":SPEEDS[eid],
            "damage":sum(dmg)/2,"damageMin":dmg[0],"damageMax":dmg[1],
            "attackTime":melee.get("intervalSeconds") or 1.5,"gold":item.get("goldReward") or 0,
            "lifeCost":item.get("lifeCost") or (20 if boss else 1),"air":bool(item.get("flying")),
            "blockable":item.get("blockable",True),"boss":boss,
            "behaviors":deepcopy(item.get("abilities") or []),
            "sourceMelee":deepcopy(item.get("melee")),"sourceRanged":deepcopy(item.get("ranged")),
            "sourceBehaviors":deepcopy(item.get("abilities") or []),"ranged":deepcopy(item.get("ranged")),
            "immunities":sorted({effect for ability in item.get("abilities",[]) if ability.get("type")=="immunity" for effect in (ability.get("effects") or [ability.get("effect")]) if effect}),
            "reportedSpeed":item.get("reportedSpeed"),"speedUnits":item.get("speedUnits"),
            "speedStatus":"custom_pixel_speed","evidenceStatus":item.get("evidenceStatus","inherited_candidate"),
            "radius": 29 if boss else 20 if eid in ["ogre","yeti","magma_elemental","troll_chieftain"] else 11,
            "sourceIds":item.get("sourceIds",[]),
        }
        for behavior in enemies[eid]["behaviors"]:
            if "type" not in behavior and "kind" in behavior: behavior["type"]={"dodge_melee":"melee_dodge"}.get(behavior["kind"],behavior["kind"])
            runtime_range={"heal_allies":150,"shield":145,"enrage":140,"death_explosion":65}.get(behavior.get("type"))
            if runtime_range is not None:
                behavior["runtimeRange"]=runtime_range
                behavior["runtimeRangeStatus"]="custom_pixel_radius"
                decisions.append({"entity":eid,"field":"behavior."+behavior["type"]+".runtimeRange","chosen":runtime_range,"sourceRange":behavior.get("rangeSourceUnits",behavior.get("radius")),"status":"custom_coordinate_mapping","reason":"Reported radius has no verified conversion into this canvas coordinate space."})
        if enemies[eid]["ranged"] is not None:
            ranged=enemies[eid]["ranged"]
            ranged["reportedRange"]=ranged.get("range")
            ranged["range"]=RANGED_RADII[eid]
            ranged["rangeStatus"]="custom_pixel_radius_source_range_unknown"
            decisions.append({"entity":eid,"field":"ranged.range","chosen":ranged["range"],"original":ranged["reportedRange"],"status":"custom_missing_value","reason":"Source has no world-coordinate ranged radius; pixel-space combat requires one."})
        roles=[]
        if boss: roles.append("boss")
        if enemies[eid]["air"]: roles.append("air")
        if enemies[eid]["armor"]>0: roles.append("armored")
        if enemies[eid]["resist"]>0: roles.append("magic_resistant")
        if enemies[eid]["ranged"]: roles.append("ranged")
        behavior_types={a.get("type") for a in enemies[eid]["behaviors"]}
        for b,role in [("heal_allies","healer"),("raise_dead","summoner"),("egg_lay","summoner"),("shield","support"),("enrage","support"),("regeneration","regenerator"),("death_explosion","explosive"),("turbo","runner"),("melee_dodge","evasive")]:
            if b in behavior_types and role not in roles: roles.append(role)
        if not roles: roles.append("frontline")
        enemies[eid]["analysis"]={"roles":roles,"status":"derived_classification","counterFamilies":["mage"] if enemies[eid]["armor"]>=.5 else ["archer","artillery"] if enemies[eid]["resist"]>=.5 else ["archer","mage"] if enemies[eid]["air"] else ["barracks","artillery"]}
        if not melee and not item.get("flying"):
            decisions.append({"entity":eid,"field":"melee","chosen":{"damage":list(dmg),"interval":1.5},"status":"custom_missing_value"})
    for boss in reference["bosses"]:
        enemies[boss["id"]]["bossPhases"] = boss["normalHpByPhase"]
        enemies[boss["id"]]["sourceBossBehaviors"] = boss["behaviors"]
    for item in reference["towers"]:
        tid=item["id"]; atk=item["attack"]; family=item["family"]
        low,high=atk.get("damageMin"),atk.get("damageMax")
        if low is None:
            low,high = atk.get("displayDamageCandidate",[30,55])
            decisions.append({"entity":tid,"field":"baseDamage","chosen":[low,high],"otherCandidate":atk.get("conflictingAggregateCandidate"),"status":"custom_profile_candidate_choice","reason":"displayDamageCandidate chosen; chain damage not multiplied into base hit"})
        interval = atk.get("intervalSeconds") or {"holy_order":1.47,"barbarians":1.37}.get(tid,1)
        towers[tid] = {"id":tid,"name":item["name"],"nameKo":TOWER_KO[tid],"family":family,"tier":item["tier"],
            "cost":item["purchaseCostIncremental"],"damageMin":low,"damageMax":high,"interval":interval,
            "range":RANGES[tid],"kind":"barracks" if family=="barracks" else "arrow" if family=="archer" else "bolt" if family=="mage" else "chain" if tid=="tesla" else "shell",
            "upgrades":item.get("upgradeIds",[]),"abilities":item.get("abilityIds",[]),"sourceIds":item.get("sourceIds",[]),
            "damageType":atk.get("damageType"),"canTargetAir":atk.get("canSelectAir",family in ["archer","mage"]),
            "canSelectAir":atk.get("canSelectAir",family in ["archer","mage"]),"canSelectGround":atk.get("canSelectGround",True),
            "sourceAttack":deepcopy(atk),"sourceSoldiers":deepcopy(item.get("soldiers")),"parentId":item.get("parentId"),
            "cumulativeBaseCost":item.get("cumulativeBaseCostDerived"),"evidenceStatus":item.get("evidenceStatus","inherited_candidate"),
            "intrinsicEffects":deepcopy(item.get("intrinsicEffects",[])),
        }
        if item.get("soldiers"):
            soldier=item["soldiers"]
            towers[tid].update(soldierHp=soldier["hpNormal"],armor=soldier["armorFraction"],respawn=soldier["respawnSeconds"],soldierCount=soldier["count"])
        if tid=="tesla": towers[tid]["chainTargets"]=atk.get("baseChainTargets",3)
    for item in reference["abilities"]:
        aid=item["id"]; levels=sorted(item["levels"], key=lambda x:x["level"])
        skills[aid]={"id":aid,"name":item["name"],"nameKo":SKILL_KO[aid][0],"description":SKILL_KO[aid][1],
            "ownerTowerId":item["ownerTowerId"],"costs":[x["purchaseCostIncremental"] for x in levels],
            "maxLevel":len(levels),"type":item["trigger"],"values":[deepcopy(x["parameters"]) for x in levels],"sourceIds":item.get("sourceIds",[]),"unresolved":item.get("unresolved",[]),"evidenceStatus":item.get("evidenceStatus","inherited_candidate")}

    byobs={x["id"]:x for x in reference["wave_observations"]}
    geometry_by_stage={x.get("stageId",x.get("id")):x for x in (geometry or {}).get("stages",[])}
    star_upgrades=[]
    for raw_upgrade in reference.get("star_upgrades",[]):
        upgrade=deepcopy(raw_upgrade)
        upgrade["nameKo"],upgrade["descriptionKo"]=STAR_KO[upgrade["id"]]
        upgrade["runtimeTree"]="meteor" if upgrade["tree"]=="rain_of_fire" else upgrade["tree"]
        star_upgrades.append(upgrade)
    source_events=deepcopy(reference.get("stage_events",[]))
    selections=[]; conflicts=[]; stages=[]
    for raw in reference["stages"]:
        sid=raw["id"]; order=raw["order"]; name_ko,subtitle,biome=STAGE_KO[sid]; layout=LAYOUTS[sid]
        stage={"id":sid,"order":order,"name":raw["name"],"nameKo":name_ko,"subtitle":subtitle,"biome":biome,
            "paths":deepcopy(layout["paths"]),"sites":[{"x":x,"y":y} for x,y in layout["sites"]],
            "waves":{"campaign":[],"heroic":[],"iron":[]},"waveMetrics":{"campaign":[],"heroic":[],"iron":[]},"modes":{},"originalModes":{},"sourceIds":raw.get("sourceIds",[]),
            "geometryStatus":"original_authored_substitute","bossId":raw.get("bossId"),
            "bossAfterWaves":sid=="dark_tower",
            "features":deepcopy(raw.get("features",[])),"sourceEntryLabels":deepcopy(raw.get("entryLabels",[])),
            "sourceBuildSpotCount":raw.get("reportedBuildSpotCount"),"sourceBuildSpotCountSemantics":raw.get("buildSpotCountSemantics"),
            "unlockEvents":deepcopy(raw.get("unlockEvents",[])),
            "designIntentProposed":raw.get("designIntentProposed"),"prerequisiteStageId":raw.get("prerequisiteStageId"),
            "stageEvents":[deepcopy(e) for e in source_events if e.get("stageId")==sid or sid in e.get("stageIds",[])],
        }
        prior_unlocks=[e for previous in reference["stages"] if previous["order"]<order for e in previous.get("unlockEvents",[])]
        current_start_unlocks=[e for e in raw.get("unlockEvents",[]) if e["trigger"]=="stage_started"]
        stage["availableTowerIdsAtStart"]=sorted({tid for event in prior_unlocks+current_start_unlocks for tid in event.get("towerIds",[])})
        if sid in geometry_by_stage:
            restored=deepcopy(geometry_by_stage[sid])
            stage["referenceGeometry"]=restored
            stage["referencePaths"]=deepcopy(restored["paths"])
            stage["referenceSites"]=[dict(p) if isinstance(p,dict) else {"x":p[0],"y":p[1]} for p in restored["sites"]]
        stage["geometryProfiles"]={"authored":{"status":"authored_playable_fallback","pathCount":len(stage["paths"]),"buildSpotCount":len(stage["sites"])}}
        if stage.get("referencePaths"):
            stage["geometryProfiles"]["reconstructed"]={"status":stage["referenceGeometry"].get("status","visual_estimate"),"pathCount":len(stage["referencePaths"]),"recordedSiteCount":len(stage["referenceSites"]),"buildSpotCount":sum(p.get("buildable",True) for p in stage["referenceSites"]),"normalSiteCount":sum(p.get("siteType") not in ["special","prebuilt"] for p in stage["referenceSites"]),"preplacedSiteCount":sum(p.get("siteType")=="prebuilt" for p in stage["referenceSites"]),"specialSiteCount":sum(p.get("siteType")=="special" for p in stage["referenceSites"]),"originalEngineCoordinates":False}
        for mode, source_mode in raw["modes"].items():
            gold=source_mode.get("startingGold")
            if mode=="campaign": adapted_gold=max(gold or 300, 300 if order<=3 else 0)
            elif mode=="heroic": adapted_gold=max(gold or 0,650+order*90)
            else: adapted_gold=max(math.ceil((gold or 0)*1.25),1100+order*125)
            allowed=source_mode.get("allowedBuildFamilies",FAMILIES)
            if sid=="citadel" and mode=="iron": allowed=["archer","barracks","mage"]
            stage["modes"][mode]={"startingGold":adapted_gold,"lives":20 if mode=="campaign" else 1,"allowedFamilies":allowed,"maxTier":4,
                "sourceStartingGold":gold,"assistanceGold":adapted_gold-(gold or 0),"heroAllowed":True,
                "customProfile":True}
            original_mode={"startingGold":gold,"resolvedStartingGold":gold,"lives":source_mode.get("startingLives"),"allowedFamilies":deepcopy(source_mode.get("allowedBuildFamilies",FAMILIES)),"heroAllowed":source_mode.get("heroAllowed"),"heroAvailabilityStatus":source_mode.get("heroAvailabilityStatus","unresolved"),"starUpgradeTierCap":source_mode.get("starUpgradeTierCap"),"maxTowerTier":source_mode.get("maxTowerTier"),"maxTier":source_mode.get("maxTowerTier"),"preplacedRulesId":source_mode.get("preplacedRulesId"),"sourceIds":deepcopy(source_mode.get("sourceIds",[])),"evidenceStatus":source_mode.get("evidenceStatus","documented_candidate"),"startingGoldStatus":"v14_candidate" if gold is not None else "unresolved","unknownFields":[field for field in ["startingGold","heroAllowed","maxTowerTier","preplacedRulesId"] if source_mode.get(field) is None]}
            if (sid,mode) in NEW_GOLD_CANDIDATES:
                candidate=NEW_GOLD_CANDIDATES[sid,mode]
                original_mode["startingGoldCandidates"]=[{"value":gold,"source":"v14","sourceIds":source_mode.get("sourceIds",[])},{"value":candidate,"sourceId":NEW_SOURCE["id"],"status":"primary_player_transcription"}]
                if gold is None:
                    original_mode["resolvedStartingGold"]=candidate
                    original_mode["startingGoldStatus"]="new_primary_candidate_original_build_unverified"
                elif candidate!=gold:
                    original_mode["startingGoldStatus"]="conflicting_candidates_keep_v14"
                decisions.append({"entity":sid+":"+mode,"field":"startingGold","v14Value":gold,"newCandidate":candidate,"sourceId":NEW_SOURCE["id"],"runtimeReferenceChoice":original_mode["resolvedStartingGold"],"status":original_mode["startingGoldStatus"]})
            stage["originalModes"][mode]=original_mode
        stage["startingGold"]=stage["modes"]["campaign"]["startingGold"]
        for slot in sorted([x for x in reference["wave_slots"] if x["stageId"]==sid],key=lambda x:(x["mode"],x["number"])):
            candidates=[byobs[oid] for oid in slot["observationIds"]]
            # Prefer wikily in the custom playable profile, including all13 conflicts.
            # This is a documented choice, not proof of an original build value.
            chosen=sorted(candidates,key=lambda x:(not x["sourceId"].startswith("wikily_"),x["edition"]!="unspecified",x["id"]))[0]
            assert counts_of(chosen["groups"])==dict(sorted(chosen["counts"].items())),chosen["id"]
            if slot.get("consensusCounts") is not None:
                assert chosen["counts"]==slot["consensusCounts"],slot["id"]
            matching_routes=[c for c in candidates if c["counts"]==chosen["counts"] and any(g.get("entryLabel") for g in c["groups"])]
            route_observation=sorted(matching_routes,key=lambda c:(sum(g["count"] for g in c["groups"] if not g.get("entryLabel")),c.get("aggregation")!="per_entry",c["id"]))[0] if matching_routes else chosen
            labels=sorted(set(x.get("entryLabel","main") for x in route_observation["groups"]),key=lambda label:str(label))
            lane_count=len(stage["paths"])
            label_lane={label:n%lane_count for n,label in enumerate(labels)}
            normalized=[]
            for g in route_observation["groups"]:
                entry=g.get("entryLabel","main")
                reference_path=(stage.get("referenceGeometry",{}).get("entryPathMap") or {}).get(entry)
                path_status="mapped_observation_entry_label" if reference_path is not None else "unresolved_lane_allocation"
                if reference_path is None and len(stage.get("referencePaths",[]))==1:
                    reference_path=0; path_status="single_visible_route_no_entry_allocation_ambiguity"
                normalized.append({"enemy":g["enemyId"],"count":g["count"],"path":label_lane[entry],"entryLabel":entry,"sourceEntryLabel":entry,"referencePath":reference_path,"referencePathStatus":path_status,"routingStatus":path_status,"routingSourceId":route_observation["sourceId"],"routingObservationId":route_observation["id"]})
            stage["waves"][slot["mode"]].append(normalized)
            assert counts_of(normalized)==dict(sorted(chosen["counts"].items()))
            selection={"slot":slot["id"],"status":slot["status"],"observationId":chosen["id"],"sourceId":chosen["sourceId"],"counts":chosen["counts"],"routingObservationId":route_observation["id"],"routingSourceId":route_observation["sourceId"],"routingUsesIdenticalAggregateCounts":True,"observedEntryLabelsAvailable":bool(matching_routes),"laneAssignment":"custom_map_label_index","referenceLaneAssignment":"map_observed_labels_when_present_else_custom_distribution","sourceOrderIsSpawnOrder":False}
            selections.append(selection)
            metrics={"number":slot["number"],"slotId":slot["id"],"counts":deepcopy(chosen["counts"]),"totalEnemies":sum(chosen["counts"].values()),"normalHp":sum(enemies[e]["hp"]*n for e,n in chosen["counts"].items()),"baseBounty":sum(enemies[e]["gold"]*n for e,n in chosen["counts"].items()),"lifeThreat":sum(enemies[e]["lifeCost"]*n for e,n in chosen["counts"].items()),"airCount":sum(n for e,n in chosen["counts"].items() if enemies[e]["air"]),"armoredCount":sum(n for e,n in chosen["counts"].items() if enemies[e]["armor"]>0),"magicResistantCount":sum(n for e,n in chosen["counts"].items() if enemies[e]["resist"]>0),"supportCount":sum(n for e,n in chosen["counts"].items() if any(r in enemies[e]["analysis"]["roles"] for r in ["healer","summoner","support"])),"sourceStatus":slot["status"],"sourceId":chosen["sourceId"],"entryLabels":labels,"timingStatus":"authored_not_recovered","derivedFrom":"selected_initial_inventory_excludes_summons_healing_and_stage_events"}
            metrics["reportedIncome"]=chosen.get("reportedIncome")
            metrics["routingSourceId"]=route_observation["sourceId"]
            metrics["observedEntryLabelsAvailable"]=bool(matching_routes)
            metrics["reportedEarlyCallBonusMaxCandidate"]=chosen.get("earlyCallBonusMaxCandidate")
            metrics["reportedIncomeMinusBaseBounty"]=chosen["reportedIncome"]-metrics["baseBounty"] if isinstance(chosen.get("reportedIncome"),(int,float)) else None
            stage["waveMetrics"][slot["mode"]].append(metrics)
            if slot["status"]=="conflict":
                conflicts.append({**selection,"decision":"choose_wikily_for_custom_playable_profile_only","candidates":[{"observationId":c["id"],"sourceId":c["sourceId"],"counts":c["counts"]} for c in candidates],"originalBuildResolution":None})
        stages.append(stage)
    first_seen={}
    enemy_appearances={eid:{"firstCampaign":None,"stages":[],"totalInitialInventory":0} for eid in enemies}
    for stage in stages:
        all_ids=set()
        stage["levelDesign"]={"intent":stage.get("designIntentProposed"),"intentStatus":"analytical_interpretation","features":[{"id":f,"nameKo":FEATURE_KO.get(f,f),"status":"v14_documented_candidate"} for f in stage["features"]],"firstIntroductions":[],"modeSummary":{}}
        for mode,waves in stage["waveMetrics"].items():
            running_bounty=0
            for w in waves:
                w["cumulativeBaseBountyBefore"]=running_bounty
                running_bounty+=w["baseBounty"]
                w["newCampaignEnemies"]=[]
                for eid,n in w["counts"].items():
                    all_ids.add(eid)
                    enemy_appearances[eid]["totalInitialInventory"]+=n
                    if mode=="campaign" and eid not in first_seen:
                        first_seen[eid]={"stageId":stage["id"],"stageNameKo":stage["nameKo"],"wave":w["number"]}
                        w["newCampaignEnemies"].append(eid)
                        stage["levelDesign"]["firstIntroductions"].append({"enemyId":eid,"wave":w["number"]})
                        enemy_appearances[eid]["firstCampaign"]=first_seen[eid]
            stage["levelDesign"]["modeSummary"][mode]={"waves":len(waves),"initialEnemyCount":sum(w["totalEnemies"] for w in waves),"normalHp":sum(w["normalHp"] for w in waves),"baseBounty":running_bounty,"airCount":sum(w["airCount"] for w in waves),"armoredCount":sum(w["armoredCount"] for w in waves),"magicResistantCount":sum(w["magicResistantCount"] for w in waves),"peakInventoryWave":max(waves,key=lambda w:w["totalEnemies"])["number"],"peakHpWave":max(waves,key=lambda w:w["normalHp"])["number"]}
        stage["enemyRoster"]=sorted(all_ids)
        for eid in all_ids: enemy_appearances[eid]["stages"].append(stage["id"])
    if "veznan" in enemy_appearances:
        enemy_appearances["veznan"]["firstCampaign"]={"stageId":"dark_tower","stageNameKo":STAGE_KO["dark_tower"][0],"wave":None,"trigger":"after_wave_15","inventoryMember":False}
    source_hash=hashlib.sha256(json.dumps(reference,sort_keys=True,ensure_ascii=False,separators=(",",":")).encode()).hexdigest()
    summary={"profileId":"kr-v16-reference-and-assisted","baseline":"KingdomRush_Reconstructed_v14","referenceHash":source_hash,
        "originalBuildVerified":False,"waveSlots":len(selections),"selectedEnemyInventoryCount":sum(sum(s["counts"].values()) for s in selections),
        "sourceConflictSlots":len(conflicts),"selectionPolicy":"Prefer wikily candidate; preserve selected counts exactly; unresolved original conflicts remain unresolved.",
        "authoredFields":["fallback map geometry","world-unit movement speeds","tower and enemy ranged radii","spawn timing and order","entry-to-lane mapping","challenge assistance","assisted all-tier unlocks","assisted hero availability","missing melee values","boss runtime scripts"],
        "limitationsKo":"v14 참조 수치와 선택된 웨이브 개체 수를 보존합니다. 복원 지도는 플레이 기록의 타워 좌표와 화면 판독 경로를 사용하며, 원작 엔진 좌표의 추출물이 아닙니다. 이동속도·사거리·생성 간격과 미확정 동작에는 자체 실행값이 포함됩니다.",
        "customModeRules":["All stages and tier4 branches selectable from start.","Hero allowed in all stages.","Campaign stages1–3 minimum starting gold300.","Heroic minimum gold650+90*stageOrder.","Iron gold=max(1.25*sourceGold,1100+125*stageOrder).", "Citadel Iron allows archer/barracks/mage to replace unknown original preplaced defenses."],
        "missingIntervalChoices":{"holy_order":1.47,"barbarians":1.37},
        "bossPolicy":"Juggernaut and JT use inventory wave; Veznan appended after final campaign wave and has two6666HP phases.",
        "restoredFieldGroups":["difficulty HP including unknown nulls","ranged attacks and damage types","source melee values","all immunity sets","30 star upgrades","5 stage event definitions","12 stage feature sets","campaign tower unlock sequence","36 original mode rules","260 wave composition metrics"],
        "referenceProfilePolicy":"Preserve v14 unknown values. New Citadel challenge gold candidates fill only the runtime resolved field; Pagras Iron conflict retains v14 candidate. No star tier cap is treated as a tower-tier cap.",
        "referenceGeometryStages":len(geometry_by_stage),"starUpgradeDefinitions":len(star_upgrades),"sourceStageEvents":len(source_events),
        "entryLabeledWaveSlots":sum(s["observedEntryLabelsAvailable"] for s in selections),
    }
    sources=deepcopy(reference["sources"])+[deepcopy(NEW_SOURCE)]
    for source in (geometry or {}).get("sources",[]):
        if source.get("id") not in {s["id"] for s in sources}: sources.append(deepcopy(source))
    components={"damageTypes":[{"id":"physical","nameKo":"물리","reduction":"armor"},{"id":"magic","nameKo":"마법","reduction":"magicResistance"},{"id":"explosive","nameKo":"폭발","reduction":"half_armor"},{"id":"true","nameKo":"고정","reduction":"none"}],"stageFeatures":[{"id":k,"nameKo":v} for k,v in FEATURE_KO.items()],"enemyRoleNames":{"boss":"보스","air":"공중","armored":"중장갑","magic_resistant":"마법 저항","ranged":"원거리","healer":"치유","summoner":"소환","support":"지원","regenerator":"재생","explosive":"사망 폭발","runner":"가속","evasive":"근접 회피","frontline":"기본 병력"},"derivedMetricsNoteKo":"HP 합계와 골드는 선택한 최초 편성에서 계산했습니다. 회복·소환·묘지·후속 보스·조기 호출 보상은 포함하지 않습니다."}
    data={"version":"16.0.0","title":"Kingdom Rush · 재구성 플레이","world":{"width":1000,"height":620},"stages":stages,"enemies":enemies,"towers":towers,"abilities":skills,"starUpgrades":star_upgrades,"stageEvents":source_events,"enemyAppearances":enemy_appearances,"components":components,"sources":sources,"provenance":summary}
    provenance={**summary,"conflictDecisions":conflicts,"fieldDecisions":decisions,"waveSelections":selections,"customEnemySpeeds":SPEEDS,"customTowerRanges":RANGES,"customEnemyRangedRadii":RANGED_RADII,"sources":sources,"geometryEvidence":deepcopy(geometry)}
    return data,provenance

def validate(data, provenance, reference):
    assert len(data["stages"])==12
    assert len(data["enemies"])==34
    assert len(data["towers"])==20
    assert len(data["abilities"])==18
    assert len(provenance["waveSelections"])==260
    assert len(provenance["conflictDecisions"])==13
    assert len(data["starUpgrades"])==30
    assert len(data["stageEvents"])==5
    original_enemies={e["id"]:e for e in reference["enemies"]}
    for eid,enemy in data["enemies"].items():
        assert enemy["hpByDifficulty"]==original_enemies[eid]["hpByDifficulty"]
        assert enemy["sourceRanged"]==original_enemies[eid].get("ranged")
        assert enemy["sourceMelee"]==original_enemies[eid].get("melee")
        assert enemy["sourceBehaviors"]==original_enemies[eid].get("abilities",[])
    for original,upgrade in zip(reference["star_upgrades"],data["starUpgrades"]):
        assert original["effects"]==upgrade["effects"] and original["costStars"]==upgrade["costStars"]
    originals={x["id"]:x for x in reference["abilities"]}
    geometry=[]
    for aid,ability in data["abilities"].items():
        assert ability["values"]==[x["parameters"] for x in originals[aid]["levels"]],aid
    for stage in data["stages"]:
        source=next(x for x in reference["stages"] if x["id"]==stage["id"])
        for mode,waves in stage["waves"].items():
            assert len(waves)==source["modes"][mode]["waveCount"],(stage["id"],mode)
            assert len(stage["waveMetrics"][mode])==len(waves)
            assert stage["originalModes"][mode]["startingGold"]==source["modes"][mode]["startingGold"]
            for output_key,source_key in [("lives","startingLives"),("allowedFamilies","allowedBuildFamilies"),("heroAllowed","heroAllowed"),("starUpgradeTierCap","starUpgradeTierCap"),("maxTowerTier","maxTowerTier"),("preplacedRulesId","preplacedRulesId")]:
                assert stage["originalModes"][mode][output_key]==source["modes"][mode].get(source_key),(stage["id"],mode,source_key)
            for wave in waves:
                for g in wave:
                    assert g["enemy"] in data["enemies"],g
                    assert type(g["count"]) is int and g["count"]>0,g
                    assert 0<=g["path"]<len(stage["paths"]),g
                    if g["referencePath"] is not None:
                        assert isinstance(g["referencePath"],int) and 0<=g["referencePath"]<len(stage["referencePaths"]),(stage["id"],g)
                        if g["referencePathStatus"]=="mapped_observation_entry_label":
                            assert g["referencePath"]==stage["referenceGeometry"]["entryPathMap"][g["sourceEntryLabel"]],(stage["id"],g)
                        else:
                            assert len(stage["referencePaths"])==1 and g["referencePath"]==0,(stage["id"],g)
        lengths=[round(sum(math.dist(a,b) for a,b in zip(path,path[1:]))) for path in stage["paths"]]
        distances=[path_distance((p["x"],p["y"]),stage["paths"]) for p in stage["sites"]]
        assert min(lengths)>1100,(stage["id"],lengths)
        assert min(distances)>=38,(stage["id"],min(distances))
        assert max(distances)<=160,(stage["id"],max(distances))
        pads=[(p["x"],p["y"]) for p in stage["sites"]]
        assert all(35<=x<=965 and 35<=y<=585 for x,y in pads),stage["id"]
        assert min(math.dist(a,b) for i,a in enumerate(pads) for b in pads[i+1:])>=65,stage["id"]
        geometry.append({"stage":stage["id"],"pathLengthsPx":lengths,"pads":len(stage["sites"]),"padDistanceToRoadPx":[round(min(distances)),round(max(distances))]})
        if stage.get("referencePaths"):
            assert len(stage["referencePaths"])>0 and len(stage["referenceSites"])>0
            assert all(len(path)>1 and all(math.isfinite(float(v)) for p in path for v in p) for path in stage["referencePaths"])
            assert all(math.isfinite(float(p["x"])) and math.isfinite(float(p["y"])) for p in stage["referenceSites"])
            geometry[-1]["referencePathLengthsPx"]=[round(sum(math.dist(a,b) for a,b in zip(path,path[1:]))) for path in stage["referencePaths"]]
            geometry[-1]["referencePads"]=len(stage["referenceSites"])
            geometry[-1]["referenceStatus"]=stage["referenceGeometry"].get("status")
    for tower in data["towers"].values():
        assert tower["interval"]>0 and tower["range"]>0 and tower["cost"]>=0
        assert all(x in data["towers"] for x in tower["upgrades"])
        assert all(x in data["abilities"] for x in tower["abilities"])
    groups=[g for s in data["stages"] for waves in s["waves"].values() for wave in waves for g in wave]
    routing_counts=Counter(g["referencePathStatus"] for g in groups)
    reference_sites=[p for s in data["stages"] for p in s.get("referenceSites",[])]
    hp_values=[v for e in data["enemies"].values() for v in e["hpByDifficulty"].values()]
    return {"passed":True,"stages":12,"modes":36,"waveSlots":260,"waveInventoryCandidates":384,"waveConflictsRecorded":13,"selectedInitialEnemyInventory":sum(g["count"] for g in groups),"enemies":34,"knownDifficultyHpValues":sum(v is not None for v in hp_values),"unknownDifficultyHpValues":sum(v is None for v in hp_values),"rangedEnemyDefinitions":sum(e["ranged"] is not None for e in data["enemies"].values()),"enemiesWithExplicitImmunities":sum(bool(e["immunities"]) for e in data["enemies"].values()),"normalizedBehaviorTypes":sorted({b["type"] for e in data["enemies"].values() for b in e["behaviors"]}),"towerStates":20,"specialAbilities":18,"starUpgradeDefinitions":30,"stageEventDefinitions":5,"towerUnlockEvents":sum(len(s["unlockEvents"]) for s in data["stages"]),"sourceHpIncludingUnknownNullsPreserved":True,"sourceMeleeAndRangedPreserved":True,"sourceOriginalModeFieldsPreserved":True,"starUpgradeEffectsAndCostsPreserved":True,"abilityLevelParametersPreserved":True,"allSelectedWaveCountsPreserved":True,"waveMetricRows":sum(len(w) for s in data["stages"] for w in s["waveMetrics"].values()),"entryLabeledWaveSlots":sum(s["observedEntryLabelsAvailable"] for s in provenance["waveSelections"]),"waveGroups":len(groups),"waveGroupRoutingStatus":dict(sorted(routing_counts.items())),"observedLabelsMatchGeometryEntryPathMap":True,"referenceGeometryStages":sum(bool(s.get("referencePaths")) for s in data["stages"]),"referencePaths":sum(len(s.get("referencePaths",[])) for s in data["stages"]),"referenceRecordedSites":len(reference_sites),"referenceSiteTypes":dict(sorted(Counter(p["siteType"] for p in reference_sites).items())),"geometry":geometry}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",type=Path)
    args=parser.parse_args()
    ref_path=ROOT/"data"/"reference_v14.json"
    reference=import_reference(args.source) if args.source else json.loads(ref_path.read_text(encoding="utf-8"))
    geometry_path=ROOT/"data"/"geometry_reconstruction_v16.json"
    geometry=json.loads(geometry_path.read_text(encoding="utf-8")) if geometry_path.exists() else None
    data,provenance=build(reference,geometry)
    special_path=ROOT/"data"/"special-components-v17.json"
    special=json.loads(special_path.read_text(encoding="utf-8"))
    data["version"]="18.0.0"
    data["specialComponents"]=special
    known_source_ids={item["id"] for item in data["sources"]}
    data["sources"].extend(item for item in special["sources"] if item["id"] not in known_source_ids)
    for stage in data["stages"]:
        stage["specialComponentIds"]=[fid for fid,f in special["facilities"].items() if f["stageId"]==stage["id"]]
        stage["runtimeStageEventIds"]=[e["id"] for e in special["stageEvents"] if e["stageId"]==stage["id"] and e["runtime"]["enabled"]]
    component_summary={"datasetVersion":special["datasetVersion"],"facilityDefinitions":len(special["facilities"]),"timedStageEvents":len(special["stageEvents"]),"numericEvidence":"secondary_candidate","measuredInTargetBuild":False,"geometry":"v16 recorded sites plus explicit web route adaptation"}
    data["provenance"]["profileId"]="kr-v18-playability"
    data["provenance"]["specialComponents"]=component_summary
    provenance["profileId"]=data["provenance"]["profileId"]
    provenance["specialComponents"]=component_summary
    provenance["specialComponentEvidence"]=special
    report=validate(data,provenance,reference)
    assert len(special["facilities"])==2
    assert special["facilities"]["sylvan_elf_hall"]["sourceFacts"]["moveSpeed"] is None
    assert special["facilities"]["sunray_tower"]["runtime"]["repairCost"]==0
    report.update({"version":"18.0.0","playableSpecialFacilityTypes":2,"timedEventDefinitions":1,"sourceNullsStillPreserved":True})
    for directory in [ROOT/"src",ROOT/"data"]: directory.mkdir(exist_ok=True)
    if args.source: ref_path.write_text(json.dumps(reference,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    (ROOT/"src"/"data.js").write_text("/* v18 restoration: preserved v14 candidates, v16 geometry, special facilities and event evidence. See data/provenance.json. */\nglobalThis.KR_DATA = "+json.dumps(data,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
    for name,obj in [("provenance",provenance),("data-validation",report)]:
        (ROOT/"data"/(name+".json")).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (ROOT/"data"/"level-design-v18.json").write_text(json.dumps({"version":"18.0.0","metricSemantics":data["components"]["derivedMetricsNoteKo"],"stages":[{"id":s["id"],"nameKo":s["nameKo"],"levelDesign":s["levelDesign"],"waveMetrics":s["waveMetrics"],"unlockEvents":s["unlockEvents"],"originalModes":s["originalModes"],"availableTowerIdsAtStart":s["availableTowerIdsAtStart"]} for s in data["stages"]]},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    exports={
        "enemy-components-v18":{"version":"18.0.0","evidencePolicy":"Source candidates and runtime adapters are separate. Unknown source fields stay null; sourceMelee, sourceRanged, sourceBehaviors and hpByDifficulty retain v14 values.","enemies":list(data["enemies"].values()),"appearances":data["enemyAppearances"]},
        "tower-components-v18":{"version":"18.0.0","evidencePolicy":"Source attack, soldier and intrinsic-effect records retain v14 candidates; pixel ranges and documented fallback attack intervals are custom runtime values.","towers":list(data["towers"].values()),"abilities":list(data["abilities"].values())},
        "progression-components-v18":{"version":"18.0.0","evidencePolicy":"Thirty star-upgrade records preserve all source effects and costs. Data restoration does not itself certify complete runtime or original-build fidelity.","starUpgrades":data["starUpgrades"],"stageEvents":data["stageEvents"],"stageProgression":[{"stageId":s["id"],"prerequisiteStageId":s["prerequisiteStageId"],"availableTowerIdsAtStart":s["availableTowerIdsAtStart"],"unlockEvents":s["unlockEvents"],"features":s["features"],"originalModes":s["originalModes"]} for s in data["stages"]]},
    }
    for name,obj in exports.items():
        (ROOT/"data"/(name+".json")).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__": main()
